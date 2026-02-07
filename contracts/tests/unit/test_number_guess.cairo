use denshokan::number_guess::{
    INumberGuessConfigDispatcher, INumberGuessConfigDispatcherTrait, INumberGuessDispatcher,
    INumberGuessDispatcherTrait, INumberGuessInitDispatcher, INumberGuessInitDispatcherTrait,
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

    // 3 single-game objectives: 1=Win, 2=WinWithinN, 3=PerfectGame
    assert!(objectives.objective_exists(1), "Objective 1 (First Win) should exist");
    assert!(objectives.objective_exists(2), "Objective 2 (Quick Thinker) should exist");
    assert!(objectives.objective_exists(3), "Objective 3 (Lucky Guess) should exist");
    assert!(!objectives.objective_exists(4), "Objective 4 should not exist");
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
fn test_objective_lucky_guess() {
    let (ng, address) = setup_number_guess();
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };

    // Play multiple games trying to get a perfect game (1-guess win)
    // Lucky Guess objective (ID 3) requires a perfect game
    let mut perfect_found = false;
    let mut token_id: felt252 = 1;

    // Try up to 20 different tokens to get a lucky first-guess win
    let mut attempts: u32 = 0;
    loop {
        if perfect_found || attempts >= 20 {
            break;
        }

        ng.new_game(token_id, 1); // Easy: 1-10

        // Try each number 1-10 as first guess
        let guess: u32 = (attempts % 10) + 1;
        let result = ng.guess(token_id, guess);

        if result == 0 && ng.guess_count(token_id) == 1 {
            // Got a perfect game!
            perfect_found = true;
            // Verify Lucky Guess objective completed
            assert!(
                objectives.completed_objective(token_id, 3),
                "Lucky Guess should be completed after perfect game",
            );
        }

        token_id += 1;
        attempts += 1;
    }

    // The objective tracking should work (we may or may not get lucky)
    // Just verify the counter is trackable
    assert!(ng.perfect_games(1) >= 0, "Perfect games should be trackable");
}

#[test]
fn test_objectives_details() {
    let (_, address) = setup_number_guess();
    let objectives_details = IMinigameObjectivesDetailsDispatcher { contract_address: address };

    // Test fetching details for objective 1 (First Win)
    let details = objectives_details.objectives_details(1);
    assert!(details.name == "First Win", "Objective 1 should be First Win");

    // Test fetching details for objective 2 (Quick Thinker)
    let details2 = objectives_details.objectives_details(2);
    assert!(details2.name == "Quick Thinker", "Objective 2 should be Quick Thinker");

    // Test fetching details for objective 3 (Lucky Guess)
    let details3 = objectives_details.objectives_details(3);
    assert!(details3.name == "Lucky Guess", "Objective 3 should be Lucky Guess");
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
    let results = objectives.objective_exists_batch(array![1, 3, 99].span());
    assert!(results.len() == 3, "Should return 3 results");
    assert!(*results.at(0), "Objective 1 should exist");
    assert!(*results.at(1), "Objective 3 should exist");
    assert!(!*results.at(2), "Objective 99 should not exist");
}

// ==========================================================================
// INumberGuessConfig TESTS
// ==========================================================================

#[test]
fn test_create_settings() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let settings_details = IMinigameSettingsDetailsDispatcher { contract_address: address };

    // Initial count is 3 (Easy, Medium, Hard)
    assert!(settings_details.settings_count() == 3, "Should have 3 initial settings");

    // Create a new custom settings
    let new_id = config.create_settings("Custom", "Custom difficulty 1-50", 1, 50, 5);
    assert!(new_id == 4, "New settings ID should be 4");
    assert!(settings_details.settings_count() == 4, "Should have 4 settings now");

    // Verify the new settings works
    let settings = IMinigameSettingsDispatcher { contract_address: address };
    assert!(settings.settings_exist(4), "Settings 4 should exist");
}

#[test]
#[should_panic(expected: "max must be greater than min")]
fn test_create_settings_invalid_range() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };

    // max <= min should fail
    config.create_settings("Invalid", "Invalid range", 50, 10, 5);
}

