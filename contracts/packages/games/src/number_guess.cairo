use starknet::ContractAddress;

// ==========================================================================
// NUMBER GUESSING GAME INTERFACE
// ==========================================================================

#[starknet::interface]
pub trait INumberGuess<TContractState> {
    /// Start a new game for a token. Settings (difficulty level) are extracted from the packed
    /// token ID.
    fn new_game(ref self: TContractState, token_id: felt252);
    /// Make a guess. Returns: -1 (too low), 0 (correct), 1 (too high).
    fn guess(ref self: TContractState, token_id: felt252, number: u32) -> i8;
    /// Get the current guess count for the active game.
    fn guess_count(self: @TContractState, token_id: felt252) -> u32;
    /// Get the configured range (min, max) for the active game.
    fn get_range(self: @TContractState, token_id: felt252) -> (u32, u32);
    /// Get the max attempts for the active game (0 = unlimited).
    fn get_max_attempts(self: @TContractState, token_id: felt252) -> u32;
    /// Get total games played for a token.
    fn games_played(self: @TContractState, token_id: felt252) -> u32;
    /// Get total games won for a token.
    fn games_won(self: @TContractState, token_id: felt252) -> u32;
    /// Get the best score (lowest guesses to win) for a token.
    fn best_score(self: @TContractState, token_id: felt252) -> u32;
    /// Get the count of perfect games (1-guess wins) for a token.
    fn perfect_games(self: @TContractState, token_id: felt252) -> u32;
    /// Get the current game status for a token.
    fn game_status(self: @TContractState, token_id: felt252) -> u8;
}

/// Public configuration interface for creating settings and objectives.
/// Anyone can create new settings or objectives - this is intentionally permissionless.
#[starknet::interface]
pub trait INumberGuessConfig<TContractState> {
    /// Create a new settings configuration. Returns the new settings_id.
    /// Public - anyone can create custom difficulty settings.
    fn create_settings(
        ref self: TContractState,
        name: ByteArray,
        description: ByteArray,
        min: u32,
        max: u32,
        max_attempts: u32,
    ) -> u32;

    /// Create a new objective. Returns the new objective_id.
    /// Public - anyone can create custom objectives.
    /// Objective types: 1=Win, 2=WinWithinN (threshold=max guesses), 3=PerfectGame
    fn create_objective(
        ref self: TContractState,
        name: ByteArray,
        description: ByteArray,
        objective_type: u8,
        threshold: u32,
    ) -> u32;
}

#[starknet::interface]
pub trait INumberGuessInit<TContractState> {
    fn initializer(
        ref self: TContractState,
        game_creator: ContractAddress,
        game_name: ByteArray,
        game_description: ByteArray,
        game_developer: ByteArray,
        game_publisher: ByteArray,
        game_genre: ByteArray,
        game_image: ByteArray,
        game_color: Option<ByteArray>,
        client_url: Option<ByteArray>,
        renderer_address: Option<ContractAddress>,
        settings_address: Option<ContractAddress>,
        objectives_address: Option<ContractAddress>,
        minigame_token_address: ContractAddress,
        royalty_fraction: Option<u128>,
    );
}

// ==========================================================================
// GAME STATUS CONSTANTS
// ==========================================================================

const STATUS_NO_GAME: u8 = 0;
const STATUS_PLAYING: u8 = 1;
const STATUS_WON: u8 = 2;
const STATUS_LOST: u8 = 3;

// ==========================================================================
// SCORE CONSTANTS
// ==========================================================================

const BASE_SCORE: u64 = 100;
const EFFICIENCY_BONUS_MULTIPLIER: u64 = 10;
const PERFECT_GAME_BONUS: u64 = 50;

// ==========================================================================
// PURE RANDOMNESS FUNCTION
// ==========================================================================

/// Generate a pseudo-random number using Pedersen hash.
/// seed: typically token_id + games_played
/// min/max: inclusive range
fn pedersen_random(seed: felt252, min: u32, max: u32) -> u32 {
    assert!(max > min, "max must be greater than min");
    let range: u32 = max - min + 1;

    // Use core::pedersen for hashing
    let hash: felt252 = core::pedersen::pedersen(seed, seed);

    // Convert hash to u256 for safe modulo operation
    let hash_u256: u256 = hash.into();
    let range_u256: u256 = range.into();
    let result_u256: u256 = hash_u256 % range_u256;

    // Safe to unwrap since result is within u32 range
    let result: u32 = result_u256.try_into().unwrap();
    min + result
}

