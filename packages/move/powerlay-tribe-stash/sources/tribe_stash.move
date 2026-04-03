/// Powerlay Shared Tribe Stash — a dedicated clan inventory extension for EVE Frontier SSUs.
///
/// This package is a sibling to `powerlay_storage` and is intended for clans that want
/// a named, registry-tracked stash with finer-grained access control placeholders and
/// atomic drain-on-close semantics.
///
/// DESIGN PRINCIPLE — SHARED OPEN INVENTORY:
/// All tribe operations use the same extension-gated open inventory slot on the SSU,
/// consistent with `powerlay_storage`. Any caller with a `TribeStashAuth` witness
/// reads and writes the same slot — deposits from all members are pooled together.
///
/// PRIVACY MODEL FOR SYSTEM LOCATION:
/// Move is a transparent VM — every shared object field is readable by anyone via RPC.
/// The raw solar system name is NEVER stored in plaintext. `system_location_encrypted`
/// holds an opaque byte payload (AES-GCM, XOR, or any symmetric cipher chosen by the
/// Powerlay backend). The symmetric key is distributed off-chain to verified tribe
/// members only (Powerlay backend, JWT-gated). Non-members see unintelligible bytes.
/// This is an application-layer privacy model, not VM-enforced cryptographic access control.
///
/// WITHDRAW ROLE (MVP):
/// `withdraw_role` is stored on-chain and readable by the backend, but NOT enforced
/// by Move itself in this version. The Powerlay backend refuses to generate/sign
/// withdraw PTBs for non-officers when `withdraw_role == WITHDRAW_ROLE_OFFICERS`.
/// TODO: enforce on-chain once a tribe membership / officer oracle is available.
///
/// Entry points:
///   - register_stash       — authorize extension, create shared TribeStashConfig
///   - deposit              — single-item deposit to open (shared) inventory
///   - deposit_all          — multi-item deposit (caller assembles vector via PTB)
///   - withdraw             — withdraw by type+quantity from open inventory
///   - transfer_to_player   — withdraw from stash, deposit directly to another character
///   - set_withdraw_role    — owner-only: update RBAC role flag
///   - update_location      — owner-only: replace encrypted system location bytes
///   - drain_to_owner       — owner-only: withdraw specific items back to owner's slot
///   - deregister_stash     — owner-only: drain items + deactivate (atomic)
///
/// OwnerCap note — Character-owned caps (common on real Frontier SSUs):
/// On real Frontier SSUs the `OwnerCap<StorageUnit>` is often owned by the Character
/// object, not the wallet. In that case `register_stash` must be called inside a PTB:
///
/// ```
/// // PTB pseudo-code:
/// let (cap, receipt) = character::borrow_owner_cap<StorageUnit>(character_obj, owner_cap_id);
/// tribe_stash::register_stash(&mut storage_unit, &cap, tribe_id, name, location_enc);
/// character::return_owner_cap<StorageUnit>(character_obj, cap, receipt);
/// ```
///
/// MVP scope — intentionally simple:
/// - No per-item accounting in Move.
/// - RBAC stored but not enforced on-chain.
/// - Tribe membership enforced at the Powerlay app/backend layer.
/// - Extension revocation on deregister is deferred.
module powerlay_tribe_stash::tribe_stash {

    // -----------------------------------------------------------------------
    // Imports — verified against world-contracts source and powerlay_storage patterns
    //   authorize_extension: 2 args (no ctx)
    //   deposit_item:               5 args, auth passed as value — deposits to character slot
    //   deposit_to_open_inventory:  5 args, auth passed as value — writes to OPEN shared slot
    //   withdraw_from_open_inventory: 6 args, returns Item       — reads from OPEN shared slot
    // -----------------------------------------------------------------------
    use world::storage_unit::{
        StorageUnit,
        authorize_extension,
        deposit_to_open_inventory,
        deposit_to_owned,
        withdraw_from_open_inventory,
    };
    use world::access::OwnerCap;
    use world::inventory::Item;
    use world::character::Character;
    use std::string::String;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /// Default withdraw role — all tribe members may withdraw from the stash.
    /// Tribe membership itself is enforced at the backend layer.
    const WITHDRAW_ROLE_ALL: u8 = 0;

    /// Officers-only withdraw role. Stored on-chain; backend enforces in MVP.
    /// TODO: enforce on-chain once a tribe officer oracle is available.
    const WITHDRAW_ROLE_OFFICERS: u8 = 1;

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    /// One-time witness — extension identity for the Tribe Stash package.
    /// Passed as a value (`_: TribeStashAuth`) into deposit/withdraw calls
    /// and as a type parameter to `authorize_extension<TribeStashAuth>`.
    public struct TribeStashAuth has drop {}