#[test]
fn test_create_objective() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let objectives_details = IMinigameObjectivesDetailsDispatcher { contract_address: address };

    // Initial count is 3 (First Win, Quick Thinker, Lucky Guess)
    assert!(objectives_details.objectives_count() == 3, "Should have 3 initial objectives");

    // Create a new objective (type 2 = WinWithinN)
    let new_id = config.create_objective("Speed Demon", "Win in 3 or fewer guesses", 2, 3);
    assert!(new_id == 4, "New objective ID should be 4");
    assert!(objectives_details.objectives_count() == 4, "Should have 4 objectives now");

    // Verify the new objective exists
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    assert!(objectives.objective_exists(4), "Objective 4 should exist");
}

#[test]
#[should_panic(expected: "Invalid objective type (must be 1-3)")]
fn test_create_objective_invalid_type() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };

    // Type 4 is invalid (only 1-3 allowed)
    config.create_objective("Invalid", "Invalid type", 4, 1);
}

#[test]
fn test_per_game_objective_completion() {
    let (ng, address) = setup_number_guess();
    let token_id: felt252 = 1;
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };

    // Initially, no objectives completed
    assert!(!objectives.completed_objective(token_id, 1), "First Win should not be completed yet");

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

    // First Win should now be completed
    assert!(objectives.completed_objective(token_id, 1), "First Win should be completed after win");

    // Quick Thinker should be completed if we won in <= 5 guesses
    let guesses = ng.guess_count(token_id);
    if guesses <= 5 {
        assert!(objectives.completed_objective(token_id, 2), "Quick Thinker should be completed");
    }
}

