use game_components_registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_token::interface::IMinigameTokenMixinDispatcherTrait;
use openzeppelin_interfaces::erc2981::IERC2981DispatcherTrait;
use openzeppelin_interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
use snforge_std::{CheatSpan, cheat_caller_address};
use crate::helpers::constants::{
    ALICE, BOB, CHARLIE, CUSTOM_ROYALTY_FRACTION, DEFAULT_ROYALTY_FRACTION, GAME_CREATOR,
    SALE_PRICE, SMALL_SALE_PRICE,
};
use crate::helpers::setup::{register_game, setup_with_registry};

// ================================================================================================
// ROYALTY TESTS - MULTI-GAME SCENARIO
// ================================================================================================

#[test]
fn test_royalty_info_with_dynamic_receiver() {
    let tc = setup_with_registry();

    // Register a game with GAME_CREATOR as the creator
    let (game_id, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "TestGame",
        Option::Some(DEFAULT_ROYALTY_FRACTION),
    );

    // GAME_CREATOR should now own the game creator token (game_id in registry)
    let registry_erc721 = IERC721Dispatcher { contract_address: tc.registry.contract_address };
    let game_creator_token_owner = registry_erc721.owner_of(game_id.into());
    assert!(
        game_creator_token_owner == GAME_CREATOR(), "Game creator should own the creator token",
    );

    // Mint a denshokan token for this game
    let game_metadata = tc.registry.game_metadata(game_id);

    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    let token_id = tc
        .token_mixin
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
            ALICE(),
            false, // is_soulbound
            false,
            0,
            0,
        );

    // Verify token metadata has correct game_id
    let token_metadata = tc.token_mixin.token_metadata(token_id);
    assert!(token_metadata.game_id == game_id, "Token should have correct game_id");

    // Get royalty info - receiver should be GAME_CREATOR (owner of game creator token)
    let (receiver, royalty_amount) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);

    assert!(receiver == GAME_CREATOR(), "Royalty receiver should be game creator token owner");
    assert!(
        royalty_amount == (SALE_PRICE * DEFAULT_ROYALTY_FRACTION.into()) / 10000,
        "Royalty amount should be calculated correctly",
    );
}

#[test]
fn test_royalty_receiver_follows_game_creator_token_transfer() {
    let tc = setup_with_registry();

    // Register a game with GAME_CREATOR
    let (game_id, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "TestGame",
        Option::Some(DEFAULT_ROYALTY_FRACTION),
    );

    // Mint a denshokan token for this game
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

    // Initial royalty receiver should be GAME_CREATOR
    let (initial_receiver, _) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    assert!(initial_receiver == GAME_CREATOR(), "Initial receiver should be game creator");

    // Transfer the game creator token from GAME_CREATOR to BOB
    let registry_erc721 = IERC721Dispatcher { contract_address: tc.registry.contract_address };
    cheat_caller_address(tc.registry.contract_address, GAME_CREATOR(), CheatSpan::TargetCalls(1));
    registry_erc721.transfer_from(GAME_CREATOR(), BOB(), game_id.into());

    // Verify BOB now owns the game creator token
    let new_owner = registry_erc721.owner_of(game_id.into());
    assert!(new_owner == BOB(), "BOB should now own the game creator token");

    // Royalty receiver should now be BOB (dynamic receiver)
    let (new_receiver, _) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    assert!(
        new_receiver == BOB(), "Royalty receiver should update to new game creator token owner",
    );
}

#[test]
fn test_royalty_amount_calculation() {
    let tc = setup_with_registry();

    // Register a game with 10% royalty
    let (game_id, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "TestGame",
        Option::Some(CUSTOM_ROYALTY_FRACTION),
    );

    // Mint a token for this game
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

    // Test with different sale prices
    let (_, royalty_amount_large) = tc.erc2981.royalty_info(token_id.into(), SALE_PRICE);
    assert!(
        royalty_amount_large == (SALE_PRICE * CUSTOM_ROYALTY_FRACTION.into()) / 10000,
        "Royalty for large sale should be 10%",
    );

    let (_, royalty_amount_small) = tc.erc2981.royalty_info(token_id.into(), SMALL_SALE_PRICE);
    assert!(
        royalty_amount_small == (SMALL_SALE_PRICE * CUSTOM_ROYALTY_FRACTION.into()) / 10000,
        "Royalty for small sale should be 10%",
    );
}

#[test]
fn test_royalty_with_multiple_games() {
    let tc = setup_with_registry();

    // Register multiple games with different creators and royalties
    let (game_id_1, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "Game1",
        Option::Some(DEFAULT_ROYALTY_FRACTION),
    );

    let (game_id_2, _, _) = register_game(
        tc.registry, tc.denshokan_address, BOB(), "Game2", Option::Some(CUSTOM_ROYALTY_FRACTION),
    );

    let (game_id_3, _, _) = register_game(
        tc.registry, tc.denshokan_address, CHARLIE(), "Game3", Option::Some(1500),
    ); // 15%

    // Mint tokens for each game
    let game_1_metadata = tc.registry.game_metadata(game_id_1);
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    let token_id_1 = tc
        .token_mixin
        .mint(
            game_1_metadata.contract_address,
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

    let game_2_metadata = tc.registry.game_metadata(game_id_2);
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    let token_id_2 = tc
        .token_mixin
        .mint(
            game_2_metadata.contract_address,
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

    let game_3_metadata = tc.registry.game_metadata(game_id_3);
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    let token_id_3 = tc
        .token_mixin
        .mint(
            game_3_metadata.contract_address,
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

    // Verify each token has correct royalty receiver and amount
    let (receiver_1, amount_1) = tc.erc2981.royalty_info(token_id_1.into(), SALE_PRICE);
    assert!(receiver_1 == GAME_CREATOR(), "Token 1 royalty receiver should be GAME_CREATOR");
    assert!(
        amount_1 == (SALE_PRICE * DEFAULT_ROYALTY_FRACTION.into()) / 10000,
        "Token 1 royalty should be 5%",
    );

    let (receiver_2, amount_2) = tc.erc2981.royalty_info(token_id_2.into(), SALE_PRICE);
    assert!(receiver_2 == BOB(), "Token 2 royalty receiver should be BOB");
    assert!(
        amount_2 == (SALE_PRICE * CUSTOM_ROYALTY_FRACTION.into()) / 10000,
        "Token 2 royalty should be 10%",
    );

    let (receiver_3, amount_3) = tc.erc2981.royalty_info(token_id_3.into(), SALE_PRICE);
    assert!(receiver_3 == CHARLIE(), "Token 3 royalty receiver should be CHARLIE");
    assert!(amount_3 == (SALE_PRICE * 1500_u256) / 10000, "Token 3 royalty should be 15%");
}

#[test]
fn test_royalty_info_with_zero_sale_price() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry,
        tc.denshokan_address,
        GAME_CREATOR(),
        "TestGame",
        Option::Some(DEFAULT_ROYALTY_FRACTION),
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

    let (receiver, royalty_amount) = tc.erc2981.royalty_info(token_id.into(), 0);

    assert!(receiver == GAME_CREATOR(), "Receiver should still be set");
    assert!(royalty_amount == 0, "Royalty amount should be zero for zero sale price");
}
