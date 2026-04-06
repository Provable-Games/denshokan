// Filter module for Denshokan token querying
// Provides paginated view functions that combine owner-based enumerable iteration
// with PackedTokenId unpacking for efficient token filtering.

use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::GameObjectiveDetails;
use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
pub use game_components_embeddable_game_standard::registry::interface::{GameFeeInfo, GameMetadata};

// Re-export TokenFullState from game-components (canonical definition)
pub use game_components_embeddable_game_standard::token::structs::TokenFullState;
use starknet::ContractAddress;

/// Extended token state including Denshokan-specific resolved fields
/// Wraps TokenFullState with minter_address, renderer_address, skills_address, client_url
#[derive(Drop, Serde)]
pub struct DenshokanTokenState {
    pub base: TokenFullState,
    pub minter_address: ContractAddress,
    pub renderer_address: ContractAddress,
    pub skills_address: ContractAddress,
    pub client_url: ByteArray,
}

/// Maximum number of tokens returned per filter call
/// Prevents gas exhaustion on large queries
pub const MAX_FILTER_LIMIT: u256 = 100;

/// Result struct for filter operations
/// Contains matching token IDs and total count for pagination UI
#[derive(Drop, Serde)]
pub struct FilterResult {
    pub token_ids: Array<felt252>, // Matching token IDs
    pub total: u256 // Total matches (for pagination UI)
}

/// Filter interface for querying tokens by various owner-based criteria
/// All functions use O(n) iteration where n = owner balance
#[starknet::interface]
pub trait IDenshokanFilter<TState> {
    // ============================================================
    // OWNER + GAME FILTER (uses token_of_owner_by_index for efficiency)
    // ============================================================

