use game_components_embeddable_game_standard::registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_embeddable_game_standard::token::interface::IMinigameTokenMixinDispatcherTrait;
use openzeppelin_interfaces::erc2981::{IERC2981DispatcherTrait, IERC2981_ID};
use openzeppelin_interfaces::erc721::{
    IERC721DispatcherTrait, IERC721EnumerableDispatcher, IERC721EnumerableDispatcherTrait,
    IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait, IERC721_ENUMERABLE_ID, IERC721_ID,
};
use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use snforge_std::{CheatSpan, cheat_caller_address};
use starknet::ContractAddress;
use crate::tests::setup::{
    ALICE, BOB, CHARLIE, GAME_CREATOR, SALE_PRICE, TestContracts, register_game,
    setup_with_registry,
};

// ================================================================================================
// HELPER: mint a token for a registered game
// ================================================================================================

fn mint_token(tc: @TestContracts, game_id: u64, player: ContractAddress) -> felt252 {
    let game_metadata = (*tc.registry).game_metadata(game_id);

    cheat_caller_address(*tc.denshokan_address, player, CheatSpan::TargetCalls(1));
    (*tc.token_mixin)
        .mint(
            game_metadata.contract_address,
            Option::None, // player_name
            Option::None, // settings_id
            Option::None, // start_time
            Option::None, // end_time
            Option::None, // objective_id
            Option::None, // renderer_address
            Option::None, // extra_data
            Option::None, // extra_data_uri
            player,
            false, // is_soulbound
            false,
            0,
            0,
        )
}

// ================================================================================================
// ERC721 METADATA TESTS (name, symbol)
// ================================================================================================

#[test]
fn test_name_returns_denshokan() {
    let tc = setup_with_registry();

    let metadata = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let name = metadata.name();

    assert!(name == "Denshokan", "name() should return Denshokan");
}

#[test]
fn test_symbol_returns_dnsk() {
    let tc = setup_with_registry();

    let metadata = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let symbol = metadata.symbol();

    assert!(symbol == "DNSK", "symbol() should return DNSK");
}

// ================================================================================================
// ERC721 ENUMERABLE TESTS
// ================================================================================================

#[test]
fn test_total_supply_starts_at_zero() {
    let tc = setup_with_registry();

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };
    let total = enumerable.total_supply();

    assert!(total == 0, "total_supply should be 0 before any mints");
}

#[test]
fn test_total_supply_increases_after_mint() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };

    // Mint one token
    mint_token(@tc, game_id, ALICE());
    assert!(enumerable.total_supply() == 1, "total_supply should be 1 after first mint");

    // Register another game and mint a second token
    let (game_id_2, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame2", Option::None,
    );
    mint_token(@tc, game_id_2, BOB());
    assert!(enumerable.total_supply() == 2, "total_supply should be 2 after second mint");
}

#[test]
fn test_token_by_index_returns_correct_token() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };
    let indexed_token = enumerable.token_by_index(0);

    assert!(indexed_token == token_id.into(), "token_by_index(0) should return the minted token");
}

#[test]
#[should_panic]
fn test_token_by_index_out_of_bounds_panics() {
    let tc = setup_with_registry();

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };

    // No tokens minted, index 0 should panic
    enumerable.token_by_index(0);
}

#[test]
fn test_token_of_owner_by_index_returns_correct_token() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };
    let owner_token = enumerable.token_of_owner_by_index(ALICE(), 0);

    assert!(
        owner_token == token_id.into(),
        "token_of_owner_by_index(ALICE, 0) should return ALICE's token",
    );
}

#[test]
#[should_panic]
fn test_token_of_owner_by_index_out_of_bounds_panics() {
    let tc = setup_with_registry();

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };

    // ALICE has no tokens, index 0 should panic
    enumerable.token_of_owner_by_index(ALICE(), 0);
}