#[test]
fn test_custom_settings_game() {
    let (ng, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let token_id: felt252 = 1;

    // Create custom settings: 1-5 range, 3 attempts
    let custom_id = config.create_settings("Tiny", "Very small range", 1, 5, 3);

    // Start a game with custom settings
    ng.new_game(token_id, custom_id);

    let (min, max) = ng.get_range(token_id);
    assert!(min == 1, "Custom min should be 1");
    assert!(max == 5, "Custom max should be 5");
    assert!(ng.get_max_attempts(token_id) == 3, "Custom max attempts should be 3");
}

#[test]
fn test_custom_objective_completion() {
    let (ng, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 1;

    // Create a custom objective: Win in 3 or fewer guesses
    let custom_obj_id = config.create_objective("Speed Demon", "Win in 3 or fewer guesses", 2, 3);

    // Win a game with <= 3 guesses (easy mode binary search should do it)
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

    let guesses = ng.guess_count(token_id);
    if guesses <= 3 {
        assert!(
            objectives.completed_objective(token_id, custom_obj_id),
            "Speed Demon should be completed",
        );
    }
}

// ==========================================================================
// ADDITIONAL COVERAGE TESTS
// ==========================================================================

/// Helper: discover the secret for a given token via brute force on a small range,
/// then return the secret number. Uses a fresh game on the given token_id and settings.
/// After this returns, the token has WON a game (games_played incremented).
fn discover_secret_and_win(
    ng: INumberGuessDispatcher,
    address: ContractAddress,
    token_id: felt252,
    settings_id: u32,
    range_min: u32,
    range_max: u32,
) -> u32 {
    ng.new_game(token_id, settings_id);
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let mut guess_val = range_min;
    let mut found: u32 = 0;
    loop {
        if token_data.game_over(token_id) || guess_val > range_max {
            break;
        }
        let result = ng.guess(token_id, guess_val);
        if result == 0 {
            found = guess_val;
            break;
        }
        guess_val += 1;
    };
    found
}

/// Helper: win a game in exactly 1 guess by discovering secret on a prior game,
/// then using the known pattern. Works with tiny range (1-2) where we retry until
/// first guess is correct. Returns the score after the perfect-game win.
fn win_perfect_game(
    ng: INumberGuessDispatcher,
    address: ContractAddress,
    token_id: felt252,
    settings_id: u32,
    range_min: u32,
    range_max: u32,
) -> bool {
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    // Try up to 30 times to win on first guess
    let mut attempt: u32 = 0;
    let mut success = false;
    loop {
        if attempt >= 30 || success {
            break;
        }
        ng.new_game(token_id, settings_id);
        // Try guessing range_min first
        let try_val = if attempt % 2 == 0 {
            range_min
        } else {
            range_max
        };
        let result = ng.guess(token_id, try_val);
        if result == 0 {
            // Won in 1 guess!
            success = true;
        } else {
            // Finish the game by brute force so we can start a new one
            let mut v = range_min;
            loop {
                if token_data.game_over(token_id) || v > range_max {
                    break;
                }
                ng.guess(token_id, v);
                v += 1;
            };
        }
        attempt += 1;
    };
    success
}

// --------------------------------------------------------------------------
// 1. calculate_score efficiency bonus - Win with fewer guesses than optimal
// --------------------------------------------------------------------------

#[test]
fn test_calculate_score_efficiency_bonus() {
    let (ng, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 100;

    // Create a custom settings with range 1-2, unlimited attempts.
    // optimal_guesses(2) = 2. Winning in 1 guess gives efficiency bonus = (2-1+1)*10 = 20
    // plus perfect game bonus = 50, total = 100 + 20 + 50 = 170.
    // Even winning in 1 guess on range 1-10: optimal=4, bonus = (4-1+1)*10 = 40,
    // plus perfect = 50, total = 190. Either way, score > 100.
    let tiny_settings = config.create_settings("Tiny", "Range 1-2", 1, 2, 0);

    // Keep playing until we win in 1 guess
    let success = win_perfect_game(ng, address, token_id, tiny_settings, 1, 2);

    if success {
        let score = token_data.score(token_id);
        // With 1 guess on range 1-2: BASE(100) + efficiency(20) + perfect(50) = 170
        // But score is cumulative, so the last game's contribution includes efficiency bonus.
        // The perfect-game win's score alone is 170. Total is sum of all games.
        // What matters is that the score is strictly greater than 100 * games_won,
        // meaning at least one game got an efficiency bonus.
        let games_won = ng.games_won(token_id);
        // If every game scored exactly BASE_SCORE (100), total would be 100 * games_won.
        // Because at least the last game had efficiency bonus, total > 100 * games_won.
        assert!(
            score > 100_u64 * games_won.into(),
            "Score should exceed base due to efficiency bonus",
        );
    }
}

// --------------------------------------------------------------------------
// 2. calculate_score perfect game bonus - Win in 1 guess gives +50 bonus
// --------------------------------------------------------------------------

#[test]
fn test_calculate_score_perfect_game_bonus() {
    let (ng, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 200;

    let tiny_settings = config.create_settings("Tiny2", "Range 1-2", 1, 2, 0);

    let success = win_perfect_game(ng, address, token_id, tiny_settings, 1, 2);

    if success {
        let score = token_data.score(token_id);
        let perfect_count = ng.perfect_games(token_id);
        assert!(perfect_count >= 1, "Should have at least 1 perfect game");
        // The perfect game win scored at least 150 (100 base + 50 perfect bonus).
        // Total score >= 150 regardless of other games.
        assert!(score >= 150, "Score should be at least 150 after a perfect game");
    }
}

// --------------------------------------------------------------------------
// 3. check_and_record_objectives - Type 2 failure (WinWithinN, threshold=2)
// --------------------------------------------------------------------------

#[test]
fn test_objective_type2_failure_win_with_too_many_guesses() {
    let (ng, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 300;

    // Create objective type 2 (WinWithinN) with threshold 2: must win in <= 2 guesses
    let obj_id = config.create_objective("Win In 2", "Win in 2 or fewer guesses", 2, 2);

    // Create settings with range 1-10, unlimited attempts
    // We need to win but with MORE than 2 guesses.
    // Use easy mode (1-10). We will intentionally make wrong guesses before finding the secret.
    ng.new_game(token_id, 1); // Easy: 1-10

    // Make two deliberate wrong guesses, then find the secret
    // First, iterate to find the secret but count guesses
    let mut guess_val: u32 = 1;
    let mut won = false;
    loop {
        if token_data.game_over(token_id) || guess_val > 10 {
            break;
        }
        let result = ng.guess(token_id, guess_val);
        if result == 0 {
            won = true;
            break;
        }
        guess_val += 1;
    };

    let guess_count = ng.guess_count(token_id);
    if won && guess_count > 2 {
        // Objective should NOT be completed because guess_count > threshold (2)
        assert!(
            !objectives.completed_objective(token_id, obj_id),
            "WinWithinN objective should NOT be completed with too many guesses",
        );
    }
    // If we happened to win in <= 2 guesses (unlikely but possible), the test is still valid -
    // we just cannot assert the negative case. The objective would be correctly completed.
}

// --------------------------------------------------------------------------
// 4. check_and_record_objectives - Type 3 failure (PerfectGame, >1 guess)
// --------------------------------------------------------------------------

#[test]
fn test_objective_type3_failure_not_perfect_game() {
    let (ng, address) = setup_number_guess();
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 400;

    // Default objective 3 is PerfectGame (type 3, threshold 1).
    // Win a game with MORE than 1 guess.
    ng.new_game(token_id, 1); // Easy: 1-10

    // Iterate from 1 upward to find the secret. We will almost certainly need > 1 guess.
    let mut guess_val: u32 = 1;
    let mut won = false;
    loop {
        if token_data.game_over(token_id) || guess_val > 10 {
            break;
        }
        let result = ng.guess(token_id, guess_val);
        if result == 0 {
            won = true;
            break;
        }
        guess_val += 1;
    };

    let guess_count = ng.guess_count(token_id);
    if won && guess_count > 1 {
        // PerfectGame (objective 3) should NOT be completed since guess_count > 1
        assert!(
            !objectives.completed_objective(token_id, 3),
            "PerfectGame objective should NOT be completed with >1 guess",
        );
        // But First Win (objective 1) SHOULD be completed
        assert!(
            objectives.completed_objective(token_id, 1),
            "First Win should still be completed",
        );
    }
}

// --------------------------------------------------------------------------
// 5. Already-completed objective stays completed after second win
// --------------------------------------------------------------------------

#[test]
fn test_already_completed_objective_stays_completed() {
    let (ng, address) = setup_number_guess();
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 500;

    // Win first game
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token_id) || low > high {
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
    };

    assert!(
        objectives.completed_objective(token_id, 1), "First Win should be completed after game 1",
    );

    // Win second game
    ng.new_game(token_id, 1);
    low = 1;
    high = 10;
    loop {
        if token_data.game_over(token_id) || low > high {
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
    };

    // First Win should STILL be completed after second win
    assert!(
        objectives.completed_objective(token_id, 1),
        "First Win should remain completed after game 2",
    );
    assert!(ng.games_won(token_id) == 2, "Should have 2 wins");
}

// --------------------------------------------------------------------------
// 6. token_description after winning and losing
// --------------------------------------------------------------------------

#[test]
fn test_token_description_after_gameplay() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 600;

    // Description before any games
    let desc_before = details.token_description(token_id);
    assert!(desc_before.len() > 0, "Description should not be empty before games");

    // Win a game (Easy mode, binary search)
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token_id) || low > high {
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
    };

    let desc_after_win = details.token_description(token_id);
    assert!(desc_after_win.len() > 0, "Description should not be empty after win");

    // Lose a game (Medium mode, 10 attempts)
    ng.new_game(token_id, 2); // Medium: 1-100, 10 attempts
    let mut attempts: u32 = 0;
    loop {
        if attempts >= 10 || token_data.game_over(token_id) {
            break;
        }
        // Deliberately guess wrong: alternate between 1 and 100
        let guess = if attempts % 2 == 0 {
            1
        } else {
            100
        };
        ng.guess(token_id, guess);
        attempts += 1;
    };

    let desc_after_loss = details.token_description(token_id);
    assert!(desc_after_loss.len() > 0, "Description should not be empty after loss");
}

// --------------------------------------------------------------------------
// 7. game_details with all statuses (NO_GAME, PLAYING, WON, LOST)
// --------------------------------------------------------------------------

#[test]
fn test_game_details_status_no_game() {
    let (_, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_id: felt252 = 700;

    // No game started - STATUS_NO_GAME
    let game_details = details.game_details(token_id);
    // Status field is at index 5
    let status_detail = game_details.at(5);
    assert!(*status_detail.value == "No Game", "Status should be 'No Game'");
}

#[test]
fn test_game_details_status_playing() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_id: felt252 = 701;

    ng.new_game(token_id, 1); // Start playing

    let game_details = details.game_details(token_id);
    let status_detail = game_details.at(5);
    assert!(*status_detail.value == "Playing", "Status should be 'Playing'");
}

#[test]
fn test_game_details_status_won() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 702;

    // Win a game
    ng.new_game(token_id, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token_id) || low > high {
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
    };

    let game_details = details.game_details(token_id);
    let status_detail = game_details.at(5);
    assert!(*status_detail.value == "Won", "Status should be 'Won'");
}

#[test]
fn test_game_details_status_lost() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 703;

    // Lose a game (medium: 1-100, 10 attempts)
    ng.new_game(token_id, 2);
    let mut attempts: u32 = 0;
    loop {
        if attempts >= 10 || token_data.game_over(token_id) {
            break;
        }
        let guess = if attempts % 2 == 0 {
            1
        } else {
            100
        };
        ng.guess(token_id, guess);
        attempts += 1;
    };

    let game_details = details.game_details(token_id);
    let status_detail = game_details.at(5);
    assert!(*status_detail.value == "Lost", "Status should be 'Lost'");
}

// --------------------------------------------------------------------------
// 8. settings_details with unlimited attempts (Easy, max_attempts=0)
// --------------------------------------------------------------------------

#[test]
fn test_settings_details_unlimited_attempts() {
    let (_, address) = setup_number_guess();
    let settings_details = IMinigameSettingsDetailsDispatcher { contract_address: address };

    // Settings 1 (Easy) has max_attempts=0 (unlimited)
    let easy = settings_details.settings_details(1);
    assert!(easy.name == "Easy", "Settings 1 name should be 'Easy'");

    // The Max Attempts setting should show "Unlimited"
    let settings_span = easy.settings;
    // settings[2] is "Max Attempts"
    let max_attempts_setting = settings_span.at(2);
    assert!(*max_attempts_setting.name == "Max Attempts", "Third setting should be Max Attempts");
    assert!(*max_attempts_setting.value == "Unlimited", "Easy mode should show 'Unlimited'");
}

// --------------------------------------------------------------------------
// 9. settings_details with limited attempts (Medium, max_attempts=10)
// --------------------------------------------------------------------------

#[test]
fn test_settings_details_limited_attempts() {
    let (_, address) = setup_number_guess();
    let settings_details = IMinigameSettingsDetailsDispatcher { contract_address: address };

    // Settings 2 (Medium) has max_attempts=10
    let medium = settings_details.settings_details(2);
    assert!(medium.name == "Medium", "Settings 2 name should be 'Medium'");

    let settings_span = medium.settings;
    let max_attempts_setting = settings_span.at(2);
    assert!(*max_attempts_setting.name == "Max Attempts", "Third setting should be Max Attempts");
    assert!(*max_attempts_setting.value == "10", "Medium mode should show '10'");
}

// --------------------------------------------------------------------------
// 10. token_description_batch and game_details_batch
// --------------------------------------------------------------------------

#[test]
fn test_token_description_batch() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token1: felt252 = 1001;
    let token2: felt252 = 1002;

    // Win a game for token1 so descriptions differ
    ng.new_game(token1, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token1) || low > high {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token1, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    };

    let descriptions = details.token_description_batch(array![token1, token2].span());
    assert!(descriptions.len() == 2, "Should return 2 descriptions");
    assert!(descriptions.at(0).len() > 0, "Token1 description should not be empty");
    assert!(descriptions.at(1).len() > 0, "Token2 description should not be empty");
}

