/// Powerlay shared tribe storage extension for EVE Frontier StorageUnits.
///
/// DESIGN PRINCIPLE — SHARED-STORAGE-FIRST:
/// A Powerlay-connected SSU is a SHARED TRIBE STASH. The owner, tribe members,
/// and (later) contract deliveries all interact with the SAME OPEN inventory
/// via `shared_deposit` and `shared_withdraw`.
///
/// OPEN inventory is the extension-gated shared slot in world-contracts:
/// `deposit_to_open_inventory<PowerlayAuth>` / `withdraw_from_open_inventory<PowerlayAuth>`.
/// Any caller holding a valid PowerlayAuth witness writes and reads the same slot —
/// owner, tribe members, and contract deliveries all share one on-chain inventory.
///
/// Note: the in-game UI may only surface the owner's main storage and ephemeral
/// per-character slots. Open inventory items are best read via Powerlay app / RPC.
///
/// If the owner wants an isolated inventory not visible in-game, that belongs on
/// a SEPARATE SSU without this extension.
///
/// Entry points:
///   - connect_storage                      — authorize extension, create shared StorageConfig
///   - shared_deposit / shared_withdraw     — OPEN (shared) inventory
///   - deliver_personal_to_owner_primary    — deliverer personal slot → owner primary (contracts MVP)
///   - disconnect_storage                 — deactivate shared config (owner-only guard)
///
/// Contract delivery (MVP) — separate from open inventory:
/// `deliver_personal_to_owner_primary` moves items from the deliverer's per-character
/// SSU slot (`withdraw_by_owner<Character>`) into the SSU owner's primary inventory
/// (`deposit_item<PowerlayAuth>`). Requires `authorize_extension<PowerlayAuth>` (same as connect).
///
/// Open stash path remains `shared_deposit` / `shared_withdraw` on the open inventory.
///
/// Note: `world::storage_unit` still exposes `deposit_by_owner` / `withdraw_by_owner`
/// (primary inventory). The game client may use those independently; this package does
/// not disable them. Powerlay unifies on the open slot via the functions above.
///
/// MVP scope — intentionally simple:
/// - No per-item accounting in Move.
/// - No RBAC or role / DAO permission system.
/// - No reward logic.
/// - Tribe membership is enforced at the Powerlay app/backend layer, not in Move.
///
/// # OwnerCap note — Character-owned caps (common on real Frontier SSUs)
///
/// On real Frontier SSUs the `OwnerCap<StorageUnit>` is often owned by the
/// **Character object**, not the wallet address.  In that case `connect_storage`
/// must be called inside a PTB that first borrows the cap:
///
/// ```
/// // PTB pseudo-code (built in storageTransactionBuilder.ts):
/// let (cap, receipt) = character::borrow_owner_cap<StorageUnit>(character_obj, owner_cap_id);
/// powerlay_storage::connect_storage(&mut storage_unit, &cap, tribe_id);
/// character::return_owner_cap<StorageUnit>(character_obj, cap, receipt);
/// ```
///
/// See `data/help_db/ssu-extension-and-deposit-paths.md` for full investigation notes.
module powerlay_storage::powerlay_storage {

    // -----------------------------------------------------------------------
    // Imports — verified against world-contracts source (March 2026)
    //   world::access   (module name is `access`, not `access_control`)
    //   world::inventory::Item  (not generic — no <T>)
    //   world::character::Character (needed by deposit/withdraw)
    //   authorize_extension: 2 args (no ctx)
    //   deposit_to_open_inventory:    5 args, Auth passed as value — writes to OPEN (shared) inventory
    //   withdraw_from_open_inventory: 6 args, returns Item         — reads from OPEN (shared) inventory
    //
    // OPEN inventory is the extension-gated shared slot: all callers with PowerlayAuth
    // read/write the same slot, regardless of which character is passed.
    // -----------------------------------------------------------------------
    use world::storage_unit::{
        StorageUnit,
        authorize_extension,
        deposit_item,
        deposit_to_open_inventory,
        withdraw_by_owner,
        withdraw_from_open_inventory,
    };
    use world::access::OwnerCap;
    use world::inventory::Item;
    use world::character::Character;

    // -----------------------------------------------------------------------
    // Constants
    // -----------------------------------------------------------------------