#[test]
fn test_token_of_owner_by_index_with_multiple_owners() {
    let tc = setup_with_registry();

    let (game_id_1, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let (game_id_2, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );

    let token_alice = mint_token(@tc, game_id_1, ALICE());
    let token_bob = mint_token(@tc, game_id_2, BOB());

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };

    // Each owner should have exactly 1 token at index 0
    let alice_token = enumerable.token_of_owner_by_index(ALICE(), 0);
    let bob_token = enumerable.token_of_owner_by_index(BOB(), 0);

    assert!(alice_token == token_alice.into(), "ALICE's token should match");
    assert!(bob_token == token_bob.into(), "BOB's token should match");

    // Verify total supply
    assert!(enumerable.total_supply() == 2, "total_supply should be 2");
}

#[test]
fn test_enumerable_updates_after_transfer() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    let enumerable = IERC721EnumerableDispatcher { contract_address: tc.denshokan_address };

    // Before transfer: ALICE owns 1 token
    assert!(
        enumerable.token_of_owner_by_index(ALICE(), 0) == token_id.into(),
        "ALICE should own the token before transfer",
    );

    // Transfer token from ALICE to BOB
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), BOB(), token_id.into());

    // After transfer: BOB should now own the token
    let bob_token = enumerable.token_of_owner_by_index(BOB(), 0);
    assert!(bob_token == token_id.into(), "BOB should own the token after transfer");

    // Total supply should not change after a transfer
    assert!(enumerable.total_supply() == 1, "total_supply should remain 1 after transfer");
}

// ================================================================================================
// SRC5 INTERFACE SUPPORT TESTS
// ================================================================================================

#[test]
fn test_supports_interface_src5() {
    let tc = setup_with_registry();

    let src5 = ISRC5Dispatcher { contract_address: tc.denshokan_address };

    // ISRC5 interface ID
    let isrc5_id: felt252 = 0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055;
    let supports_src5 = src5.supports_interface(isrc5_id);

    assert!(supports_src5, "Contract should support ISRC5 interface");
}

#[test]
fn test_supports_interface_erc721() {
    let tc = setup_with_registry();

    let src5 = ISRC5Dispatcher { contract_address: tc.denshokan_address };

    let supports_erc721 = src5.supports_interface(IERC721_ID);

    assert!(supports_erc721, "Contract should support IERC721 interface");
}

#[test]
fn test_supports_interface_erc2981() {
    let tc = setup_with_registry();

    let src5 = ISRC5Dispatcher { contract_address: tc.denshokan_address };

    let supports_erc2981 = src5.supports_interface(IERC2981_ID);

    assert!(supports_erc2981, "Contract should support IERC2981 interface");
}

#[test]
fn test_supports_interface_erc721_enumerable() {
    let tc = setup_with_registry();

    let src5 = ISRC5Dispatcher { contract_address: tc.denshokan_address };

    let supports_enumerable = src5.supports_interface(IERC721_ENUMERABLE_ID);

    assert!(supports_enumerable, "Contract should support IERC721Enumerable interface");
}

#[test]
fn test_does_not_support_random_interface() {
    let tc = setup_with_registry();

    let src5 = ISRC5Dispatcher { contract_address: tc.denshokan_address };

    let random_id: felt252 = 0xdeadbeef;
    let supports_random = src5.supports_interface(random_id);

    assert!(!supports_random, "Contract should not support a random interface ID");
}

// ================================================================================================
// ROYALTY TESTS - ZERO ROYALTY FRACTION
// ================================================================================================

#[test]
fn test_royalty_info_with_zero_royalty_fraction_game() {
    let tc = setup_with_registry();

    // Register a game with royalty_fraction = 0 (no royalties)
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "FreeGame", Option::Some(0),
    );

    let game_metadata = tc.registry.game_metadata(game_id);

    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    let token_id = tc
        .token_mixin
        .mint(
            game_metadata.contract_address,
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            ALICE(),
            false,
            false,
            0,
            0,
        );

    let (receiver, royalty_amount) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);

    // Receiver should still be the game creator (owner of game creator token)
    assert!(receiver == GAME_CREATOR(), "Receiver should be game creator even with 0 royalty");
    // Royalty amount should be 0 since royalty_fraction is 0
    assert!(royalty_amount == 0, "Royalty amount should be 0 for zero royalty fraction");
}

