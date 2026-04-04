#[test_only]
module powerlay_tribe_stash::tribe_stash_tests;

use std::{string::utf8, unit_test::assert_eq};
use sui::{clock, test_scenario as ts};
use world::{
    access::{AdminACL, OwnerCap},
    character::{Self, Character},
    energy::EnergyConfig,
    inventory,
    network_node::{Self, NetworkNode},
    object_registry::ObjectRegistry,
    storage_unit::{Self, StorageUnit},
    test_helpers::{Self, admin, user_a, user_b, tenant},
};
use powerlay_tribe_stash::tribe_stash::{Self, TribeStashConfig};

// -----------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------

const CHARACTER_A_ITEM_ID: u32 = 1234u32;
const CHARACTER_B_ITEM_ID: u32 = 5678u32;
const STORAGE_A_ITEM_ID: u64 = 90002;
const STORAGE_A_TYPE_ID: u64 = 5555;
const MAX_CAPACITY: u64 = 100000;
const LOCATION_HASH: vector<u8> =
    x"7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b7a8f3b2e9c4d1a6f5e8b2d9c3f7a1e5b";

const TRIBE_ID: u64 = 42;
const STASH_NAME: vector<u8> = b"Alpha Stash";
const ENCRYPTED_LOCATION: vector<u8> = b"DEADBEEFCAFE";

const AMMO_ITEM_ID: u64 = 1000004145107;
const AMMO_TYPE_ID: u64 = 88069;
const AMMO_VOLUME: u64 = 100;
const AMMO_QUANTITY: u32 = 10;

const LENS_ITEM_ID: u64 = 1000004145108;
const LENS_TYPE_ID: u64 = 88070;
const LENS_VOLUME: u64 = 50;
const LENS_QUANTITY: u32 = 5;

const NWN_ITEM_ID: u64 = 5000;
const NWN_TYPE_ID: u64 = 111000;
const FUEL_MAX_CAPACITY: u64 = 1000;
const FUEL_BURN_RATE_IN_MS: u64 = 3600 * 1000;
const MAX_PRODUCTION: u64 = 100;
const FUEL_TYPE_ID: u64 = 1;
const FUEL_VOLUME: u64 = 10;

// -----------------------------------------------------------------------
// Setup helpers
// -----------------------------------------------------------------------

fun setup_nwn(ts: &mut ts::Scenario) {
    test_helpers::setup_world(ts);
    test_helpers::configure_assembly_energy(ts);
    test_helpers::register_server_address(ts);
}

fun create_character(ts: &mut ts::Scenario, user: address, item_id: u32): ID {
    ts::next_tx(ts, admin());
    let admin_acl = ts::take_shared<AdminACL>(ts);
    let mut registry = ts::take_shared<ObjectRegistry>(ts);
    let character = character::create_character(
        &mut registry,
        &admin_acl,
        item_id,
        tenant(),
        100,
        user,
        utf8(b"player"),
        ts.ctx(),
    );
    let id = object::id(&character);
    character.share_character(&admin_acl, ts.ctx());
    ts::return_shared(registry);
    ts::return_shared(admin_acl);
    id
}

fun create_storage_unit(ts: &mut ts::Scenario, character_id: ID): (ID, ID) {
    let nwn_id = {
        ts::next_tx(ts, admin());
        let mut registry = ts::take_shared<ObjectRegistry>(ts);
        let character = ts::take_shared_by_id<Character>(ts, character_id);
        let admin_acl = ts::take_shared<AdminACL>(ts);
        let nwn = network_node::anchor(
            &mut registry, &character, &admin_acl,
            NWN_ITEM_ID, NWN_TYPE_ID, LOCATION_HASH,
            FUEL_MAX_CAPACITY, FUEL_BURN_RATE_IN_MS, MAX_PRODUCTION, ts.ctx(),
        );
        let id = object::id(&nwn);
        nwn.share_network_node(&admin_acl, ts.ctx());
        ts::return_shared(admin_acl);
        ts::return_shared(character);
        ts::return_shared(registry);
        id
    };

    let su_id = {
        ts::next_tx(ts, admin());
        let mut registry = ts::take_shared<ObjectRegistry>(ts);
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        let character = ts::take_shared_by_id<Character>(ts, character_id);
        let admin_acl = ts::take_shared<AdminACL>(ts);
        let su = storage_unit::anchor(
            &mut registry, &mut nwn, &character, &admin_acl,
            STORAGE_A_ITEM_ID, STORAGE_A_TYPE_ID, MAX_CAPACITY, LOCATION_HASH, ts.ctx(),
        );
        let id = object::id(&su);
        su.share_storage_unit(&admin_acl, ts.ctx());
        ts::return_shared(admin_acl);
        ts::return_shared(character);
        ts::return_shared(registry);
        ts::return_shared(nwn);
        id
    };

    (su_id, nwn_id)
}