    /// Per-SSU tribe stash configuration object, shared on-chain.
    /// Created by `register_stash`, deactivated by `deregister_stash`.
    ///
    /// See module doc comment for privacy model and RBAC notes.
    public struct TribeStashConfig has key, store {
        id: UID,
        /// On-chain object ID of the connected StorageUnit (SSU).
        storage_unit_id: address,
        /// Numeric tribe ID from the EVE Frontier Character object.
        tribe_id: u64,
        /// Wallet address that called `register_stash`.
        owner_address: address,
        /// Human-readable stash label. Public — visible to anyone on-chain.
        display_name: String,
        /// Encrypted solar system location. Opaque bytes; decryption key held off-chain.
        /// May be empty (`vector[]`) if the owner declines to register a location.
        /// Intentionally has no public Move accessor — see module privacy model doc.
        system_location_encrypted: vector<u8>,
        /// When false, all deposit/withdraw/transfer/drain operations abort.
        active: bool,
        /// Withdraw access role. See WITHDRAW_ROLE_* constants.
        /// MVP: stored only; enforcement is at the backend layer.
        withdraw_role: u8,
    }

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    /// Stash config is deactivated — all mutating operations are blocked.
    const ENotActive: u64 = 0;
    /// Caller is not the registered owner of this stash config.
    const ENotOwner: u64 = 1;
    /// The StorageUnit passed does not match the one recorded in this config.
    const EBadStorageUnit: u64 = 2;
    /// `deposit_all` or `drain_to_owner` called with mismatched or empty vectors.
    const EEmptyItems: u64 = 3;
    /// `set_withdraw_role` called with an unrecognised role value.
    const EInvalidRole: u64 = 4;
    /// `drain_to_owner` / `deregister_stash` called with type_ids and quantities of different lengths.
    const ELengthMismatch: u64 = 5;

    // -----------------------------------------------------------------------
    // Entry functions
    // -----------------------------------------------------------------------

    /// Authorise the TribeStash extension on `storage_unit` and create a shared
    /// `TribeStashConfig` recording this SSU as a clan stash.
    ///
    /// `display_name`              — public UTF-8 label shown in the Powerlay UI.
    /// `system_location_encrypted` — encrypted solar system location bytes.
    ///                               Pass `vector[]` to omit. See module privacy doc.
    /// `tribe_id`                  — numeric tribe ID from the caller's Character.
    ///
    /// `owner_cap` — if Character-owned, wrap in a PTB borrow/return_owner_cap block.
    public fun register_stash(
        storage_unit: &mut StorageUnit,
        owner_cap: &OwnerCap<StorageUnit>,
        tribe_id: u64,
        display_name: String,
        system_location_encrypted: vector<u8>,
        ctx: &mut TxContext,
    ) {
        // Register TribeStashAuth witness type on the SSU.
        // Signature: authorize_extension<Auth>(storage_unit, owner_cap)  — no ctx.
        authorize_extension<TribeStashAuth>(storage_unit, owner_cap);

        let config = TribeStashConfig {
            id: object::new(ctx),
            storage_unit_id: object::id_address(storage_unit),
            tribe_id,
            owner_address: ctx.sender(),
            display_name,
            system_location_encrypted,
            active: true,
            withdraw_role: WITHDRAW_ROLE_ALL,
        };
        transfer::share_object(config);
    }

    /// Deposit a single item into the stash's open (shared) inventory.
    ///
    /// Uses `deposit_to_open_inventory<TribeStashAuth>` — the extension-gated shared slot.
    /// All tribe members depositing here share one logical inventory pool.
    ///
    /// `character` — the depositing player's Character object (required by world-contracts).
    /// `item`      — Item resource taken from the caller's possession.
    ///
    /// Tribe-membership enforcement is at the Powerlay app/backend layer for MVP.
    public fun deposit(
        config: &TribeStashConfig,
        storage_unit: &mut StorageUnit,
        character: &Character,
        item: Item,
        ctx: &mut TxContext,
    ) {
        assert!(config.active, ENotActive);

        deposit_to_open_inventory<TribeStashAuth>(
            storage_unit,
            character,
            item,
            TribeStashAuth {},
            ctx,
        );
    }