// ================================================================================================
// ERC721 APPROVAL AND OPERATOR TESTS
// ================================================================================================

#[test]
fn test_set_approval_for_all_and_is_approved_for_all() {
    let tc = setup_with_registry();

    // Initially, BOB should not be approved as operator for ALICE
    let is_approved_before = tc.erc721.is_approved_for_all(ALICE(), BOB());
    assert!(!is_approved_before, "BOB should not be approved initially");

    // ALICE sets BOB as operator
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.set_approval_for_all(BOB(), true);

    let is_approved_after = tc.erc721.is_approved_for_all(ALICE(), BOB());
    assert!(is_approved_after, "BOB should be approved after set_approval_for_all");

    // ALICE revokes BOB's operator approval
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.set_approval_for_all(BOB(), false);

    let is_approved_revoked = tc.erc721.is_approved_for_all(ALICE(), BOB());
    assert!(!is_approved_revoked, "BOB should not be approved after revocation");
}

#[test]
fn test_operator_can_transfer_token() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    // ALICE sets BOB as operator for all tokens
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.set_approval_for_all(BOB(), true);

    // BOB should be able to transfer ALICE's token
    cheat_caller_address(tc.denshokan_address, BOB(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), CHARLIE(), token_id.into());

    let new_owner = tc.erc721.owner_of(token_id.into());
    assert!(new_owner == CHARLIE(), "CHARLIE should own the token after operator transfer");
}

#[test]
fn test_approve_and_get_approved() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    // No approval initially
    let approved_before = tc.erc721.get_approved(token_id.into());
    let zero_address: ContractAddress = 0_felt252.try_into().unwrap();
    assert!(approved_before == zero_address, "No address should be approved initially");

    // ALICE approves BOB for this specific token
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.approve(BOB(), token_id.into());

    let approved_after = tc.erc721.get_approved(token_id.into());
    assert!(approved_after == BOB(), "BOB should be approved for the token");
}

#[test]
fn test_approved_address_can_transfer() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    // ALICE approves BOB
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.approve(BOB(), token_id.into());

    // BOB transfers the token
    cheat_caller_address(tc.denshokan_address, BOB(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), CHARLIE(), token_id.into());

    let new_owner = tc.erc721.owner_of(token_id.into());
    assert!(new_owner == CHARLIE(), "CHARLIE should own the token after approved transfer");
}

// ================================================================================================
// BALANCE OF TESTS
// ================================================================================================

#[test]
fn test_balance_of_zero_for_new_address() {
    let tc = setup_with_registry();

    let balance = tc.erc721.balance_of(ALICE());
    assert!(balance == 0, "Balance should be 0 for address with no tokens");
}

#[test]
fn test_balance_of_increases_after_mint() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    mint_token(@tc, game_id, ALICE());

    let balance = tc.erc721.balance_of(ALICE());
    assert!(balance == 1, "Balance should be 1 after minting one token");
}

#[test]
fn test_balance_of_updates_after_transfer() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    // Transfer from ALICE to BOB
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), BOB(), token_id.into());

    let alice_balance = tc.erc721.balance_of(ALICE());
    let bob_balance = tc.erc721.balance_of(BOB());

    assert!(alice_balance == 0, "ALICE balance should be 0 after transfer");
    assert!(bob_balance == 1, "BOB balance should be 1 after receiving token");
}

// ================================================================================================
// OWNER_OF TESTS
// ================================================================================================

#[test]
#[should_panic]
fn test_owner_of_nonexistent_token_panics() {
    let tc = setup_with_registry();

    // Token 12345 does not exist
    tc.erc721.owner_of(12345);
}

#[test]
fn test_owner_of_returns_minter() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    let token_id = mint_token(@tc, game_id, ALICE());

    let owner = tc.erc721.owner_of(token_id.into());
    assert!(owner == ALICE(), "owner_of should return the minter address");
}