fun online_storage_unit(
    ts: &mut ts::Scenario,
    user: address,
    character_id: ID,
    su_id: ID,
    nwn_id: ID,
) {
    let clock = clock::create_for_testing(ts.ctx());

    ts::next_tx(ts, user);
    let mut character = ts::take_shared_by_id<Character>(ts, character_id);
    let (nwn_cap, nwn_receipt) = character.borrow_owner_cap<NetworkNode>(
        ts::most_recent_receiving_ticket<OwnerCap<NetworkNode>>(&character_id),
        ts.ctx(),
    );

    ts::next_tx(ts, user);
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        nwn.deposit_fuel_test(&nwn_cap, FUEL_TYPE_ID, FUEL_VOLUME, 10, &clock);
        ts::return_shared(nwn);
    };

    ts::next_tx(ts, user);
    {
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        nwn.online(&nwn_cap, &clock);
        ts::return_shared(nwn);
    };

    character.return_owner_cap(nwn_cap, nwn_receipt);

    ts::next_tx(ts, user);
    {
        let mut su = ts::take_shared_by_id<StorageUnit>(ts, su_id);
        let mut nwn = ts::take_shared_by_id<NetworkNode>(ts, nwn_id);
        let energy_config = ts::take_shared<EnergyConfig>(ts);
        let (su_cap, su_receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
            ts.ctx(),
        );
        su.online(&mut nwn, &energy_config, &su_cap);
        character.return_owner_cap(su_cap, su_receipt);
        ts::return_shared(su);
        ts::return_shared(nwn);
        ts::return_shared(energy_config);
    };

    ts::return_shared(character);
    clock.destroy_for_testing();
}

/// Call register_stash via borrow-cap pattern; returns the shared TribeStashConfig ID.
fun do_register_stash(
    ts: &mut ts::Scenario,
    user: address,
    character_id: ID,
    su_id: ID,
): ID {
    ts::next_tx(ts, user);
    {
        let mut su = ts::take_shared_by_id<StorageUnit>(ts, su_id);
        let mut character = ts::take_shared_by_id<Character>(ts, character_id);
        let (cap, receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
            ts.ctx(),
        );
        tribe_stash::register_stash(
            &mut su, &cap, TRIBE_ID, utf8(STASH_NAME), ENCRYPTED_LOCATION, ts.ctx(),
        );
        character.return_owner_cap(cap, receipt);
        ts::return_shared(character);
        ts::return_shared(su);
    };

    ts::next_tx(ts, admin());
    let config = ts::take_shared<TribeStashConfig>(ts);
    let config_id = object::id(&config);
    ts::return_shared(config);
    config_id
}

/// Mint items into SSU owner's main inventory (test-only world function requires online SSU).
fun mint_to_main(
    ts: &mut ts::Scenario,
    user: address,
    character_id: ID,
    su_id: ID,
    item_id: u64,
    type_id: u64,
    volume: u64,
    quantity: u32,
) {
    ts::next_tx(ts, user);
    let mut su = ts::take_shared_by_id<StorageUnit>(ts, su_id);
    let mut character = ts::take_shared_by_id<Character>(ts, character_id);
    let (cap, receipt) = character.borrow_owner_cap<StorageUnit>(
        ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
        ts.ctx(),
    );
    su.game_item_to_chain_inventory_test<StorageUnit>(
        &character, &cap, item_id, type_id, volume, quantity, ts.ctx(),
    );
    character.return_owner_cap(cap, receipt);
    ts::return_shared(character);
    ts::return_shared(su);
}