    /// Deposit all items from a caller-assembled vector into the stash's open inventory.
    ///
    /// EVE Frontier world-contracts expose no on-chain iteration over a character's inventory,
    /// so the caller must construct `items` via a Programmable Transaction Block (PTB):
    ///   withdraw each item → collect into vector → call deposit_all.
    ///
    /// Aborts with EEmptyItems if `items` is empty.
    public fun deposit_all(
        config: &TribeStashConfig,
        storage_unit: &mut StorageUnit,
        character: &Character,
        items: vector<Item>,
        ctx: &mut TxContext,
    ) {
        assert!(config.active, ENotActive);
        assert!(!vector::is_empty(&items), EEmptyItems);

        // Item is a resource (no drop, no copy) — consume each element by moving it out.
        let mut items = items;
        while (!vector::is_empty(&items)) {
            let item = vector::pop_back(&mut items);
            deposit_to_open_inventory<TribeStashAuth>(
                storage_unit,
                character,
                item,
                TribeStashAuth {},
                ctx,
            );
        };
        vector::destroy_empty(items);
    }

    /// Withdraw items of `type_id` from the stash's open (shared) inventory.
    ///
    /// Returns the withdrawn `Item` resource — caller is responsible for depositing it
    /// into their own inventory or passing it on.
    ///
    /// `withdraw_role` check is intentionally absent in MVP — backend enforces it.
    /// TODO: enforce on-chain once a tribe membership oracle is available.
    ///
    /// Aborts if the open inventory slot has never been initialised (no deposit has
    /// occurred yet) — same behaviour as `powerlay_storage::shared_withdraw`.
    public fun withdraw(
        config: &TribeStashConfig,
        storage_unit: &mut StorageUnit,
        character: &Character,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ): Item {
        assert!(config.active, ENotActive);

        withdraw_from_open_inventory<TribeStashAuth>(
            storage_unit,
            character,
            TribeStashAuth {},
            type_id,
            quantity,
            ctx,
        )
    }

    /// Withdraw items from the stash and deposit directly into another player's personal
    /// inventory slot on the same SSU, without the recipient needing to sign the transaction.
    ///
    /// Uses `deposit_to_owned<TribeStashAuth>` which:
    ///   - Routes items into the recipient's personal slot (keyed by their owner_cap_id).
    ///   - Creates the slot automatically on first use — the recipient does NOT need to
    ///     have interacted with this SSU before.
    ///
    /// `character`           — the caller's Character object (signs the transaction).
    /// `recipient_character` — the recipient's Character object (immutable ref; does not sign).
    public fun transfer_to_player(
        config: &TribeStashConfig,
        storage_unit: &mut StorageUnit,
        character: &Character,
        recipient_character: &Character,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ) {
        assert!(config.active, ENotActive);
        assert!(object::id_address(storage_unit) == config.storage_unit_id, EBadStorageUnit);

        let item = withdraw_from_open_inventory<TribeStashAuth>(
            storage_unit,
            character,
            TribeStashAuth {},
            type_id,
            quantity,
            ctx,
        );

        // deposit_to_owned deposits to the recipient's personal slot (character.owner_cap_id()).
        // Creates the slot on first use — no prior interaction with this SSU required.
        deposit_to_owned<TribeStashAuth>(
            storage_unit,
            recipient_character,
            item,
            TribeStashAuth {},
            ctx,
        );
    }

    /// Update the withdraw access role for this stash (owner-only).
    ///
    /// Valid values: WITHDRAW_ROLE_ALL (0), WITHDRAW_ROLE_OFFICERS (1).
    ///
    /// MVP: stored but NOT enforced on-chain. The Powerlay backend inspects
    /// `config.withdraw_role` via RPC before issuing withdraw PTBs to users.
    /// TODO: enforce on-chain once a tribe officer oracle is available.
    public fun set_withdraw_role(
        config: &mut TribeStashConfig,
        role: u8,
        ctx: &TxContext,
    ) {
        assert!(config.owner_address == ctx.sender(), ENotOwner);
        assert!(role == WITHDRAW_ROLE_ALL || role == WITHDRAW_ROLE_OFFICERS, EInvalidRole);
        config.withdraw_role = role;
    }

    /// Replace the encrypted system location bytes (owner-only).
    ///
    /// Call this when the stash SSU is moved to a different solar system.
    /// The new ciphertext must be encrypted with the current tribe key (or the backend
    /// must re-distribute an updated key to tribe members alongside this call).
    public fun update_location(
        config: &mut TribeStashConfig,
        system_location_encrypted: vector<u8>,
        ctx: &TxContext,
    ) {
        assert!(config.owner_address == ctx.sender(), ENotOwner);
        config.system_location_encrypted = system_location_encrypted;
    }

