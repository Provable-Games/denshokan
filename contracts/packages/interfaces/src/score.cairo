// Score query interface for Denshokan token contract
// Provides a batch view function for retrieving the current score
// of multiple tokens in a single RPC round-trip.

/// Score query interface for batched score lookups across tokens.
/// Each token's score is fetched from its game contract via the registry.
/// Tokens with an unknown game (game_id == 0) or a game whose `score`
/// selector reverts return 0; callers can't distinguish that from a real 0.
#[starknet::interface]
pub trait IDenshokanScores<TState> {
    /// Returns the score for each token id in input order.
    /// Result length always equals `token_ids.len()`.
    fn get_scores(self: @TState, token_ids: Span<felt252>) -> Array<u64>;
}
