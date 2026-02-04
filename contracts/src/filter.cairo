// Filter module for Denshokan token querying
// Provides paginated view functions that combine ERC721Enumerable iteration
// with PackedTokenId unpacking for efficient token filtering.

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
}