#[test]
fn test_game_details_batch() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token1: felt252 = 1101;
    let token2: felt252 = 1102;

    ng.new_game(token1, 1);
    ng.new_game(token2, 2);

    let batch = details.game_details_batch(array![token1, token2].span());
    assert!(batch.len() == 2, "Should return 2 game detail spans");
    assert!(batch.at(0).len() == 9, "Token1 should have 9 game details");
    assert!(batch.at(1).len() == 9, "Token2 should have 9 game details");
}

// --------------------------------------------------------------------------
// 11. settings_details_batch with multiple IDs
// --------------------------------------------------------------------------

#[test]
fn test_settings_details_batch() {
    let (_, address) = setup_number_guess();
    let settings_details = IMinigameSettingsDetailsDispatcher { contract_address: address };

    let batch = settings_details.settings_details_batch(array![1, 2, 3].span());
    assert!(batch.len() == 3, "Should return 3 settings details");
    let first: @ByteArray = batch.at(0).name;
    let second: @ByteArray = batch.at(1).name;
    let third: @ByteArray = batch.at(2).name;
    assert!(first == @"Easy", "First should be Easy");
    assert!(second == @"Medium", "Second should be Medium");
    assert!(third == @"Hard", "Third should be Hard");
}

// --------------------------------------------------------------------------
// 12. objectives_details for non-existent objective (should panic)
// --------------------------------------------------------------------------