    /// Withdraw a specific list of items from the stash and deposit them into the
    /// owner's character slot on the same SSU (owner-only).
    ///
    /// Designed for use before closing the stash, or for the owner to reclaim items
    /// without deactivating. After deregistration the backend can redistribute items
    /// to individual tribe members.
    ///
    /// `type_ids` and `quantities` must be the same length (ELengthMismatch).
    /// `type_ids` must be non-empty (EEmptyItems).
    ///
    /// LIMITATION: Move has no on-chain iteration over inventory contents. The caller
    /// must read the stash contents off-chain via RPC and build the drain lists in a PTB.
    ///
    /// NOTE: All items are drained to the owner's slot. Redistribution to individual
    /// tribe members is handled by the backend after deregistration. Member addresses
    /// are unknown on-chain.
    public fun drain_to_owner(
        config: &TribeStashConfig,
        storage_unit: &mut StorageUnit,
        owner_character: &Character,
        type_ids: vector<u64>,
        quantities: vector<u32>,
        ctx: &mut TxContext,
    ) {
        assert!(config.active, ENotActive);
        assert!(config.owner_address == ctx.sender(), ENotOwner);
        assert!(!vector::is_empty(&type_ids), EEmptyItems);
        assert!(vector::length(&type_ids) == vector::length(&quantities), ELengthMismatch);

        drain_items_to_character(
            storage_unit,
            owner_character,
            type_ids,
            quantities,
            ctx,
        );
    }

    /// Atomically drain items from the stash to the owner's slot, then deactivate
    /// the stash config (owner-only).
    ///
    /// ATOMICITY: drain + deactivation happen in one transaction — there is no window
    /// where items remain in the stash while the stash is already deactivated and
    /// inaccessible to tribe members.
    ///
    /// CALLER FLOW:
    ///   1. Read stash contents off-chain via RPC (world-contracts has no on-chain iteration).
    ///   2. Build `type_ids` and `quantities` vectors.
    ///   3. Call `deregister_stash` in a single PTB.
    ///
    /// Pass empty vectors if the stash is already empty.
    ///
    /// After deregistration the backend redistributes the drained items to tribe members
    /// via follow-up transfers or manual handoff.
    ///
    /// TODO (future): call `revoke_extension_authorization(storage_unit, owner_cap)` here
    ///                once the owner_cap borrow pattern is fully wired in deregister PTBs.
    public fun deregister_stash(
        config: &mut TribeStashConfig,
        storage_unit: &mut StorageUnit,
        owner_character: &Character,
        type_ids: vector<u64>,
        quantities: vector<u32>,
        ctx: &mut TxContext,
    ) {
        assert!(config.owner_address == ctx.sender(), ENotOwner);
        assert!(vector::length(&type_ids) == vector::length(&quantities), ELengthMismatch);

        // Drain any remaining items to the owner's slot before locking the stash.
        if (!vector::is_empty(&type_ids)) {
            drain_items_to_character(
                storage_unit,
                owner_character,
                type_ids,
                quantities,
                ctx,
            );
        };

        config.active = false;
    }

    // -----------------------------------------------------------------------
    // Read helpers
    // -----------------------------------------------------------------------

    public fun is_active(config: &TribeStashConfig): bool { config.active }
    public fun tribe_id(config: &TribeStashConfig): u64 { config.tribe_id }
    public fun storage_unit_id(config: &TribeStashConfig): address { config.storage_unit_id }
    public fun owner_address(config: &TribeStashConfig): address { config.owner_address }
    public fun display_name(config: &TribeStashConfig): &String { &config.display_name }
    public fun withdraw_role(config: &TribeStashConfig): u8 { config.withdraw_role }

    // NOTE: `system_location_encrypted` intentionally has NO public Move accessor.
    // Returning the raw bytes from a Move function makes them just as visible as the
    // field itself (Move is transparent — all shared object fields are readable via RPC
    // regardless). Omitting the accessor makes the privacy intent explicit in the API.

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /// Iterates (type_id, quantity) pairs, withdrawing each from the open inventory
    /// and depositing into `target_character`'s slot on the SSU.
    ///
    /// Consumes both vectors; both must have the same length (caller asserts before calling).
    fun drain_items_to_character(
        storage_unit: &mut StorageUnit,
        target_character: &Character,
        mut type_ids: vector<u64>,
        mut quantities: vector<u32>,
        ctx: &mut TxContext,
    ) {
        // pop_back processes from the end; order does not matter for draining.
        while (!vector::is_empty(&type_ids)) {
            let type_id = vector::pop_back(&mut type_ids);
            let quantity = vector::pop_back(&mut quantities);

            let item = withdraw_from_open_inventory<TribeStashAuth>(
                storage_unit,
                target_character,
                TribeStashAuth {},
                type_id,
                quantity,
                ctx,
            );
            deposit_to_owned<TribeStashAuth>(
                storage_unit,
                target_character,
                item,
                TribeStashAuth {},
                ctx,
            );
        };
        vector::destroy_empty(type_ids);
        vector::destroy_empty(quantities);
    }
}