    /// Returns tokens owned by address that belong to a specific game
    fn tokens_of_owner_by_game(
        self: @TState,
        owner: ContractAddress,
        game_address: ContractAddress,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    // ============================================================
    // OWNER + PLAYABLE/GAME_OVER FILTERS
    // ============================================================

    /// Returns playable tokens owned by address for a specific game
    fn tokens_of_owner_by_game_and_playable(
        self: @TState,
        owner: ContractAddress,
        game_address: ContractAddress,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    /// Returns owner's tokens filtered by soulbound status
    fn tokens_of_owner_by_soulbound(
        self: @TState, owner: ContractAddress, is_soulbound: bool, offset: u256, limit: u256,
    ) -> FilterResult;

    // ============================================================
    // OWNER + MINTER FILTER
    // ============================================================

    /// Returns tokens owned by address that were minted by a specific minter
    /// Use case: "Show my tokens from this arcade"
    fn tokens_of_owner_by_minter(
        self: @TState,
        owner: ContractAddress,
        minter_address: ContractAddress,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    // ============================================================
    // OWNER + GAME + SETTINGS FILTER
    // ============================================================

    /// Returns tokens owned by address for a specific game with specific settings
    /// Use case: "My hard-mode TicTacToe games"
    fn tokens_of_owner_by_game_and_settings(
        self: @TState,
        owner: ContractAddress,
        game_address: ContractAddress,
        settings_id: u32,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    // ============================================================
    // OWNER + GAME + OBJECTIVE FILTER
    // ============================================================

    /// Returns tokens owned by address for a specific game with specific objective
    /// Use case: "My speedrun TicTacToe games"
    fn tokens_of_owner_by_game_and_objective(
        self: @TState,
        owner: ContractAddress,
        game_address: ContractAddress,
        objective_id: u32,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    // ============================================================
    // OWNER + GAME + GAME_OVER FILTER
    // ============================================================

    /// Returns finished (game_over) tokens owned by address for a specific game
    /// Use case: "My finished games for leaderboard"
    fn tokens_of_owner_by_game_and_game_over(
        self: @TState,
        owner: ContractAddress,
        game_address: ContractAddress,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    // ============================================================
    // COUNT FUNCTIONS (for pagination UI)
    // ============================================================

    fn count_tokens_of_owner_by_game(
        self: @TState, owner: ContractAddress, game_address: ContractAddress,
    ) -> u256;

    fn count_tokens_of_owner_by_game_and_playable(
        self: @TState, owner: ContractAddress, game_address: ContractAddress,
    ) -> u256;

    fn count_tokens_of_owner_by_soulbound(
        self: @TState, owner: ContractAddress, is_soulbound: bool,
    ) -> u256;

    fn count_tokens_of_owner_by_minter(
        self: @TState, owner: ContractAddress, minter_address: ContractAddress,
    ) -> u256;

    fn count_tokens_of_owner_by_game_and_settings(
        self: @TState, owner: ContractAddress, game_address: ContractAddress, settings_id: u32,
    ) -> u256;

    fn count_tokens_of_owner_by_game_and_objective(
        self: @TState, owner: ContractAddress, game_address: ContractAddress, objective_id: u32,
    ) -> u256;

    fn count_tokens_of_owner_by_game_and_game_over(
        self: @TState, owner: ContractAddress, game_address: ContractAddress,
    ) -> u256;

    // ============================================================
    // OWNER TOKENS (no game filter)
    // ============================================================

    /// Returns all tokens owned by address (paginated)
    fn tokens_of_owner(
        self: @TState, owner: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns count of all tokens owned by address
    fn count_tokens_of_owner(self: @TState, owner: ContractAddress) -> u256;

    // ============================================================
    // OWNER + PLAYABLE STATUS (across all games)
    // ============================================================

    /// Returns owner's playable tokens across all games
    fn tokens_of_owner_by_playable(
        self: @TState, owner: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns owner's game_over tokens across all games
    fn tokens_of_owner_by_game_over(
        self: @TState, owner: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns count of owner's playable tokens across all games
    fn count_tokens_of_owner_by_playable(self: @TState, owner: ContractAddress) -> u256;

    /// Returns count of owner's game_over tokens across all games
    fn count_tokens_of_owner_by_game_over(self: @TState, owner: ContractAddress) -> u256;

    // ============================================================
    // BATCH FULL STATE (high impact for RPC efficiency)
    // ============================================================

    /// Returns full state for multiple tokens in one call
    /// Includes: owner, player_name, is_playable, game_address, game_over, completed_objective,
    /// lifecycle
    fn tokens_full_state_batch(self: @TState, token_ids: Array<felt252>) -> Array<TokenFullState>;

    /// Returns enriched Denshokan state for multiple tokens in one call
    /// Extends TokenFullState with minter_address, renderer_address, skills_address, client_url
    fn denshokan_tokens_batch(
        self: @TState, token_ids: Array<felt252>,
    ) -> Array<DenshokanTokenState>;
}

#[derive(Drop, Serde)]
pub struct SettingsEntry {
    pub game_address: ContractAddress,
    pub settings_id: u32,
    pub details: GameSettingDetails,
}

#[derive(Drop, Serde)]
pub struct ObjectiveEntry {
    pub game_address: ContractAddress,
    pub objective_id: u32,
    pub details: GameObjectiveDetails,
}

#[derive(Drop, Serde)]
pub struct SettingsResult {
    pub entries: Array<SettingsEntry>,
    pub total: u32,
}

#[derive(Drop, Serde)]
pub struct ObjectivesResult {
    pub entries: Array<ObjectiveEntry>,
    pub total: u32,
}

#[starknet::interface]
pub trait IDenshokanSettingsObjectives<TState> {
    /// Returns settings across all games, or filtered to a single game if game_address is non-zero.
    /// Pass limit=0 to return all results (no cap).
    fn all_settings(
        self: @TState, game_address: ContractAddress, offset: u32, limit: u32,
    ) -> SettingsResult;
    /// Returns objectives across all games, or filtered to a single game if game_address is
    /// non-zero.
    /// Pass limit=0 to return all results (no cap).
    fn all_objectives(
        self: @TState, game_address: ContractAddress, offset: u32, limit: u32,
    ) -> ObjectivesResult;
    fn count_settings(self: @TState, game_address: ContractAddress) -> u32;
    fn count_objectives(self: @TState, game_address: ContractAddress) -> u32;
}

/// Combined game metadata + fee info for efficient RPC batching
#[derive(Drop, Serde)]
pub struct GameEntry {
    pub game_id: u64,
    pub metadata: GameMetadata,
    pub fee_info: GameFeeInfo,
}

#[derive(Drop, Serde)]
pub struct GamesResult {
    pub entries: Array<GameEntry>,
    pub total: u64,
}

/// Game listing and filtering interface
/// Provides paginated access to registered games via the MinigameRegistry
#[starknet::interface]
pub trait IDenshokanGames<TState> {
    /// Returns all registered games (paginated)
    /// Pass limit=0 to return all results
    fn all_games(self: @TState, offset: u64, limit: u64) -> GamesResult;

    /// Returns games filtered by genre (exact match, paginated)
    fn games_by_genre(self: @TState, genre: ByteArray, offset: u64, limit: u64) -> GamesResult;

    /// Returns games filtered by developer (exact match, paginated)
    fn games_by_developer(
        self: @TState, developer: ByteArray, offset: u64, limit: u64,
    ) -> GamesResult;

    /// Returns games filtered by publisher (exact match, paginated)
    fn games_by_publisher(
        self: @TState, publisher: ByteArray, offset: u64, limit: u64,
    ) -> GamesResult;

    /// Returns total number of registered games
    fn game_count(self: @TState) -> u64;
}