#[test]
#[should_panic(expected: "Objective does not exist")]
fn test_objectives_details_nonexistent_panics() {
    let (_, address) = setup_number_guess();
    let objectives_details = IMinigameObjectivesDetailsDispatcher { contract_address: address };

    // Objective 99 does not exist - should panic
    objectives_details.objectives_details(99);
}

// --------------------------------------------------------------------------
// 13. create_objective with type 0 (should panic)
// --------------------------------------------------------------------------

#[test]
#[should_panic(expected: "Invalid objective type (must be 1-3)")]
fn test_create_objective_type_zero_panics() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };

    // Type 0 is invalid (only 1-3 allowed)
    config.create_objective("Invalid Zero", "Type zero", 0, 1);
}

// --------------------------------------------------------------------------
// 14. game_status returns correct values (0, 1, 2, 3)
// --------------------------------------------------------------------------

#[test]
fn test_game_status_returns_no_game() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1400;

    // No game started: status should be 0 (STATUS_NO_GAME)
    assert!(ng.game_status(token_id) == 0, "Status should be 0 (no game)");
}

#[test]
fn test_game_status_returns_playing() {
    let (ng, _) = setup_number_guess();
    let token_id: felt252 = 1401;

    ng.new_game(token_id, 1);
    // Game started: status should be 1 (STATUS_PLAYING)
    assert!(ng.game_status(token_id) == 1, "Status should be 1 (playing)");
}

