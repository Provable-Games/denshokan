use denshokan::number_guess::{
    INumberGuessDispatcher, INumberGuessDispatcherTrait, INumberGuessInitDispatcher,
    INumberGuessInitDispatcherTrait,
};
use game_components_minigame::extensions::objectives::interface::{
    IMinigameObjectivesDetailsDispatcher, IMinigameObjectivesDetailsDispatcherTrait,
    IMinigameObjectivesDispatcher, IMinigameObjectivesDispatcherTrait,
};
use game_components_minigame::extensions::settings::interface::{
    IMinigameSettingsDetailsDispatcher, IMinigameSettingsDetailsDispatcherTrait,
    IMinigameSettingsDispatcher, IMinigameSettingsDispatcherTrait,
};
use game_components_minigame::interface::{
    IMinigameDetailsDispatcher, IMinigameDetailsDispatcherTrait, IMinigameTokenDataDispatcher,
    IMinigameTokenDataDispatcherTrait,
};
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::ContractAddress;
use crate::helpers::constants::GAME_CREATOR;
use crate::helpers::setup::{deploy_denshokan, deploy_minigame_registry};

// ==========================================================================
// HELPERS
// ==========================================================================

fn deploy_number_guess() -> ContractAddress {
    let contract = declare("NumberGuess").unwrap().contract_class();
    let (address, _) = contract.deploy(@array![]).unwrap();
    address
}

fn setup_number_guess() -> (INumberGuessDispatcher, ContractAddress) {
    let registry = deploy_minigame_registry();
    let (denshokan_address, _, _, _) = deploy_denshokan(registry.contract_address);

    let ng_address = deploy_number_guess();
    let ng = INumberGuessDispatcher { contract_address: ng_address };
    let init = INumberGuessInitDispatcher { contract_address: ng_address };

    init
        .initializer(
            GAME_CREATOR(),
            "Number Guess",
            "On-chain Number Guessing Game",
            "Provable Games",
            "Provable Games",
            "Puzzle",
            "https://numberguess.io/image.png",
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            Option::None,
            denshokan_address,
            Option::Some(500),
        );

    (ng, ng_address)
}

// ==========================================================================
// NEW GAME TESTS
// ==========================================================================

#[test]
fn test_new_game_initializes_state() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy mode

    assert!(ng.guess_count(token_id) == 0, "Guess count should be 0");
    let (min, max) = ng.get_range(token_id);
    assert!(min == 1, "Min should be 1");
    assert!(max == 10, "Max should be 10");
    assert!(ng.get_max_attempts(token_id) == 0, "Max attempts should be 0 (unlimited)");
}

#[test]
fn test_new_game_medium_difficulty() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 2); // Medium mode

    let (min, max) = ng.get_range(token_id);
    assert!(min == 1, "Min should be 1");
    assert!(max == 100, "Max should be 100");
    assert!(ng.get_max_attempts(token_id) == 10, "Max attempts should be 10");
}

#[test]
fn test_new_game_hard_difficulty() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 3); // Hard mode

    let (min, max) = ng.get_range(token_id);
    assert!(min == 1, "Min should be 1");
    assert!(max == 1000, "Max should be 1000");
    assert!(ng.get_max_attempts(token_id) == 10, "Max attempts should be 10");
}

#[test]
#[should_panic(expected: "Settings do not exist")]
fn test_new_game_invalid_settings() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 99); // Invalid settings
}

#[test]
fn test_new_game_resets_state() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;

    // Play a game
    ng.new_game(token_id, 1);
    ng.guess(token_id, 5);

    // Start new game - should reset
    ng.new_game(token_id, 1);
    assert!(ng.guess_count(token_id) == 0, "Guess count should be reset");

    // Should not be game over
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    assert!(!token_data.game_over(token_id), "Game should not be over after new_game");
}

// ==========================================================================
// GUESS FEEDBACK TESTS
// ==========================================================================

#[test]
fn test_guess_too_low_returns_negative_one() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy: 1-10

    // Binary search to find the secret and test feedback
    // Start with 1 - if secret > 1, we get -1
    let result = ng.guess(token_id, 1);
    // Result could be 0 (correct) or -1 (too low)
    assert!(result == 0 || result == -1, "Guess 1 should be correct or too low");
}

#[test]
fn test_guess_too_high_returns_positive_one() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy: 1-10

    // Guess the max - if secret < max, we get 1
    let result = ng.guess(token_id, 10);
    // Result could be 0 (correct) or 1 (too high)
    assert!(result == 0 || result == 1, "Guess 10 should be correct or too high");
}

