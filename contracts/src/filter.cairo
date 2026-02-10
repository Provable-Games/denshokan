// Filter module for Denshokan token querying
// Provides paginated view functions that combine ERC721Enumerable iteration
// with PackedTokenId unpacking for efficient token filtering.

use game_components_minigame::extensions::objectives::structs::GameObjectiveDetails;
use game_components_minigame::extensions::settings::structs::GameSettingDetails;
use game_components_token::structs::Lifecycle;
use starknet::ContractAddress;

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

/// Full state for a token including mutable state not in packed token ID
/// Used for batch queries to minimize RPC calls
#[derive(Drop, Serde)]
pub struct TokenFullState {
    pub token_id: felt252,
    pub owner: ContractAddress,
    pub player_name: felt252,
    pub is_playable: bool,
    pub game_address: ContractAddress,
    pub game_over: bool,
    pub completed_objective: bool,
    pub lifecycle: Lifecycle,
}

/// Filter interface for querying tokens by various criteria
/// All functions use O(n) iteration where n = total_supply (or owner balance)
#[starknet::interface]
pub trait IDenshokanFilter<TState> {
    // ============================================================
    // GAME-BASED FILTERS (lookup game_id via registry)
    // ============================================================

    /// Returns tokens for a specific game address
    /// Looks up game_id from registry, returns empty if game not registered
    fn tokens_by_game_address(
        self: @TState, game_address: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns tokens for a game with specific settings
    fn tokens_by_game_and_settings(
        self: @TState, game_address: ContractAddress, settings_id: u32, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns tokens for a game with specific objective
    fn tokens_by_game_and_objective(
        self: @TState, game_address: ContractAddress, objective_id: u32, offset: u256, limit: u256,
    ) -> FilterResult;

    // ============================================================
    // MINTER-BASED FILTER (lookup minter_id via minter component)
    // ============================================================

    /// Returns tokens minted by a specific minter address
    /// Looks up minter_id from minter component, returns empty if unknown minter
    fn tokens_by_minter_address(
        self: @TState, minter_address: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

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
    // SOULBOUND FILTER
    // ============================================================

    /// Returns tokens based on soulbound status
    fn tokens_by_soulbound(
        self: @TState, is_soulbound: bool, offset: u256, limit: u256,
    ) -> FilterResult;

    // ============================================================
    // TIME-BASED FILTER (uses minted_at from packed token_id)
    // ============================================================

    /// Returns tokens minted within a time range (inclusive)
    fn tokens_by_minted_at_range(
        self: @TState, start_time: u64, end_time: u64, offset: u256, limit: u256,
    ) -> FilterResult;

    // ============================================================
    // PLAYABLE/GAME_OVER FILTERS (uses mutable state)
    // ============================================================

    /// Returns playable tokens for a specific game (most common UI query)
    fn tokens_by_game_and_playable(
        self: @TState, game_address: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns game_over tokens for a specific game (leaderboards/history)
    fn tokens_by_game_and_game_over(
        self: @TState, game_address: ContractAddress, offset: u256, limit: u256,
    ) -> FilterResult;

    /// Returns playable tokens owned by address for a specific game
    fn tokens_of_owner_by_game_and_playable(
        self: @TState,
        owner: ContractAddress,
        game_address: ContractAddress,
        offset: u256,
        limit: u256,
    ) -> FilterResult;

    /// Returns all playable tokens globally
    fn tokens_by_playable(self: @TState, offset: u256, limit: u256) -> FilterResult;

    /// Returns owner's tokens filtered by soulbound status
    fn tokens_of_owner_by_soulbound(
        self: @TState, owner: ContractAddress, is_soulbound: bool, offset: u256, limit: u256,
    ) -> FilterResult;

    // ============================================================
    // MINTER + OWNER FILTER
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
    // MINTER + GAME FILTER
    // ============================================================

    /// Returns tokens minted by a specific minter for a specific game
    /// Use case: "Show TicTacToe games from this minter"
    fn tokens_by_minter_and_game(
        self: @TState,
        minter_address: ContractAddress,
        game_address: ContractAddress,
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
    // GAME + SOULBOUND FILTER
    // ============================================================

    /// Returns tokens for a specific game filtered by soulbound status
    /// Use case: "Tradeable TicTacToe tokens"
    fn tokens_by_game_and_soulbound(
        self: @TState, game_address: ContractAddress, is_soulbound: bool, offset: u256, limit: u256,
    ) -> FilterResult;

    // ============================================================
    // COUNT FUNCTIONS (for pagination UI)
    // ============================================================

    fn count_tokens_by_game_address(self: @TState, game_address: ContractAddress) -> u256;

    fn count_tokens_by_game_and_settings(
        self: @TState, game_address: ContractAddress, settings_id: u32,
    ) -> u256;

    fn count_tokens_by_game_and_objective(
        self: @TState, game_address: ContractAddress, objective_id: u32,
    ) -> u256;

    fn count_tokens_by_minter_address(self: @TState, minter_address: ContractAddress) -> u256;

    fn count_tokens_of_owner_by_game(
        self: @TState, owner: ContractAddress, game_address: ContractAddress,
    ) -> u256;

    fn count_tokens_by_soulbound(self: @TState, is_soulbound: bool) -> u256;

    fn count_tokens_by_minted_at_range(self: @TState, start_time: u64, end_time: u64) -> u256;

    fn count_tokens_by_game_and_playable(self: @TState, game_address: ContractAddress) -> u256;

    fn count_tokens_by_game_and_game_over(self: @TState, game_address: ContractAddress) -> u256;

    fn count_tokens_of_owner_by_game_and_playable(
        self: @TState, owner: ContractAddress, game_address: ContractAddress,
    ) -> u256;

    fn count_tokens_by_playable(self: @TState) -> u256;

    fn count_tokens_of_owner_by_soulbound(
        self: @TState, owner: ContractAddress, is_soulbound: bool,
    ) -> u256;

    // ============================================================
    // COUNT FUNCTIONS FOR NEW FILTER COMBINATIONS
    // ============================================================

    fn count_tokens_of_owner_by_minter(
        self: @TState, owner: ContractAddress, minter_address: ContractAddress,
    ) -> u256;

    fn count_tokens_by_minter_and_game(
        self: @TState, minter_address: ContractAddress, game_address: ContractAddress,
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

    fn count_tokens_by_game_and_soulbound(
        self: @TState, game_address: ContractAddress, is_soulbound: bool,
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
    pub settings_id: u32,
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
    /// When settings_id != 0, only objectives matching that settings_id (or global objectives with
    /// settings_id == 0) are included.
    /// Pass limit=0 to return all results (no cap).
    fn all_objectives(
        self: @TState, game_address: ContractAddress, settings_id: u32, offset: u32, limit: u32,
    ) -> ObjectivesResult;
    fn count_settings(self: @TState, game_address: ContractAddress) -> u32;
    fn count_objectives(self: @TState, game_address: ContractAddress) -> u32;
}