/// Calculate optimal guesses for a range (binary search optimal).
/// optimal = ceil(log2(range_size))
fn optimal_guesses(range_size: u32) -> u32 {
    if range_size <= 1 {
        return 1;
    }
    let mut n = range_size;
    let mut count: u32 = 0;
    loop {
        if n == 0 {
            break;
        }
        count += 1;
        n = n / 2;
    }
    count
}

/// Calculate score for a win.
fn calculate_score(actual_guesses: u32, range_min: u32, range_max: u32) -> u64 {
    let range_size = range_max - range_min + 1;
    let optimal = optimal_guesses(range_size);

    let mut score: u64 = BASE_SCORE;

    // Efficiency bonus if under optimal
    if actual_guesses < optimal {
        let bonus: u64 = ((optimal - actual_guesses + 1)
            * EFFICIENCY_BONUS_MULTIPLIER.try_into().unwrap())
            .into();
        score += bonus;
    }

    // Perfect game bonus (1 guess)
    if actual_guesses == 1 {
        score += PERFECT_GAME_BONUS;
    }

    score
}

// ==========================================================================
// CONTRACT
// ==========================================================================

#[starknet::contract]
pub mod NumberGuess {
    use game_components_embeddable_game_standard::minigame::extensions::objectives::interface::{
        IMinigameObjectives, IMinigameObjectivesDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::objectives::objectives::ObjectivesComponent;
    use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::{
        GameObjective, GameObjectiveDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMinigameSettings, IMinigameSettingsDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::settings::SettingsComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::{
        GameSetting, GameSettingDetails,
    };
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameDetails, IMinigameTokenData,
    };
    use game_components_embeddable_game_standard::minigame::minigame_component::MinigameComponent;
    use game_components_embeddable_game_standard::minigame::structs::GameDetail;
    use game_components_embeddable_game_standard::token::structs::unpack_settings_id;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_contract_address};
    use super::{
        STATUS_LOST, STATUS_NO_GAME, STATUS_PLAYING, STATUS_WON, calculate_score, pedersen_random,
    };

    // ======================================================================
    // COMPONENTS
    // ======================================================================

    component!(path: MinigameComponent, storage: minigame, event: MinigameEvent);
    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SettingsComponent, storage: settings, event: SettingsEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl MinigameImpl = MinigameComponent::MinigameImpl<ContractState>;
    impl MinigameInternalImpl = MinigameComponent::InternalImpl<ContractState>;
    impl ObjectivesInternalImpl = ObjectivesComponent::InternalImpl<ContractState>;
    impl SettingsInternalImpl = SettingsComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    // ======================================================================
    // STORAGE
    // ======================================================================

    #[storage]
    struct Storage {
        #[substorage(v0)]
        minigame: MinigameComponent::Storage,
        #[substorage(v0)]
        objectives: ObjectivesComponent::Storage,
        #[substorage(v0)]
        settings: SettingsComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        // Game state per token
        secret_numbers: Map<felt252, u32>, // 0 if no active game
        current_guess_count: Map<felt252, u32>,
        game_status: Map<felt252, u8>,
        // Range config (set from settings when game starts)
        range_min: Map<felt252, u32>,
        range_max: Map<felt252, u32>,
        max_attempts: Map<felt252, u32>, // 0 = unlimited
        // Statistics
        games_played: Map<felt252, u32>,
        games_won: Map<felt252, u32>,
        best_score: Map<felt252, u32>, // Lowest guesses to win
        perfect_games: Map<felt252, u32>, // 1-guess wins
        scores: Map<felt252, u64>, // Cumulative score
        // Settings storage
        settings_count: u32,
        // settings_id -> (name, description, min, max, max_attempts, exists)
        settings_data: Map<u32, (ByteArray, ByteArray, u32, u32, u32, bool)>,
        // Objectives storage
        objective_count: u32,
        // objective_id -> (type, threshold, exists)
        // type: 1=Win, 2=WinWithinN, 3=PerfectGame
        objective_data: Map<u32, (u8, u32, bool)>,
        // Per-token, per-objective completion tracking (for single-game objectives)
        token_objectives_completed: Map<(felt252, u32), bool>,
        // Objective metadata for display names/descriptions
        // objective_id -> (name, description)
        objective_metadata: Map<u32, (ByteArray, ByteArray)>,
    }