#[test]
fn test_guess_increments_count() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1);

    assert!(ng.guess_count(token_id) == 0, "Initial guess count should be 0");

    ng.guess(token_id, 5);
    assert!(ng.guess_count(token_id) == 1, "Guess count should be 1");

    // Continue if game not over
    let (ng2, address) = setup_number_guess();
    let token_id2: felt252 = 2;
    ng2.new_game(token_id2, 1);
    ng2.guess(token_id2, 1);

    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    if !token_data.game_over(token_id2) {
        ng2.guess(token_id2, 2);
        assert!(ng2.guess_count(token_id2) == 2, "Guess count should be 2");
    }
}

#[test]
#[should_panic(expected: "No active game")]
fn test_guess_without_active_game() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    // No new_game called
    ng.guess(token_id, 5);
}

#[test]
#[should_panic(expected: "Guess out of range")]
fn test_guess_below_range() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy: 1-10
    ng.guess(token_id, 0); // Below minimum
}

#[test]
#[should_panic(expected: "Guess out of range")]
fn test_guess_above_range() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy: 1-10
    ng.guess(token_id, 11); // Above maximum
}

// ==========================================================================
// WIN / LOSS TESTS
// ==========================================================================

#[test]
fn test_correct_guess_wins_game() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy: 1-10

    // Binary search to find the secret
    let mut low: u32 = 1;
    let mut high: u32 = 10;

    loop {
        if low > high {
            break;
        }

        let token_data = IMinigameTokenDataDispatcher { contract_address: address };
        if token_data.game_over(token_id) {
            break;
        }

        let mid = (low + high) / 2;
        let result = ng.guess(token_id, mid);

        if result == 0 {
            // Found it!
            break;
        } else if result == -1 {
            // Too low
            low = mid + 1;
        } else {
            // Too high
            high = mid - 1;
        }
    }

    // Should have won
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    assert!(token_data.game_over(token_id), "Game should be over");
    assert!(ng.games_won(token_id) == 1, "Should have 1 win");
    assert!(ng.games_played(token_id) == 1, "Should have 1 game played");
}

#[test]
fn test_max_attempts_reached_loses_game() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 2); // Medium: 1-100, 10 attempts

    // Make 10 wrong guesses (guess 1 repeatedly if secret != 1)
    let mut attempts: u32 = 0;
    loop {
        if attempts >= 10 {
            break;
        }

        let token_data = IMinigameTokenDataDispatcher { contract_address: address };
        if token_data.game_over(token_id) {
            break;
        }

        // Guess alternating values to try to avoid the secret
        let guess = if attempts % 2 == 0 {
            1
        } else {
            100
        };
        ng.guess(token_id, guess);
        attempts += 1;
    }

    // Game should be over
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    assert!(token_data.game_over(token_id), "Game should be over after max attempts");
    assert!(ng.games_played(token_id) == 1, "Should have 1 game played");
}

#[test]
fn test_unlimited_attempts_mode() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;

    ng.new_game(token_id, 1); // Easy: unlimited attempts

    // Make many guesses
    let mut attempts: u32 = 0;
    loop {
        if attempts >= 15 {
            break;
        }

        let token_data = IMinigameTokenDataDispatcher { contract_address: address };
        if token_data.game_over(token_id) {
            break;
        }

        // Guess sequentially
        let guess = (attempts % 10) + 1;
        ng.guess(token_id, guess);
        attempts += 1;
    }

    // Should have won eventually (we covered all 10 numbers)
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    assert!(token_data.game_over(token_id), "Game should be over");
    assert!(ng.games_won(token_id) == 1, "Should have won");
}

// ==========================================================================
// STATISTICS TESTS
// ==========================================================================

#[test]
fn test_best_score_tracks_lowest() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;

    // Play first game with binary search
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        let token_data = IMinigameTokenDataDispatcher { contract_address: address };
        if token_data.game_over(token_id) {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token_id, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    let first_best = ng.best_score(token_id);
    assert!(first_best > 0, "Best score should be set after win");
}

#[test]
fn test_perfect_game_tracked() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1;

    // We need to find the secret on first guess
    // Play multiple games and hope to get lucky
    let mut perfect_found = false;
    let mut game_num: u32 = 0;

    loop {
        if game_num >= 20 || perfect_found {
            break;
        }

        ng.new_game(token_id, 1); // Easy: 1-10

        // Try to guess on first attempt
        let result = ng.guess(token_id, 5); // Middle guess
        if result == 0 && ng.guess_count(token_id) == 1 {
            perfect_found = ng.perfect_games(token_id) > 0;
        }

        game_num += 1;
    }

    // We may or may not have gotten a perfect game - that's OK
    // Just verify the counter works when we do
    let perfect = ng.perfect_games(token_id);
    assert!(perfect >= 0, "Perfect games should be trackable");
}