    /// Shared tribe storage — the only storage mode in this phase.
    /// All Powerlay-connected SSUs operate in this mode.
    /// Stored on-chain in StorageConfig for future RBAC / multi-mode extensions.
    const MODE_SHARED_TRIBE_STORAGE: u8 = 0;

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    /// One-time witness — extension identity for Powerlay.
    /// Passed as a **value** (`_: PowerlayAuth`) into deposit/withdraw calls
    /// and as a **type parameter** to `authorize_extension<PowerlayAuth>`.
    public struct PowerlayAuth has drop {}

    /// Per-SSU shared configuration object, shared on-chain.
    /// Created by `connect_storage`, deactivated by `disconnect_storage`.
    ///
    /// This object represents one Powerlay-managed SSU operating as shared tribe
    /// storage. The owner, tribe members, and future contract deliveries all
    /// interact with the same OPEN (extension-gated shared) inventory on this SSU
    /// when using `shared_deposit` / `shared_withdraw`.
    public struct StorageConfig has key, store {
        id: UID,
        /// On-chain object ID of the connected StorageUnit.
        storage_unit_id: address,
        /// Numeric tribe ID from the EVE Frontier Character object.
        tribe_id: u64,
        /// Wallet address that authorised this connection.
        owner_address: address,
        /// When false, all shared_deposit / shared_withdraw calls abort.
        active: bool,
        /// Storage mode — always MODE_SHARED_TRIBE_STORAGE in this phase.
        /// Reserved for future RBAC tiers and multi-mode extensions.
        mode: u8,
    }

    // -----------------------------------------------------------------------
    // Errors
    // -----------------------------------------------------------------------

    const ENotActive: u64 = 0;
    const ENotOwner: u64 = 1;
    const EBadStorageUnit: u64 = 2;

    // -----------------------------------------------------------------------
    // Entry functions
    // -----------------------------------------------------------------------

    /// Authorise the Powerlay extension on `storage_unit` and create a shared
    /// `StorageConfig` that marks this SSU as shared tribe storage.
    ///
    /// After this call, Powerlay's intended flow is shared open inventory: owner and
    /// tribe members should use `shared_deposit` / `shared_withdraw` for one shared slot.
    /// The underlying world module may still allow the owner to use primary inventory
    /// via native game flows (`deposit_by_owner` / `withdraw_by_owner`); that is outside
    /// this extension's control.
    ///
    /// `owner_cap` — if Character-owned, wrap this call in borrow/return_owner_cap PTB
    ///               (see module doc comment above).
    public fun connect_storage(
        storage_unit: &mut StorageUnit,
        owner_cap: &OwnerCap<StorageUnit>,
        tribe_id: u64,
        ctx: &mut TxContext,
    ) {
        // Register Powerlay witness type on the SSU.
        // Signature: authorize_extension<Auth>(storage_unit, owner_cap)  — no ctx.
        authorize_extension<PowerlayAuth>(storage_unit, owner_cap);

        let config = StorageConfig {
            id: object::new(ctx),
            storage_unit_id: object::id_address(storage_unit),
            tribe_id,
            owner_address: ctx.sender(),
            active: true,
            mode: MODE_SHARED_TRIBE_STORAGE,
        };
        transfer::share_object(config);
    }

    /// Deposit an item into the SSU's open (shared) inventory via the Powerlay extension path.
    ///
    /// This is THE Powerlay deposit path for ALL callers: tribe members, the owner,
    /// and future contract deliveries — all use the same open inventory slot.
    /// (The owner may still have a separate primary inventory in-game; use this for
    /// the shared stash.)
    ///
    /// `character` — the depositing player's on-chain Character object (required by world-contracts).
    /// `item`      — the Item to deposit (obtained from the player's inventory).
    ///
    /// Tribe-membership enforcement is at the Powerlay app/backend layer for this MVP.
    ///
    /// TODO (future): emit a deposit event for audit / contract-tracking integration.
    public fun shared_deposit(
        config: &StorageConfig,
        storage_unit: &mut StorageUnit,
        character: &Character,
        item: Item,
        ctx: &mut TxContext,
    ) {
        assert!(config.active, ENotActive);

        // deposit_to_open_inventory<Auth> writes to the shared "open" inventory slot —
        // accessible by all callers with the correct Auth witness (owner, tribe members, contracts).
        // Signature: deposit_to_open_inventory<Auth>(storage_unit, character, item, _: Auth, _: &mut TxContext)
        deposit_to_open_inventory<PowerlayAuth>(
            storage_unit,
            character,
            item,
            PowerlayAuth {},
            ctx,
        );
    }