/// Withdraw item from owner's main inventory and deposit into the tribe stash open slot.
fun move_main_to_stash(
    ts: &mut ts::Scenario,
    user: address,
    character_id: ID,
    su_id: ID,
    config_id: ID,
    type_id: u64,
    quantity: u32,
) {
    ts::next_tx(ts, user);
    let config = ts::take_shared_by_id<TribeStashConfig>(ts, config_id);
    let mut su = ts::take_shared_by_id<StorageUnit>(ts, su_id);
    let mut character = ts::take_shared_by_id<Character>(ts, character_id);
    let (cap, receipt) = character.borrow_owner_cap<StorageUnit>(
        ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&character_id),
        ts.ctx(),
    );
    let item = su.withdraw_by_owner(&character, &cap, type_id, quantity, ts.ctx());
    tribe_stash::deposit(&config, &mut su, &character, item, ts.ctx());
    character.return_owner_cap(cap, receipt);
    ts::return_shared(character);
    ts::return_shared(su);
    ts::return_shared(config);
}

// -----------------------------------------------------------------------
// Success tests
// -----------------------------------------------------------------------

#[test]
fun register_stash_creates_config() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, admin());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        assert!(tribe_stash::is_active(&config));
        assert_eq!(tribe_stash::tribe_id(&config), TRIBE_ID);
        assert_eq!(tribe_stash::owner_address(&config), user_a());
        assert_eq!(tribe_stash::storage_unit_id(&config), object::id_address(&su));
        assert_eq!(*tribe_stash::display_name(&config), utf8(STASH_NAME));
        assert_eq!(tribe_stash::withdraw_role(&config), 0u8);
        ts::return_shared(su);
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
fun deposit_single_item() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    mint_to_main(&mut ts, user_a(), char_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);
    move_main_to_stash(&mut ts, user_a(), char_id, su_id, config_id, AMMO_TYPE_ID, AMMO_QUANTITY);

    ts::next_tx(&mut ts, admin());
    {
        let su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let open_key = storage_unit::open_storage_key(&su);
        assert_eq!(su.inventory(open_key).item_quantity(AMMO_TYPE_ID), AMMO_QUANTITY);
        ts::return_shared(su);
    };
    ts::end(ts);
}

#[test]
fun deposit_all_items() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    mint_to_main(&mut ts, user_a(), char_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);
    mint_to_main(&mut ts, user_a(), char_id, su_id, LENS_ITEM_ID, LENS_TYPE_ID, LENS_VOLUME, LENS_QUANTITY);

    ts::next_tx(&mut ts, user_a());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_id);
        let (cap, receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&char_id),
            ts.ctx(),
        );
        let ammo = su.withdraw_by_owner(&character, &cap, AMMO_TYPE_ID, AMMO_QUANTITY, ts.ctx());
        let lens = su.withdraw_by_owner(&character, &cap, LENS_TYPE_ID, LENS_QUANTITY, ts.ctx());
        tribe_stash::deposit_all(&config, &mut su, &character, vector[ammo, lens], ts.ctx());
        character.return_owner_cap(cap, receipt);
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };

    ts::next_tx(&mut ts, admin());
    {
        let su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let open_key = storage_unit::open_storage_key(&su);
        let open_inv = su.inventory(open_key);
        assert_eq!(open_inv.item_quantity(AMMO_TYPE_ID), AMMO_QUANTITY);
        assert_eq!(open_inv.item_quantity(LENS_TYPE_ID), LENS_QUANTITY);
        ts::return_shared(su);
    };
    ts::end(ts);
}