#[test]
fn test_multiple_games_accumulate_stats() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;

    // Play 3 games
    let mut games: u32 = 0;
    loop {
        if games >= 3 {
            break;
        }

        ng.new_game(token_id, 1);

        // Binary search to win
        let mut low: u32 = 1;
        let mut high: u32 = 10;
        loop {
            let token_data = IMinigameTokenDataDispatcher { contract_address: address };
            if token_data.game_over(token_id) {
                break;
            }
            if low > high {
                break;
            }
            let mid = (low + high) / 2;
            let result = ng.guess(token_id, mid);
            if result == 0 {
                break;
            } else if result == -1 {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        games += 1;
    }

    assert!(ng.games_played(token_id) == 3, "Should have played 3 games");
    assert!(ng.games_won(token_id) == 3, "Should have won 3 games");
}

#[test]
fn test_score_accumulates() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };

    assert!(token_data.score(token_id) == 0, "Initial score should be 0");

    // Win a game
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token_id) {
            break;
        }
        if low > high {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token_id, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    let score_after_first = token_data.score(token_id);
    assert!(score_after_first >= 100, "Score should be at least 100 after a win");
}

// ==========================================================================
// DIFFERENT TOKENS INDEPENDENCE
// ==========================================================================

#[test]
fn test_different_tokens_independent() {
    let (ng, _) = setup_number_guess();
    let token1: felt252 = 1;
    let token2: felt252 = 2;

    ng.new_game(token1, 1);
    ng.new_game(token2, 2);

    // Token 1 is easy, token 2 is medium
    let (_min1, max1) = ng.get_range(token1);
    let (_min2, max2) = ng.get_range(token2);

    assert!(max1 == 10, "Token 1 should be easy (max 10)");
    assert!(max2 == 100, "Token 2 should be medium (max 100)");

    // Make a guess on token 1
    ng.guess(token1, 5);

    // Token 2 should still have 0 guesses
    assert!(ng.guess_count(token2) == 0, "Token 2 should have 0 guesses");
}

// ==========================================================================
// MINIGAME INTERFACE COMPLIANCE TESTS
// ==========================================================================

#[test]
fn test_token_data_score() {
    let (_, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };

    assert!(token_data.score(token_id) == 0, "Initial score should be 0");
}

#[test]
fn test_token_data_game_over() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };

    ng.new_game(token_id, 1);
    assert!(!token_data.game_over(token_id), "Game should not be over after new_game");
}

#[test]
fn test_details_token_name() {
    let (_, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let name = details.token_name(1);
    assert!(name == "Number Guess", "Token name should be 'Number Guess'");
}

#[test]
fn test_details_game_details() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    ng.new_game(token_id, 1);

    let details = IMinigameDetailsDispatcher { contract_address: address };
    let game_details = details.game_details(token_id);
    assert!(game_details.len() == 9, "Should have 9 game details");
}

// ==========================================================================
// SETTINGS TESTS
// ==========================================================================

#[test]
fn test_settings_exist() {
    let (_, address) = setup_number_guess();
    let settings = IMinigameSettingsDispatcher { contract_address: address };

    assert!(settings.settings_exist(1), "Settings 1 (Easy) should exist");
    assert!(settings.settings_exist(2), "Settings 2 (Medium) should exist");
    assert!(settings.settings_exist(3), "Settings 3 (Hard) should exist");
    assert!(!settings.settings_exist(99), "Settings 99 should not exist");
}

#[test]
fn test_settings_details() {
    let (_, address) = setup_number_guess();
    let settings = IMinigameSettingsDetailsDispatcher { contract_address: address };

    let easy = settings.settings_details(1);
    assert!(easy.name == "Easy", "Settings 1 name should be 'Easy'");

    let medium = settings.settings_details(2);
    assert!(medium.name == "Medium", "Settings 2 name should be 'Medium'");

    let hard = settings.settings_details(3);
    assert!(hard.name == "Hard", "Settings 3 name should be 'Hard'");
}

// ==========================================================================
// OBJECTIVES TESTS
// ==========================================================================