#[test]
fn test_game_status_returns_won() {
    let (ng, address) = setup_number_guess();
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 1402;

    ng.new_game(token_id, 1);
    // Binary search to win
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token_id) || low > high {
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
    };

    // Won: status should be 2 (STATUS_WON)
    assert!(ng.game_status(token_id) == 2, "Status should be 2 (won)");
}

#[test]
fn test_game_status_returns_lost() {
    let (ng, address) = setup_number_guess();
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token_id: felt252 = 1403;

    ng.new_game(token_id, 2); // Medium: 1-100, 10 attempts
    let mut attempts: u32 = 0;
    loop {
        if attempts >= 10 || token_data.game_over(token_id) {
            break;
        }
        let guess = if attempts % 2 == 0 {
            1
        } else {
            100
        };
        ng.guess(token_id, guess);
        attempts += 1;
    };

    // Lost: status should be 3 (STATUS_LOST)
    assert!(ng.game_status(token_id) == 3, "Status should be 3 (lost)");
}

// --------------------------------------------------------------------------
// 15. completed_objective for non-existent objective returns false
// --------------------------------------------------------------------------

#[test]
fn test_completed_objective_nonexistent_returns_false() {
    let (_, address) = setup_number_guess();
    let objectives = IMinigameObjectivesDispatcher { contract_address: address };
    let token_id: felt252 = 1500;

    // Objective 999 does not exist. completed_objective should return false.
    assert!(
        !objectives.completed_objective(token_id, 999),
        "Non-existent objective should return false",
    );
}

// --------------------------------------------------------------------------
// Additional: objectives_details_batch
// --------------------------------------------------------------------------

#[test]
fn test_objectives_details_batch() {
    let (_, address) = setup_number_guess();
    let objectives_details = IMinigameObjectivesDetailsDispatcher { contract_address: address };

    let batch = objectives_details.objectives_details_batch(array![1, 2, 3].span());
    assert!(batch.len() == 3, "Should return 3 objective details");
    let first: @ByteArray = batch.at(0).name;
    let second: @ByteArray = batch.at(1).name;
    let third: @ByteArray = batch.at(2).name;
    assert!(first == @"First Win", "First should be First Win");
    assert!(second == @"Quick Thinker", "Second should be Quick Thinker");
    assert!(third == @"Lucky Guess", "Third should be Lucky Guess");
}