    // ======================================================================
    // EVENTS
    // ======================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        MinigameEvent: MinigameComponent::Event,
        #[flat]
        ObjectivesEvent: ObjectivesComponent::Event,
        #[flat]
        SettingsEvent: SettingsComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    // ======================================================================
    // IMinigameTokenData — score & game_over
    // ======================================================================

    #[abi(embed_v0)]
    impl TokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            self.scores.entry(token_id).read()
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            let status = self.game_status.entry(token_id).read();
            status == STATUS_WON || status == STATUS_LOST
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.score(*token_ids.at(i)));
                i += 1;
            }
            results
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.game_over(*token_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameDetails — token name, description, game details
    // ======================================================================

    #[abi(embed_v0)]
    impl DetailsImpl of IMinigameDetails<ContractState> {
        fn token_name(self: @ContractState, token_id: felt252) -> ByteArray {
            "Number Guess"
        }

        fn token_description(self: @ContractState, token_id: felt252) -> ByteArray {
            let won = self.games_won.entry(token_id).read();
            let played = self.games_played.entry(token_id).read();
            let best = self.best_score.entry(token_id).read();
            let perfect = self.perfect_games.entry(token_id).read();
            format!(
                "Number Guessing Game on-chain. Record: {} wins out of {} games. Best: {} guesses. Perfect games: {}.",
                won,
                played,
                best,
                perfect,
            )
        }

        fn game_details(self: @ContractState, token_id: felt252) -> Span<GameDetail> {
            let won = self.games_won.entry(token_id).read();
            let played = self.games_played.entry(token_id).read();
            let best = self.best_score.entry(token_id).read();
            let perfect = self.perfect_games.entry(token_id).read();
            let current_guesses = self.current_guess_count.entry(token_id).read();
            let status_val = self.game_status.entry(token_id).read();
            let range_min = self.range_min.entry(token_id).read();
            let range_max = self.range_max.entry(token_id).read();
            let max_attempts = self.max_attempts.entry(token_id).read();
            let score = self.scores.entry(token_id).read();

            let status_str: ByteArray = if status_val == STATUS_NO_GAME {
                "No Game"
            } else if status_val == STATUS_PLAYING {
                "Playing"
            } else if status_val == STATUS_WON {
                "Won"
            } else {
                "Lost"
            };

            let attempts_str: ByteArray = if max_attempts == 0 {
                "Unlimited"
            } else {
                format!("{}", max_attempts)
            };

            array![
                GameDetail { name: "Wins", value: format!("{}", won) },
                GameDetail { name: "Games Played", value: format!("{}", played) },
                GameDetail { name: "Best Score", value: format!("{} guesses", best) },
                GameDetail { name: "Perfect Games", value: format!("{}", perfect) },
                GameDetail { name: "Current Guesses", value: format!("{}", current_guesses) },
                GameDetail { name: "Status", value: status_str },
                GameDetail { name: "Range", value: format!("{}-{}", range_min, range_max) },
                GameDetail { name: "Max Attempts", value: attempts_str },
                GameDetail { name: "Total Score", value: format!("{}", score) },
            ]
                .span()
        }

        fn token_name_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<ByteArray> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.token_name(*token_ids.at(i)));
                i += 1;
            }
            results
        }

        fn token_description_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.token_description(*token_ids.at(i)));
                i += 1;
            }
            results
        }

        fn game_details_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<Span<GameDetail>> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.game_details(*token_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameSettings
    // ======================================================================

    #[abi(embed_v0)]
    impl GameSettingsImpl of IMinigameSettings<ContractState> {
        fn settings_exist(self: @ContractState, settings_id: u32) -> bool {
            let (_, _, _, _, _, exists) = self.settings_data.entry(settings_id).read();
            exists
        }

        fn settings_exist_batch(self: @ContractState, settings_ids: Span<u32>) -> Array<bool> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= settings_ids.len() {
                    break;
                }
                results.append(self.settings_exist(*settings_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameSettingsDetails
    // ======================================================================

    #[abi(embed_v0)]
    impl GameSettingsDetailsImpl of IMinigameSettingsDetails<ContractState> {
        fn settings_details(self: @ContractState, settings_id: u32) -> GameSettingDetails {
            let (name, description, min, max, max_attempts, _) = self
                .settings_data
                .entry(settings_id)
                .read();

            let attempts_str: ByteArray = if max_attempts == 0 {
                "Unlimited"
            } else {
                format!("{}", max_attempts)
            };

            GameSettingDetails {
                name,
                description,
                settings: array![
                    GameSetting { name: "Range Min", value: format!("{}", min) },
                    GameSetting { name: "Range Max", value: format!("{}", max) },
                    GameSetting { name: "Max Attempts", value: attempts_str },
                ]
                    .span(),
            }
        }

        fn settings_details_batch(
            self: @ContractState, settings_ids: Span<u32>,
        ) -> Array<GameSettingDetails> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= settings_ids.len() {
                    break;
                }
                results.append(self.settings_details(*settings_ids.at(i)));
                i += 1;
            }
            results
        }

        fn settings_count(self: @ContractState) -> u32 {
            self.settings_count.read()
        }
    }

    // ======================================================================
    // IMinigameObjectives
    // ======================================================================

    #[abi(embed_v0)]
    impl GameObjectivesImpl of IMinigameObjectives<ContractState> {
        fn objective_exists(self: @ContractState, objective_id: u32) -> bool {
            let (_, _, exists) = self.objective_data.entry(objective_id).read();
            exists
        }

        fn completed_objective(self: @ContractState, token_id: felt252, objective_id: u32) -> bool {
            let (_, _, exists) = self.objective_data.entry(objective_id).read();
            if !exists {
                return false;
            }

            // Check the per-token, per-objective completion tracking
            // Objectives are now single-game scoped (recorded when the game is won)
            self.token_objectives_completed.entry((token_id, objective_id)).read()
        }

        fn objective_exists_batch(self: @ContractState, objective_ids: Span<u32>) -> Array<bool> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= objective_ids.len() {
                    break;
                }
                results.append(self.objective_exists(*objective_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameObjectivesDetails
    // ======================================================================

    #[abi(embed_v0)]
    impl GameObjectivesDetailsImpl of IMinigameObjectivesDetails<ContractState> {
        fn objectives_details(self: @ContractState, objective_id: u32) -> GameObjectiveDetails {
            let (objective_type, threshold, exists) = self
                .objective_data
                .entry(objective_id)
                .read();
            assert!(exists, "Objective does not exist");

            let (name, description) = self.objective_metadata.entry(objective_id).read();

            // Build objectives array with type and threshold info
            let mut objectives = array![];
            objectives.append(GameObjective { name: "type", value: format!("{}", objective_type) });
            objectives.append(GameObjective { name: "threshold", value: format!("{}", threshold) });

            GameObjectiveDetails { name, description, objectives: objectives.span() }
        }

        fn objective_settings_id(self: @ContractState, objective_id: u32) -> u32 {
            0
        }

        fn objectives_details_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<GameObjectiveDetails> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= objective_ids.len() {
                    break;
                }
                results.append(self.objectives_details(*objective_ids.at(i)));
                i += 1;
            }
            results
        }

        fn objective_settings_id_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<u32> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= objective_ids.len() {
                    break;
                }
                results.append(0);
                i += 1;
            }
            results
        }

        fn objectives_count(self: @ContractState) -> u32 {
            self.objective_count.read()
        }
    }

    // ======================================================================
    // INumberGuess — Game logic
    // ======================================================================

    #[abi(embed_v0)]
    impl NumberGuessImpl of super::INumberGuess<ContractState> {
        fn new_game(ref self: ContractState, token_id: felt252) {
            self.minigame.pre_action(token_id);

            // Extract settings_id from packed token_id (immutable, set at mint time)
            let settings_id = unpack_settings_id(token_id);

            // Look up settings; settings_id 0 means "no settings" — use defaults
            let (min, max, max_attempts) = if settings_id == 0 {
                (1_u32, 10_u32, 0_u32) // Default: range 1-10, unlimited attempts
            } else {
                let (_, _, min, max, max_attempts, exists) = self
                    .settings_data
                    .entry(settings_id)
                    .read();
                assert!(exists, "Settings do not exist");
                (min, max, max_attempts)
            };

            // Generate random secret number
            let games_played = self.games_played.entry(token_id).read();
            let seed: felt252 = token_id + games_played.into();
            let secret = pedersen_random(seed, min, max);

            // Initialize game state
            self.secret_numbers.entry(token_id).write(secret);
            self.current_guess_count.entry(token_id).write(0);
            self.game_status.entry(token_id).write(STATUS_PLAYING);
            self.range_min.entry(token_id).write(min);
            self.range_max.entry(token_id).write(max);
            self.max_attempts.entry(token_id).write(max_attempts);

            self.minigame.post_action(token_id);
        }

        fn guess(ref self: ContractState, token_id: felt252, number: u32) -> i8 {
            self.minigame.pre_action(token_id);

            // Verify game is active
            let status = self.game_status.entry(token_id).read();
            assert!(status == STATUS_PLAYING, "No active game");

            // Verify guess is within range
            let min = self.range_min.entry(token_id).read();
            let max = self.range_max.entry(token_id).read();
            assert!(number >= min && number <= max, "Guess out of range");

            // Increment guess count
            let guess_count = self.current_guess_count.entry(token_id).read() + 1;
            self.current_guess_count.entry(token_id).write(guess_count);

            // Get secret number
            let secret = self.secret_numbers.entry(token_id).read();

            // Determine result
            let result = if number == secret {
                // Correct guess - player wins
                self.game_status.entry(token_id).write(STATUS_WON);

                // Update statistics
                let played = self.games_played.entry(token_id).read() + 1;
                self.games_played.entry(token_id).write(played);

                let won = self.games_won.entry(token_id).read() + 1;
                self.games_won.entry(token_id).write(won);

                // Update best score
                let current_best = self.best_score.entry(token_id).read();
                if current_best == 0 || guess_count < current_best {
                    self.best_score.entry(token_id).write(guess_count);
                }

                // Check for perfect game
                if guess_count == 1 {
                    let perfect = self.perfect_games.entry(token_id).read() + 1;
                    self.perfect_games.entry(token_id).write(perfect);
                }

                // Calculate and add score
                let points = calculate_score(guess_count, min, max);
                let total_score = self.scores.entry(token_id).read() + points;
                self.scores.entry(token_id).write(total_score);

                // Check and record single-game objective completions
                self.check_and_record_objectives(token_id, guess_count);

                0_i8 // Correct
            } else {
                // Check if max attempts reached
                let max_attempts = self.max_attempts.entry(token_id).read();
                if max_attempts > 0 && guess_count >= max_attempts {
                    // Game over - player loses
                    self.game_status.entry(token_id).write(STATUS_LOST);

                    let played = self.games_played.entry(token_id).read() + 1;
                    self.games_played.entry(token_id).write(played);
                }

                // Return feedback
                if number < secret {
                    -1_i8 // Too low
                } else {
                    1_i8 // Too high
                }
            };

            self.minigame.post_action(token_id);
            result
        }

        fn guess_count(self: @ContractState, token_id: felt252) -> u32 {
            self.current_guess_count.entry(token_id).read()
        }

        fn get_range(self: @ContractState, token_id: felt252) -> (u32, u32) {
            (self.range_min.entry(token_id).read(), self.range_max.entry(token_id).read())
        }

        fn get_max_attempts(self: @ContractState, token_id: felt252) -> u32 {
            self.max_attempts.entry(token_id).read()
        }

        fn games_played(self: @ContractState, token_id: felt252) -> u32 {
            self.games_played.entry(token_id).read()
        }

        fn games_won(self: @ContractState, token_id: felt252) -> u32 {
            self.games_won.entry(token_id).read()
        }

        fn best_score(self: @ContractState, token_id: felt252) -> u32 {
            self.best_score.entry(token_id).read()
        }

        fn perfect_games(self: @ContractState, token_id: felt252) -> u32 {
            self.perfect_games.entry(token_id).read()
        }

        fn game_status(self: @ContractState, token_id: felt252) -> u8 {
            self.game_status.entry(token_id).read()
        }
    }

    // ======================================================================
    // INumberGuessConfig — Public configuration
    // ======================================================================

    #[abi(embed_v0)]
    impl NumberGuessConfigImpl of super::INumberGuessConfig<ContractState> {
        fn create_settings(
            ref self: ContractState,
            name: ByteArray,
            description: ByteArray,
            min: u32,
            max: u32,
            max_attempts: u32,
        ) -> u32 {
            // Validate inputs
            assert!(max > min, "max must be greater than min");

            // Auto-increment settings ID
            let settings_id = self.settings_count.read() + 1;
            self.settings_count.write(settings_id);

            // Store settings data
            self
                .settings_data
                .entry(settings_id)
                .write((name, description, min, max, max_attempts, true));

            settings_id
        }

        fn create_objective(
            ref self: ContractState,
            name: ByteArray,
            description: ByteArray,
            objective_type: u8,
            threshold: u32,
        ) -> u32 {
            // Validate objective type (1=Win, 2=WinWithinN, 3=PerfectGame)
            assert!(
                objective_type >= 1 && objective_type <= 3, "Invalid objective type (must be 1-3)",
            );

            // Auto-increment objective ID
            let objective_id = self.objective_count.read() + 1;
            self.objective_count.write(objective_id);

            // Store objective data and metadata
            self.objective_data.entry(objective_id).write((objective_type, threshold, true));
            self.objective_metadata.entry(objective_id).write((name, description));

            objective_id
        }
    }

    // ======================================================================
    // Internal helpers
    // ======================================================================

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// Check and record objective completions for this specific game.
        /// Called after a win to evaluate single-game objectives.
        fn check_and_record_objectives(
            ref self: ContractState, token_id: felt252, guess_count: u32,
        ) {
            let count = self.objective_count.read();
            let mut i: u32 = 1;
            while i <= count {
                let (obj_type, threshold, exists) = self.objective_data.entry(i).read();
                if exists {
                    // Check if already completed for this token
                    let already_completed = self
                        .token_objectives_completed
                        .entry((token_id, i))
                        .read();
                    if !already_completed {
                        let completed = if obj_type == 1 {
                            // Type 1: Win - completed on any win
                            true
                        } else if obj_type == 2 {
                            // Type 2: WinWithinN - win with <= threshold guesses
                            guess_count <= threshold
                        } else if obj_type == 3 {
                            // Type 3: PerfectGame - win on first guess
                            guess_count == 1
                        } else {
                            false
                        };

                        if completed {
                            self.token_objectives_completed.entry((token_id, i)).write(true);
                        }
                    }
                }
                i += 1;
            };
        }
    }

    // ======================================================================
    // Initializer
    // ======================================================================

    #[abi(embed_v0)]
    impl NumberGuessInitImpl of super::INumberGuessInit<ContractState> {
        fn initializer(
            ref self: ContractState,
            game_creator: ContractAddress,
            game_name: ByteArray,
            game_description: ByteArray,
            game_developer: ByteArray,
            game_publisher: ByteArray,
            game_genre: ByteArray,
            game_image: ByteArray,
            game_color: Option<ByteArray>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            settings_address: Option<ContractAddress>,
            objectives_address: Option<ContractAddress>,
            minigame_token_address: ContractAddress,
            royalty_fraction: Option<u128>,
        ) {
            let settings_address = match settings_address {
                Option::Some(address) => {
                    self.settings.initializer();
                    Option::Some(address)
                },
                Option::None => {
                    self.settings.initializer();
                    Option::Some(get_contract_address())
                },
            };
            let objectives_address = match objectives_address {
                Option::Some(address) => {
                    self.objectives.initializer();
                    Option::Some(address)
                },
                Option::None => {
                    self.objectives.initializer();
                    Option::Some(get_contract_address())
                },
            };

            self
                .minigame
                .initializer(
                    game_creator,
                    game_name,
                    game_description,
                    game_developer,
                    game_publisher,
                    game_genre,
                    game_image,
                    game_color,
                    client_url,
                    renderer_address,
                    settings_address,
                    objectives_address,
                    minigame_token_address,
                    royalty_fraction,
                );

            // Create default settings (3 difficulty levels)
            // Settings 1: Easy - Range 1-10, Unlimited attempts
            self
                .settings_data
                .entry(1)
                .write(("Easy", "Guess a number between 1 and 10", 1, 10, 0, true));
            // Settings 2: Medium - Range 1-100, 10 attempts
            self
                .settings_data
                .entry(2)
                .write(("Medium", "Guess a number between 1 and 100", 1, 100, 10, true));
            // Settings 3: Hard - Range 1-1000, 10 attempts
            self
                .settings_data
                .entry(3)
                .write(("Hard", "Guess a number between 1 and 1000", 1, 1000, 10, true));
            self.settings_count.write(3);

            // Create default objectives (3 single-game achievements)
            // Objective types: 1=Win, 2=WinWithinN, 3=PerfectGame
            //
            // Objective 1: First Win (type 1, threshold 1)
            self.objective_data.entry(1).write((1, 1, true));
            self.objective_metadata.entry(1).write(("First Win", "Win your first game"));
            // Objective 2: Quick Thinker - win in 5 or fewer guesses (type 2, threshold 5)
            self.objective_data.entry(2).write((2, 5, true));
            self
                .objective_metadata
                .entry(2)
                .write(("Quick Thinker", "Win a game in 5 or fewer guesses"));
            // Objective 3: Lucky Guess - perfect game (type 3, threshold 1)
            self.objective_data.entry(3).write((3, 1, true));
            self
                .objective_metadata
                .entry(3)
                .write(("Lucky Guess", "Win a game on your first guess"));
            self.objective_count.write(3);

            // Register objectives with the component
            self
                .objectives
                .create_objective(
                    1,
                    0,
                    GameObjectiveDetails {
                        name: "First Win",
                        description: "Win your first game",
                        objectives: array![].span(),
                    },
                    minigame_token_address,
                );
            self
                .objectives
                .create_objective(
                    2,
                    0,
                    GameObjectiveDetails {
                        name: "Quick Thinker",
                        description: "Win a game in 5 or fewer guesses",
                        objectives: array![].span(),
                    },
                    minigame_token_address,
                );
            self
                .objectives
                .create_objective(
                    3,
                    0,
                    GameObjectiveDetails {
                        name: "Lucky Guess",
                        description: "Win a game on your first guess",
                        objectives: array![].span(),
                    },
                    minigame_token_address,
                );

            // Create settings in the component
            self
                .settings
                .create_settings(
                    get_contract_address(),
                    1,
                    GameSettingDetails {
                        name: "Easy",
                        description: "Guess a number between 1 and 10",
                        settings: array![
                            GameSetting { name: "Range Min", value: "1" },
                            GameSetting { name: "Range Max", value: "10" },
                            GameSetting { name: "Max Attempts", value: "Unlimited" },
                        ]
                            .span(),
                    },
                    minigame_token_address,
                );
            self
                .settings
                .create_settings(
                    get_contract_address(),
                    2,
                    GameSettingDetails {
                        name: "Medium",
                        description: "Guess a number between 1 and 100",
                        settings: array![
                            GameSetting { name: "Range Min", value: "1" },
                            GameSetting { name: "Range Max", value: "100" },
                            GameSetting { name: "Max Attempts", value: "10" },
                        ]
                            .span(),
                    },
                    minigame_token_address,
                );
            self
                .settings
                .create_settings(
                    get_contract_address(),
                    3,
                    GameSettingDetails {
                        name: "Hard",
                        description: "Guess a number between 1 and 1000",
                        settings: array![
                            GameSetting { name: "Range Min", value: "1" },
                            GameSetting { name: "Range Max", value: "1000" },
                            GameSetting { name: "Max Attempts", value: "10" },
                        ]
                            .span(),
                    },
                    minigame_token_address,
                );
        }
    }
}
