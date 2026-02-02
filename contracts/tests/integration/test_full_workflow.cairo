use game_components_registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_token::interface::IMinigameTokenMixinDispatcherTrait;
use openzeppelin_interfaces::erc2981::IERC2981DispatcherTrait;
use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
use snforge_std::{CheatSpan, cheat_caller_address};
use crate::helpers::constants::{ALICE, BOB, CUSTOM_ROYALTY_FRACTION, GAME_CREATOR, SALE_PRICE};
use crate::helpers::setup::{register_game, setup_with_registry};

// ================================================================================================
// FULL WORKFLOW INTEGRATION TESTS
// ================================================================================================

#[test]
fn test_complete_game_registration_and_token_lifecycle() {
    let tc = setup_with_registry();

    // Step 1: Game creator registers a game
    let (game_id, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "AwesomeGame",
        Option::Some(CUSTOM_ROYALTY_FRACTION),
    );

    // Verify game is registered
    let game_metadata = tc.registry.game_metadata(game_id);
    assert!(game_metadata.name == "AwesomeGame", "Game should be registered with correct name");
    assert!(
        game_metadata.royalty_fraction == CUSTOM_ROYALTY_FRACTION,
        "Game should have correct royalty fraction",
    );

    // Verify game creator owns the creator token
    let registry_erc721 = IERC721Dispatcher { contract_address: tc.registry.contract_address };
    let creator_token_owner = registry_erc721.owner_of(game_id.into());
    assert!(creator_token_owner == GAME_CREATOR(), "Game creator should own the creator token");

    // Step 2: Player (ALICE) mints a game instance token
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    let token_id = tc
        .token_mixin
        .mint(
            game_metadata.contract_address,
            Option::Some('Alice'),
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

    // Verify token metadata
    let token_metadata = tc.token_mixin.token_metadata(token_id);
    assert!(token_metadata.game_id == game_id, "Token should reference correct game");

    // Verify ALICE owns the game instance token
    let token_owner = tc.erc721.owner_of(token_id.into());
    assert!(token_owner == ALICE(), "ALICE should own the game instance token");

    // Step 3: Query royalty info - should point to game creator
    let (royalty_receiver, royalty_amount) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    assert!(
        royalty_receiver == GAME_CREATOR(), "Royalty receiver should be game creator token owner",
    );
    assert!(
        royalty_amount == (SALE_PRICE * CUSTOM_ROYALTY_FRACTION.into()) / 10000,
        "Royalty amount should be calculated correctly",
    );

    // Step 4: Game creator transfers their creator token to BOB
    let registry_erc721 = IERC721Dispatcher { contract_address: tc.registry.contract_address };
    cheat_caller_address(tc.registry.contract_address, GAME_CREATOR(), CheatSpan::TargetCalls(1));
    registry_erc721.transfer_from(GAME_CREATOR(), BOB(), game_id.into());

    // Verify BOB now owns the creator token
    let new_creator_owner = registry_erc721.owner_of(game_id.into());
    assert!(new_creator_owner == BOB(), "BOB should now own the creator token");

    // Step 5: Royalty receiver should now be BOB (dynamic receiver)
    let (new_royalty_receiver, new_royalty_amount) = tc
        .erc2981
        .royalty_info(token_id.into(), SALE_PRICE);
    assert!(
        new_royalty_receiver == BOB(), "Royalty receiver should update to new creator token owner",
    );
    assert!(
        new_royalty_amount == royalty_amount,
        "Royalty amount should remain the same (only receiver changes)",
    );

    // Step 6: Player can still transfer their game instance token
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), BOB(), token_id.into());

    // Verify BOB now owns the game instance token
    let final_token_owner = tc.erc721.owner_of(token_id.into());
    assert!(final_token_owner == BOB(), "BOB should now own the game instance token");

    // Step 7: Royalty still points to creator token owner (BOB)
    let (final_royalty_receiver, _) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    assert!(
        final_royalty_receiver == BOB(),
        "Royalty receiver should still be creator token owner (BOB)",
    );
}

#[test]
fn test_multiple_players_single_game() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "MultiplayerGame",
        Option::Some(CUSTOM_ROYALTY_FRACTION),
    );

    let game_metadata = tc.registry.game_metadata(game_id);

    // Multiple players mint tokens for the same game
    let players = array![ALICE(), BOB()];
    let mut token_ids: Array<felt252> = array![];

    let mut i: u32 = 0;
    while i < players.len() {
        let player = *players.at(i);

        cheat_caller_address(tc.denshokan_address, player, CheatSpan::TargetCalls(1));
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
                player,
                false,
                false,
                0,
                0,
            );

        token_ids.append(token_id);

        // Verify player owns their token
        let token_owner = tc.erc721.owner_of(token_id.into());
        assert!(token_owner == player, "Player should own their token");

        // Verify all tokens point to same game
        let token_metadata = tc.token_mixin.token_metadata(token_id);
        assert!(token_metadata.game_id == game_id, "Token should reference correct game");

        // Verify all tokens have same royalty receiver (game creator)
        let (royalty_receiver, _) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
        assert!(royalty_receiver == GAME_CREATOR(), "All tokens should have same royalty receiver");

        i += 1;
    }

    // Verify all tokens are unique
    assert!(*token_ids.at(0) != *token_ids.at(1), "Token IDs should be unique");
}

#[test]
fn test_game_creator_updates_royalty_fraction() {
    let tc = setup_with_registry();

    // Register a game with initial royalty
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::Some(500),
    ); // 5%

    // Mint a token
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

    // Verify initial royalty
    let (_, initial_royalty) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    let expected_initial = (SALE_PRICE * 500_u256) / 10000;
    assert!(initial_royalty == expected_initial, "Initial royalty should be 5%");

    // Game creator updates royalty fraction to 10%
    cheat_caller_address(tc.registry.contract_address, GAME_CREATOR(), CheatSpan::TargetCalls(1));
    tc.registry.set_game_royalty(game_id, 1000);

    // Verify updated royalty
    let (_, updated_royalty) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    let expected_updated = (SALE_PRICE * 1000_u256) / 10000;
    assert!(updated_royalty == expected_updated, "Updated royalty should be 10%");

    // Verify receiver is still the same
    let (receiver, _) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    assert!(receiver == GAME_CREATOR(), "Royalty receiver should remain the same");
}

#[test]
fn test_concurrent_game_registrations() {
    let tc = setup_with_registry();

    // Note: setup_with_registry already registers 1 default game (game_id 1)

    // Multiple creators register games
    let creators = array![GAME_CREATOR(), ALICE(), BOB()];
    let mut game_ids: Array<u64> = array![];

    let mut i: u32 = 0;
    while i < creators.len() {
        let creator = *creators.at(i);

        let (game_id, _, _) = register_game(
            tc.registry,
            tc.denshokan_address,
            creator,
            format!("Game{}", i),
            Option::Some(500 + (i.into() * 100)) // Different royalties
        );

        game_ids.append(game_id);

        // Game IDs should increment (starting from 2 since setup registered game 1)
        assert!(game_id == (i.into() + 2), "Game IDs should increment from 2");

        i += 1;
    }

    // Verify all games are unique
    assert!(*game_ids.at(0) != *game_ids.at(1), "Game IDs should be unique");
    assert!(*game_ids.at(1) != *game_ids.at(2), "Game IDs should be unique");
    assert!(*game_ids.at(0) != *game_ids.at(2), "Game IDs should be unique");

    // Verify game count (1 from setup + 3 from this test)
    let total_games = tc.registry.game_count();
    assert!(total_games == 4, "Should have 4 registered games");
}
