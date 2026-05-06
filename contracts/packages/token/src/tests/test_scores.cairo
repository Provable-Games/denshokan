use denshokan_interfaces::score::{IDenshokanScoresDispatcher, IDenshokanScoresDispatcherTrait};
use denshokan_testing::mocks::minigame_mock::IMinigameMockDispatcherTrait;
use game_components_embeddable_game_standard::registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_embeddable_game_standard::token::interface::IMinigameTokenMixinDispatcherTrait;
use snforge_std::{CheatSpan, cheat_caller_address};
use starknet::ContractAddress;
use crate::tests::setup::{
    ALICE, BOB, GAME_CREATOR, TestContracts, register_game, setup_with_registry,
};

fn mint(tc: @TestContracts, game_id: u64, player: ContractAddress, salt: u16) -> felt252 {
    let game_metadata = (*tc.registry).game_metadata(game_id);

    cheat_caller_address(*tc.denshokan_address, player, CheatSpan::TargetCalls(1));
    (*tc.token_mixin)
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
            Option::None,
            player,
            false,
            false,
            salt,
            0,
        )
}

#[test]
fn test_get_scores_returns_score_per_token_in_input_order() {
    let tc = setup_with_registry();

    let (game_id, _, mock) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "ScoreGame", Option::None,
    );

    let token_a = mint(@tc, game_id, ALICE(), 0);
    let token_b = mint(@tc, game_id, ALICE(), 1);
    let token_c = mint(@tc, game_id, BOB(), 0);

    mock.end_game(token_a, 100);
    mock.end_game(token_b, 250);
    mock.end_game(token_c, 7);

    let scores_dispatcher = IDenshokanScoresDispatcher { contract_address: tc.denshokan_address };
    let scores = scores_dispatcher.get_scores(array![token_a, token_b, token_c].span());

    assert!(scores.len() == 3, "Result length should match input length");
    assert!(*scores.at(0) == 100, "token_a score should be 100");
    assert!(*scores.at(1) == 250, "token_b score should be 250");
    assert!(*scores.at(2) == 7, "token_c score should be 7");
}

#[test]
fn test_get_scores_returns_empty_array_for_empty_input() {
    let tc = setup_with_registry();

    let scores_dispatcher = IDenshokanScoresDispatcher { contract_address: tc.denshokan_address };
    let scores = scores_dispatcher.get_scores(array![].span());

    assert!(scores.len() == 0, "Empty input should return empty array");
}

#[test]
fn test_get_scores_returns_zero_for_unscored_token() {
    let tc = setup_with_registry();

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "ScoreGame", Option::None,
    );
    let token_id = mint(@tc, game_id, ALICE(), 0);
    // No score set on the mock — defaults to 0.

    let scores_dispatcher = IDenshokanScoresDispatcher { contract_address: tc.denshokan_address };
    let scores = scores_dispatcher.get_scores(array![token_id].span());

    assert!(scores.len() == 1, "Result length should match input length");
    assert!(*scores.at(0) == 0, "Unscored token should return 0");
}

#[test]
fn test_get_scores_handles_multiple_games_with_caching() {
    // Mints tokens across two games to exercise the game_id -> GameMetadata
    // cache. Correctness only — not asserting the cache hit, just that mixed
    // batches return the right scores.
    let tc = setup_with_registry();

    let (game_a, _, mock_a) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "GameA", Option::None,
    );
    let (game_b, _, mock_b) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "GameB", Option::None,
    );

    let a1 = mint(@tc, game_a, ALICE(), 0);
    let b1 = mint(@tc, game_b, ALICE(), 0);
    let a2 = mint(@tc, game_a, ALICE(), 1);
    let b2 = mint(@tc, game_b, ALICE(), 1);

    mock_a.end_game(a1, 11);
    mock_a.end_game(a2, 22);
    mock_b.end_game(b1, 33);
    mock_b.end_game(b2, 44);

    let scores_dispatcher = IDenshokanScoresDispatcher { contract_address: tc.denshokan_address };
    let scores = scores_dispatcher.get_scores(array![a1, b1, a2, b2].span());

    assert!(*scores.at(0) == 11, "a1 score");
    assert!(*scores.at(1) == 33, "b1 score");
    assert!(*scores.at(2) == 22, "a2 score");
    assert!(*scores.at(3) == 44, "b2 score");
}
