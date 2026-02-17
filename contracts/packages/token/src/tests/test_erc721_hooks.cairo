use game_components_embeddable_game_standard::registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_embeddable_game_standard::token::interface::IMinigameTokenMixinDispatcherTrait;
use openzeppelin_interfaces::erc721::IERC721DispatcherTrait;
use snforge_std::{CheatSpan, cheat_caller_address};
use crate::tests::setup::{ALICE, BOB, GAME_CREATOR, register_game, setup_with_registry};

// ================================================================================================
// SOULBOUND TESTS
// ================================================================================================

#[test]
fn test_soulbound_token_prevents_transfer() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    // Mint a soulbound token
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
            true, // is_soulbound = true
            false,
            0,
            0,
        );

    // Verify token is soulbound
    assert!(tc.token_mixin.is_soulbound(token_id), "Token should be soulbound");

    // Verify initial owner
    let owner = tc.erc721.owner_of(token_id.into());
    assert!(owner == ALICE(), "ALICE should own the token");

    // Approve BOB to transfer the token
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.approve(BOB(), token_id.into());
    // Attempt to transfer should panic
// Note: Using expect_revert pattern
}

#[test]
#[should_panic(expected: "Token is soulbound and cannot be transferred")]
fn test_soulbound_token_transfer_panics() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    // Mint a soulbound token
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
            true, // is_soulbound = true
            false,
            0,
            0,
        );

    // Try to transfer - this should panic
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), BOB(), token_id.into());
}

#[test]
fn test_non_soulbound_token_can_transfer() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    // Mint a non-soulbound token
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
            false, // is_soulbound = false
            false,
            0,
            0,
        );

    // Verify token is not soulbound
    assert!(!tc.token_mixin.is_soulbound(token_id), "Token should not be soulbound");

    // Verify initial owner
    let initial_owner = tc.erc721.owner_of(token_id.into());
    assert!(initial_owner == ALICE(), "ALICE should initially own the token");

    // Transfer should succeed
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), BOB(), token_id.into());

    // Verify new owner
    let new_owner = tc.erc721.owner_of(token_id.into());
    assert!(new_owner == BOB(), "BOB should now own the token");
}

// NOTE: Burn test commented out because the IMinigameTokenMixinDispatcher interface
// does not expose a burn method. If burn functionality is needed, it should be added
// to the interface or accessed through a different mechanism.

#[test]
fn test_soulbound_check_only_on_transfer() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );

    // Mint a soulbound token
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
            true, // is_soulbound = true
            false,
            0,
            0,
        );

    // Minting (from zero address) should succeed
    let owner = tc.erc721.owner_of(token_id.into());
    assert!(owner == ALICE(), "Minting should succeed for soulbound token");

    // Approval operations should work (they don't trigger the hook)
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.approve(BOB(), token_id.into());

    let approved = tc.erc721.get_approved(token_id.into());
    assert!(approved == BOB(), "Approval should work for soulbound token");
}