#[test]
fun withdraw_from_stash() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    mint_to_main(&mut ts, user_a(), char_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);
    move_main_to_stash(&mut ts, user_a(), char_id, su_id, config_id, AMMO_TYPE_ID, AMMO_QUANTITY);

    ts::next_tx(&mut ts, user_a());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_id);
        let item = tribe_stash::withdraw(&config, &mut su, &character, AMMO_TYPE_ID, AMMO_QUANTITY, ts.ctx());
        // Re-deposit to main so Item resource is properly consumed
        let (cap, receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&char_id),
            ts.ctx(),
        );
        su.deposit_by_owner(item, &character, &cap, ts.ctx());
        character.return_owner_cap(cap, receipt);
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };

    ts::next_tx(&mut ts, admin());
    {
        let su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let open_key = storage_unit::open_storage_key(&su);
        // After full withdrawal the type_id entry is removed from the inventory.
        assert!(!inventory::contains_item(su.inventory(open_key), AMMO_TYPE_ID));
        ts::return_shared(su);
    };
    ts::end(ts);
}

#[test]
fun transfer_to_player_creates_owned_slot() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_a_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let char_b_id = create_character(&mut ts, user_b(), CHARACTER_B_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_a_id);
    online_storage_unit(&mut ts, user_a(), char_a_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_a_id, su_id);

    mint_to_main(&mut ts, user_a(), char_a_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);
    move_main_to_stash(&mut ts, user_a(), char_a_id, su_id, config_id, AMMO_TYPE_ID, AMMO_QUANTITY);

    // Transfer from stash to character_b who has never interacted with this SSU
    ts::next_tx(&mut ts, user_a());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let char_a = ts::take_shared_by_id<Character>(&ts, char_a_id);
        let char_b = ts::take_shared_by_id<Character>(&ts, char_b_id);
        tribe_stash::transfer_to_player(
            &config, &mut su, &char_a, &char_b, AMMO_TYPE_ID, AMMO_QUANTITY, ts.ctx(),
        );
        ts::return_shared(char_b);
        ts::return_shared(char_a);
        ts::return_shared(su);
        ts::return_shared(config);
    };

    // Verify character_b's owned slot was created and has the ammo
    ts::next_tx(&mut ts, admin());
    {
        let su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let char_b = ts::take_shared_by_id<Character>(&ts, char_b_id);
        let char_b_cap_id = char_b.owner_cap_id();
        assert!(su.has_inventory(char_b_cap_id));
        assert_eq!(su.inventory(char_b_cap_id).item_quantity(AMMO_TYPE_ID), AMMO_QUANTITY);
        ts::return_shared(char_b);
        ts::return_shared(su);
    };
    ts::end(ts);
}

#[test]
fun set_withdraw_role_updates() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        tribe_stash::set_withdraw_role(&mut config, 1u8, ts.ctx());
        assert_eq!(tribe_stash::withdraw_role(&config), 1u8);
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
fun update_location_replaces_bytes() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        tribe_stash::update_location(&mut config, b"NEWLOCATION", ts.ctx());
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
fun deregister_stash_deactivates() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        tribe_stash::deregister_stash(
            &mut config, &mut su, &character, vector[], vector[], ts.ctx(),
        );
        assert!(!tribe_stash::is_active(&config));
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
fun deregister_stash_drains_items_to_owner() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    mint_to_main(&mut ts, user_a(), char_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);
    move_main_to_stash(&mut ts, user_a(), char_id, su_id, config_id, AMMO_TYPE_ID, AMMO_QUANTITY);

    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        tribe_stash::deregister_stash(
            &mut config, &mut su, &character,
            vector[AMMO_TYPE_ID], vector[AMMO_QUANTITY], ts.ctx(),
        );
        assert!(!tribe_stash::is_active(&config));
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };

    // Verify owner's owned slot has ammo back
    ts::next_tx(&mut ts, admin());
    {
        let su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let char = ts::take_shared_by_id<Character>(&ts, char_id);
        let char_cap_id = char.owner_cap_id();
        assert_eq!(su.inventory(char_cap_id).item_quantity(AMMO_TYPE_ID), AMMO_QUANTITY);
        ts::return_shared(char);
        ts::return_shared(su);
    };
    ts::end(ts);
}

// -----------------------------------------------------------------------
// Failure tests — abort happens before cleanup; cleanup code is present
// for the compiler but never executes at runtime.
// -----------------------------------------------------------------------