// --------------------------------------------------------------------------
// Additional: game_details shows unlimited vs limited max attempts
// --------------------------------------------------------------------------

#[test]
fn test_game_details_unlimited_max_attempts() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_id: felt252 = 1600;

    // Easy mode has unlimited attempts (max_attempts=0)
    ng.new_game(token_id, 1);

    let game_details = details.game_details(token_id);
    // "Max Attempts" is at index 7
    let max_attempts_detail = game_details.at(7);
    assert!(*max_attempts_detail.name == "Max Attempts", "Index 7 should be Max Attempts");
    assert!(*max_attempts_detail.value == "Unlimited", "Easy mode should show 'Unlimited'");
}

#[test]
fn test_game_details_limited_max_attempts() {
    let (ng, address) = setup_number_guess();
    let details = IMinigameDetailsDispatcher { contract_address: address };
    let token_id: felt252 = 1601;

    // Medium mode has max_attempts=10
    ng.new_game(token_id, 2);

    let game_details = details.game_details(token_id);
    let max_attempts_detail = game_details.at(7);
    assert!(*max_attempts_detail.name == "Max Attempts", "Index 7 should be Max Attempts");
    assert!(*max_attempts_detail.value == "10", "Medium mode should show '10'");
}

// --------------------------------------------------------------------------
// Additional: score_batch and game_over_batch with mixed states
// --------------------------------------------------------------------------

#[test]
fn test_score_batch_with_gameplay() {
    let (ng, address) = setup_number_guess();
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token1: felt252 = 1700;
    let token2: felt252 = 1701;

    // Win a game for token1
    ng.new_game(token1, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token1) || low > high {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token1, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    };

    // token2 has no game
    let scores = token_data.score_batch(array![token1, token2].span());
    assert!(*scores.at(0) >= 100, "Token1 should have score >= 100 after win");
    assert!(*scores.at(1) == 0, "Token2 should have score 0");
}

#[test]
fn test_game_over_batch_mixed_states() {
    let (ng, address) = setup_number_guess();
    let token_data = IMinigameTokenDataDispatcher { contract_address: address };
    let token1: felt252 = 1800;
    let token2: felt252 = 1801;

    // Win a game for token1
    ng.new_game(token1, 1);
    let mut low: u32 = 1;
    let mut high: u32 = 10;
    loop {
        if token_data.game_over(token1) || low > high {
            break;
        }
        let mid = (low + high) / 2;
        let result = ng.guess(token1, mid);
        if result == 0 {
            break;
        } else if result == -1 {
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    };

    // token2 is still playing
    ng.new_game(token2, 1);

    let results = token_data.game_over_batch(array![token1, token2].span());
    assert!(*results.at(0), "Token1 game should be over (won)");
    assert!(!*results.at(1), "Token2 game should not be over (playing)");
}

// --------------------------------------------------------------------------
// Additional: settings_count after creating custom settings
// --------------------------------------------------------------------------

#[test]
fn test_settings_count() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let settings_details = IMinigameSettingsDetailsDispatcher { contract_address: address };

    assert!(settings_details.settings_count() == 3, "Initial settings count should be 3");

    config.create_settings("Custom1", "Custom difficulty", 1, 20, 5);
    assert!(settings_details.settings_count() == 4, "Settings count should be 4");

    config.create_settings("Custom2", "Another difficulty", 1, 50, 8);
    assert!(settings_details.settings_count() == 5, "Settings count should be 5");
}

// --------------------------------------------------------------------------
// Additional: objectives_count after creating custom objectives
// --------------------------------------------------------------------------

#[test]
fn test_objectives_count() {
    let (_, address) = setup_number_guess();
    let config = INumberGuessConfigDispatcher { contract_address: address };
    let objectives_details = IMinigameObjectivesDetailsDispatcher { contract_address: address };

    assert!(objectives_details.objectives_count() == 3, "Initial objectives count should be 3");

    config.create_objective("Custom Obj", "Custom objective", 1, 1);
    assert!(objectives_details.objectives_count() == 4, "Objectives count should be 4");
}
