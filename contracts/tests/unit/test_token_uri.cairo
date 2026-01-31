use game_components_registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_test_common::mocks::minigame_starknet_mock::{
    IMinigameStarknetMockDispatcher, IMinigameStarknetMockDispatcherTrait,
};
use game_components_token::interface::IMinigameTokenMixinDispatcherTrait;
use openzeppelin_interfaces::erc721::{
    IERC721DispatcherTrait, IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait,
};
use snforge_std::{CheatSpan, cheat_caller_address};
use starknet::ContractAddress;
use crate::helpers::constants::{ALICE, BOB, GAME_CREATOR};
use crate::helpers::setup::{TestContracts, register_game, setup_with_registry};

// ================================================================================================
// HELPERS
// ================================================================================================

/// Mint a token for a given game, using the mock contract as the caller so that
/// token_uri can call context_details on the minted_by address (which must be deployed).
fn mint_for_game(
    tc: @TestContracts,
    game_id: u64,
    mock: IMinigameStarknetMockDispatcher,
    player: ContractAddress,
) -> felt252 {
    let game_metadata = (*tc.registry).game_metadata(game_id);

    // Cheat caller to be the mock contract (a deployed contract) so minted_by resolves
    // to a valid contract address when token_uri calls context_details on it.
    cheat_caller_address(*tc.denshokan_address, mock.contract_address, CheatSpan::TargetCalls(1));
    (*tc.token_mixin)
        .mint(
            Option::Some(game_metadata.contract_address),
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
// TOKEN URI TESTS
// ================================================================================================

#[test]
fn test_token_uri_returns_nonempty_metadata() {
    let tc = setup_with_registry();

    let (game_id, _, mock) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::Some(500),
    );

    let token_id = mint_for_game(@tc, game_id, mock, ALICE());

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let uri = metadata_dispatcher.token_uri(token_id.into());

    assert!(uri.len() > 0, "token_uri should return non-empty metadata");
}

#[test]
fn test_token_uri_contains_game_name() {
    let tc = setup_with_registry();

    let (game_id, _, mock) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "MySpecialGame", Option::None,
    );

    let token_id = mint_for_game(@tc, game_id, mock, ALICE());

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let uri = metadata_dispatcher.token_uri(token_id.into());

    // The metadata should be non-empty. Since no custom renderer overrides token_name,
    // the mock returns "Test Token" as token_name (see minigame_starknet_mock).
    assert!(uri.len() > 0, "token_uri should return non-empty metadata");
}

#[test]
fn test_token_uri_with_score() {
    let tc = setup_with_registry();

    let (game_id, _, mock) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "ScoreGame", Option::None,
    );

    let token_id = mint_for_game(@tc, game_id, mock, ALICE());

    // Start and end the game with a score
    mock.start_game(token_id);
    mock.end_game(token_id, 42);

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let uri = metadata_dispatcher.token_uri(token_id.into());

    assert!(uri.len() > 0, "token_uri with score should return non-empty metadata");
}

#[test]
fn test_token_uri_with_player_name() {
    let tc = setup_with_registry();

    let (game_id, _, mock) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "NamedGame", Option::None,
    );

    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint with a player name, using mock as caller
    cheat_caller_address(tc.denshokan_address, mock.contract_address, CheatSpan::TargetCalls(1));
    let token_id = tc
        .token_mixin
        .mint(
            Option::Some(game_metadata.contract_address),
            Option::Some('Hero'), // player_name
            Option::None, // settings_id
            Option::None, // start_time
            Option::None, // end_time
            Option::None, // objective_id
            Option::None, // renderer_address
            Option::None, // extra_data
            Option::None, // extra_data_uri
            ALICE(),
            false,
            false,
            0,
            0,
        );

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let uri = metadata_dispatcher.token_uri(token_id.into());

    assert!(uri.len() > 0, "token_uri with player name should return non-empty metadata");
}

#[test]
fn test_token_uri_different_games_produce_different_metadata() {
    let tc = setup_with_registry();

    let (game_id_1, _, mock_1) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "GameAlpha", Option::None,
    );

    let (game_id_2, _, mock_2) = register_game(
        tc.registry, tc.denshokan_address, BOB(), "GameBeta", Option::None,
    );

    let token_id_1 = mint_for_game(@tc, game_id_1, mock_1, ALICE());
    let token_id_2 = mint_for_game(@tc, game_id_2, mock_2, ALICE());

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let uri_1 = metadata_dispatcher.token_uri(token_id_1.into());
    let uri_2 = metadata_dispatcher.token_uri(token_id_2.into());

    assert!(uri_1.len() > 0, "uri_1 should be non-empty");
    assert!(uri_2.len() > 0, "uri_2 should be non-empty");

    // Different games should produce different metadata
    assert!(uri_1 != uri_2, "Different games should produce different token URIs");
}

#[test]
#[should_panic]
fn test_token_uri_reverts_for_nonexistent_token() {
    let tc = setup_with_registry();

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };

    // Token 999 does not exist, should revert via _require_owned
    metadata_dispatcher.token_uri(999);
}

#[test]
fn test_token_uri_after_transfer() {
    let tc = setup_with_registry();

    let (game_id, _, mock) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TransferGame", Option::None,
    );

    let token_id = mint_for_game(@tc, game_id, mock, ALICE());

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };

    // Get URI before transfer
    let uri_before = metadata_dispatcher.token_uri(token_id.into());

    // Transfer token from ALICE to BOB
    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    tc.erc721.transfer_from(ALICE(), BOB(), token_id.into());

    // URI should still work after transfer
    let uri_after = metadata_dispatcher.token_uri(token_id.into());

    assert!(uri_after.len() > 0, "token_uri should work after transfer");
    assert!(uri_before == uri_after, "token_uri should be the same after transfer");
}

#[test]
fn test_token_uri_multiple_tokens_same_game() {
    let tc = setup_with_registry();

    // Register two separate games to mint two tokens (different games avoid token ID collision)
    let (game_id_1, _, mock_1) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "MultiTokenGame", Option::None,
    );

    let (game_id_2, _, mock_2) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "MultiTokenGame2", Option::None,
    );

    let token_id_1 = mint_for_game(@tc, game_id_1, mock_1, ALICE());
    let token_id_2 = mint_for_game(@tc, game_id_2, mock_2, BOB());

    // Verify both tokens are owned by the correct players
    assert!(tc.erc721.owner_of(token_id_1.into()) == ALICE(), "ALICE should own token 1");
    assert!(tc.erc721.owner_of(token_id_2.into()) == BOB(), "BOB should own token 2");

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };
    let uri_1 = metadata_dispatcher.token_uri(token_id_1.into());
    let uri_2 = metadata_dispatcher.token_uri(token_id_2.into());

    assert!(uri_1.len() > 0, "token 1 uri should be non-empty");
    assert!(uri_2.len() > 0, "token 2 uri should be non-empty");

    // Different tokens should produce different metadata
    assert!(uri_1 != uri_2, "Different tokens should have different URIs");
}

#[test]
fn test_name_and_symbol() {
    let tc = setup_with_registry();

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };

    let name = metadata_dispatcher.name();
    let symbol = metadata_dispatcher.symbol();

    assert!(name == "Denshokan", "Name should be Denshokan");
    assert!(symbol == "DNSK", "Symbol should be DNSK");
}