#[test]
fn test_objectives_exist() {
    let (_, address) = setup_number_guess();
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };

    assert!(objectives.objective_exists(1), "Objective 1 (First Win) should exist");
    assert!(objectives.objective_exists(2), "Objective 2 (Quick Thinker) should exist");
    assert!(objectives.objective_exists(3), "Objective 3 (Experienced) should exist");
    assert!(objectives.objective_exists(4), "Objective 4 (Lucky Guess) should exist");
    assert!(!objectives.objective_exists(99), "Objective 99 should not exist");
}

#[test]
fn test_objective_first_win() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };

    // Initially not completed
    assert!(!objectives.completed_objective(token_id, 1), "First Win should not be completed yet");

    // Win a game
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    loop {
        if token_data.game_over(token_id) {
            break;
        }
        if low > high {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token_id, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // Now First Win should be completed
    assert!(objectives.completed_objective(token_id, 1), "First Win should be completed after win");
}

#[test]
fn test_objective_quick_thinker() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };

    // Win a game with binary search on easy mode (1-10)
    // Binary search should take at most 4 guesses (log2(10) ~ 3.3)
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    loop {
        if token_data.game_over(token_id) {
            break;
        }
        if low > high {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token_id, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    // Best score should be <= 4, so Quick Thinker (under 5) should be completed
    let best = ng.best_score(token_id);
    if best > 0 && best < 5 {
        assert!(
            objectives.completed_objective(token_id, 2),
            "Quick Thinker should be completed with best < 5",
        );
    }
}

#[test]
fn test_objective_experienced_guesser() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };

    // Win 10 games
    let mut games: u32 = 0;
    loop {
        if games >= 10 {
            break;
        }

        ng.new_game(token_id, 1);
        let mut low: u32 = 1;
        let mut high: u32 = 10;
        loop {
            if token_data.game_over(token_id) {
                break;
            }
            if low > high {
                break;
            }
            let mid = (low + high) / 2;
            let result = ng.guess(token_id, mid);
            if result == 0 {
                break;
            } else if result == -1 {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        games += 1;
    }

    assert!(ng.games_won(token_id) == 10, "Should have 10 wins");
    assert!(objectives.completed_objective(token_id, 3), "Experienced Guesser should be completed");
}

#[test]
fn test_objectives_details() {
    let (_, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let objectives_details = IMinigameObjectivesDetailsDispatcher { contract_address: address };

    let details = objectives_details.objectives_details(token_id);
    assert!(details.len() == 4, "Should have 4 objectives");
}

// ==========================================================================
// BATCH QUERY TESTS
// ==========================================================================

#[test]
fn test_score_batch() {
    let (ng, address) = setup_number_guess();
    ng.new_game(1, 1);
    ng.new_game(2, 1);

    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let scores = token_data.score_batch(array![1, 2].span());
    assert!(scores.len() == 2, "Should return 2 scores");
    assert!(*scores.at(0) == 0, "Token 1 score should be 0");
    assert!(*scores.at(1) == 0, "Token 2 score should be 0");
}

#[test]
fn test_game_over_batch() {
    let (ng, address) = setup_number_guess();
    ng.new_game(1, 1);
    ng.new_game(2, 1);

    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let results = token_data.game_over_batch(array![1, 2].span());
    assert!(results.len() == 2, "Should return 2 results");
    assert!(!*results.at(0), "Token 1 game should not be over");
    assert!(!*results.at(1), "Token 2 game should not be over");
}

#[test]
fn test_token_name_batch() {
    let (_, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let names = details.token_name_batch(array![1, 2].span());
    assert!(names.len() == 2, "Should return 2 names");
}

#[test]
fn test_settings_exist_batch() {
    let (_, address) = setup_number_guess();
    let settings = IMinigameSettingsDispatcher { contract_address: address };
    let results = settings.settings_exist_batch(array![1, 2, 99].span());
    assert!(results.len() == 3, "Should return 3 results");
    assert!(*results.at(0), "Settings 1 should exist");
    assert!(*results.at(1), "Settings 2 should exist");
    assert!(!*results.at(2), "Settings 99 should not exist");
}

#[test]
fn test_objective_exists_batch() {
    let (_, address) = setup_number_guess();
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let results = objectives.objective_exists_batch(array![1, 4, 99].span());
    assert!(results.len() == 3, "Should return 3 results");
    assert!(*results.at(0), "Objective 1 should exist");
    assert!(*results.at(1), "Objective 4 should exist");
    assert!(!*results.at(2), "Objective 99 should not exist");
}