    /// Withdraw items from the SSU's open (shared) inventory via the Powerlay extension path.
    ///
    /// This is THE Powerlay withdraw path for ALL callers: tribe members, the owner,
    /// and future contract deliveries — same open inventory as `shared_deposit`.
    /// Fails with `EOpenStorageNotInitialized` until the open slot has been created
    /// by at least one successful deposit to open inventory.
    ///
    /// `character` — the withdrawing player's on-chain Character object.
    /// `type_id`   — the in-game item type ID to withdraw.
    /// `quantity`  — how many units to withdraw.
    ///
    /// Returns the withdrawn `Item`.
    ///
    /// TODO (future): officer-only withdrawal guard (RBAC phase).
    /// TODO (future): reserved/contract-bound inventory check before withdrawal.
    /// TODO (future): emit a withdrawal event for audit / contract-tracking integration.
    public fun shared_withdraw(
        config: &StorageConfig,
        storage_unit: &mut StorageUnit,
        character: &Character,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ): Item {
        assert!(config.active, ENotActive);

        // withdraw_from_open_inventory<Auth> reads from the shared "open" inventory slot —
        // the same slot all extension callers write to via deposit_to_open_inventory.
        // Signature: withdraw_from_open_inventory<Auth>(storage_unit, character, _: Auth, type_id, quantity, ctx): Item
        withdraw_from_open_inventory<PowerlayAuth>(
            storage_unit,
            character,
            PowerlayAuth {},
            type_id,
            quantity,
            ctx,
        )
    }

    /// Contract delivery MVP: withdraw from the deliverer's **personal** SSU inventory
    /// (per-character slot keyed by `OwnerCap<Character>`) and deposit into the SSU
    /// **owner's primary** inventory (same slot as `deposit_by_owner` / in-game owner view).
    ///
    /// Preconditions:
    /// - `config.active` and `config.storage_unit_id` matches `storage_unit`.
    /// - `authorize_extension<PowerlayAuth>` was called on this SSU (`connect_storage`).
    /// - `deliverer_character.character_address() == ctx.sender()` (deliverer signs).
    /// - `deliverer_character_cap` is `OwnerCap<Character>` for that character — typically
    ///   `object::id(deliverer_character_cap) == deliverer_character.owner_cap_id()` on-chain.
    /// - Items must already sit in the deliverer's personal slot (in-game deposit to SSU).
    ///
    /// Payout tokens are **not** moved here — Powerlay app settlement is HTTP (`POST …/deliveries`).
    public fun deliver_personal_to_owner_primary(
        config: &StorageConfig,
        storage_unit: &mut StorageUnit,
        deliverer_character: &Character,
        deliverer_character_cap: &OwnerCap<Character>,
        type_id: u64,
        quantity: u32,
        ctx: &mut TxContext,
    ) {
        assert!(config.active, ENotActive);
        assert!(object::id_address(storage_unit) == config.storage_unit_id, EBadStorageUnit);

        let item = withdraw_by_owner<Character>(
            storage_unit,
            deliverer_character,
            deliverer_character_cap,
            type_id,
            quantity,
            ctx,
        );
        deposit_item<PowerlayAuth>(
            storage_unit,
            deliverer_character,
            item,
            PowerlayAuth {},
            ctx,
        );
    }

    /// Deactivate the `StorageConfig`, blocking all further Powerlay operations
    /// (shared_deposit and shared_withdraw for tribe members, owner, and contracts).
    ///
    /// Since there is only one shared path, deactivating the config suspends the
    /// entire shared stash. The SSU itself is not destroyed.
    ///
    /// On-chain extension revocation is deferred — the `active` flag is sufficient for MVP.
    ///
    /// TODO (future): call `revoke_extension_authorization(storage_unit, owner_cap)` here
    ///                once the owner_cap borrow pattern is fully wired in disconnect PTBs.
    public fun disconnect_storage(
        config: &mut StorageConfig,
        ctx: &TxContext,
    ) {
        assert!(config.owner_address == ctx.sender(), ENotOwner);
        config.active = false;
    }

    // -----------------------------------------------------------------------
    // Read helpers
    // -----------------------------------------------------------------------

    public fun is_active(config: &StorageConfig): bool { config.active }
    public fun tribe_id(config: &StorageConfig): u64 { config.tribe_id }
    public fun storage_unit_id(config: &StorageConfig): address { config.storage_unit_id }
    public fun mode(config: &StorageConfig): u8 { config.mode }
}