#[test]
#[expected_failure(abort_code = tribe_stash::EEmptyItems)]
fun deposit_all_fails_on_empty_vector() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_a());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        tribe_stash::deposit_all(&config, &mut su, &character, vector[], ts.ctx());
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = tribe_stash::EInvalidRole)]
fun set_withdraw_role_fails_on_invalid_value() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        tribe_stash::set_withdraw_role(&mut config, 99u8, ts.ctx());
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = tribe_stash::ENotOwner)]
fun set_withdraw_role_fails_for_non_owner() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_b());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        tribe_stash::set_withdraw_role(&mut config, 1u8, ts.ctx());
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = tribe_stash::ENotOwner)]
fun update_location_fails_for_non_owner() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, _) = create_storage_unit(&mut ts, char_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    ts::next_tx(&mut ts, user_b());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        tribe_stash::update_location(&mut config, b"HACK", ts.ctx());
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = tribe_stash::ENotActive)]
fun deposit_fails_when_stash_inactive() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    // Deregister
    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        tribe_stash::deregister_stash(&mut config, &mut su, &character, vector[], vector[], ts.ctx());
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };

    mint_to_main(&mut ts, user_a(), char_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);

    // Attempt deposit — aborts with ENotActive
    ts::next_tx(&mut ts, user_a());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let mut character = ts::take_shared_by_id<Character>(&ts, char_id);
        let (cap, receipt) = character.borrow_owner_cap<StorageUnit>(
            ts::most_recent_receiving_ticket<OwnerCap<StorageUnit>>(&char_id),
            ts.ctx(),
        );
        let item = su.withdraw_by_owner(&character, &cap, AMMO_TYPE_ID, AMMO_QUANTITY, ts.ctx());
        tribe_stash::deposit(&config, &mut su, &character, item, ts.ctx());
        character.return_owner_cap(cap, receipt);
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };
    ts::end(ts);
}

#[test]
#[expected_failure(abort_code = tribe_stash::ENotActive)]
fun withdraw_fails_when_stash_inactive() {
    let mut ts = ts::begin(test_helpers::governor());
    setup_nwn(&mut ts);
    let char_id = create_character(&mut ts, user_a(), CHARACTER_A_ITEM_ID);
    let (su_id, nwn_id) = create_storage_unit(&mut ts, char_id);
    online_storage_unit(&mut ts, user_a(), char_id, su_id, nwn_id);
    let config_id = do_register_stash(&mut ts, user_a(), char_id, su_id);

    mint_to_main(&mut ts, user_a(), char_id, su_id, AMMO_ITEM_ID, AMMO_TYPE_ID, AMMO_VOLUME, AMMO_QUANTITY);
    move_main_to_stash(&mut ts, user_a(), char_id, su_id, config_id, AMMO_TYPE_ID, AMMO_QUANTITY);

    // Deregister with full drain
    ts::next_tx(&mut ts, user_a());
    {
        let mut config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        tribe_stash::deregister_stash(
            &mut config, &mut su, &character,
            vector[AMMO_TYPE_ID], vector[AMMO_QUANTITY], ts.ctx(),
        );
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };

    // Attempt withdraw — aborts with ENotActive before returning Item.
    // cleanup code after the call is for the compiler; never runs at runtime.
    ts::next_tx(&mut ts, user_a());
    {
        let config = ts::take_shared_by_id<TribeStashConfig>(&ts, config_id);
        let mut su = ts::take_shared_by_id<StorageUnit>(&ts, su_id);
        let character = ts::take_shared_by_id<Character>(&ts, char_id);
        let item = tribe_stash::withdraw(
            &config, &mut su, &character, AMMO_TYPE_ID, AMMO_QUANTITY, ts.ctx(),
        );
        // Never reached — ENotActive abort fires above.
        // public_transfer consumes item (key+store) so the compiler is satisfied.
        transfer::public_transfer(item, user_a());
        ts::return_shared(character);
        ts::return_shared(su);
        ts::return_shared(config);
    };
    ts::end(ts);
}
