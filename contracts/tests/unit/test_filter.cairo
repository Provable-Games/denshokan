use denshokan::filter::{IDenshokanFilterDispatcher, IDenshokanFilterDispatcherTrait};
use game_components_registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_token::interface::IMinigameTokenMixinDispatcherTrait;
use game_components_token::structs::{unpack_game_id, unpack_soulbound};
use snforge_std::{CheatSpan, cheat_block_timestamp, cheat_caller_address};
use starknet::ContractAddress;
use crate::helpers::constants::{ALICE, BOB, CHARLIE, GAME_CREATOR};
use crate::helpers::setup::{register_game, setup_with_registry};

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

fn get_filter_dispatcher(denshokan_address: ContractAddress) -> IDenshokanFilterDispatcher {
    IDenshokanFilterDispatcher { contract_address: denshokan_address }
}

/// Helper to mint a token with specific parameters for testing
/// Uses salt to avoid token ID collisions
fn mint_token_with_salt(
    tc: @crate::helpers::setup::TestContracts,
    game_address: ContractAddress,
    to: ContractAddress,
    is_soulbound: bool,
    salt: u16,
) -> felt252 {
    cheat_caller_address(*tc.denshokan_address, to, CheatSpan::TargetCalls(1));
    let token_id = (*tc.token_mixin)
        .mint(
            game_address,
            Option::None, // renderer_address
            Option::None, // settings_id
            Option::None, // start_delay
            Option::None, // end_delay
            Option::None, // objective_id
            Option::None, // context_id
            Option::None, // paymaster
            Option::None, // player_name
            to,
            is_soulbound,
            false, // has_context
            0, // tx_hash
            salt,
        );
    token_id.try_into().unwrap()
}

// ================================================================================================
// GAME ADDRESS FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_by_game_address_empty_unregistered_game() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Query with an address that's not a registered game
    let fake_game: ContractAddress = 'FAKE_GAME'.try_into().unwrap();
    let result = filter.tokens_by_game_address(fake_game, 0, 100);

    assert!(result.token_ids.len() == 0, "Should return empty for unregistered game");
    assert!(result.total == 0, "Total should be 0 for unregistered game");
}

#[test]
fn test_tokens_by_game_address_with_tokens() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game and get its address
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint some tokens with different salts to avoid collision
    let _token1 = mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    let _token2 = mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 2);
    let _token3 = mint_token_with_salt(@tc, game_metadata.contract_address, CHARLIE(), false, 3);

    // Query tokens
    let result = filter.tokens_by_game_address(game_metadata.contract_address, 0, 100);

    assert!(result.token_ids.len() == 3, "Should return 3 tokens");
    assert!(result.total == 3, "Total should be 3");

    // Verify all returned tokens belong to the game
    let mut i = 0;
    while i < result.token_ids.len() {
        let tid = *result.token_ids.at(i);
        let unpacked_game_id = unpack_game_id(tid);
        assert!(unpacked_game_id == game_id.try_into().unwrap(), "Token should belong to game");
        i += 1;
    }
}

#[test]
fn test_tokens_by_game_address_pagination() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint 5 tokens with different salts
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 3);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 4);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 5);

    // Test first page (limit 2)
    let page1 = filter.tokens_by_game_address(game_metadata.contract_address, 0, 2);
    assert!(page1.token_ids.len() == 2, "Page 1 should have 2 tokens");
    assert!(page1.total == 5, "Total should be 5");

    // Test second page (offset 2, limit 2)
    let page2 = filter.tokens_by_game_address(game_metadata.contract_address, 2, 2);
    assert!(page2.token_ids.len() == 2, "Page 2 should have 2 tokens");
    assert!(page2.total == 5, "Total should still be 5");

    // Test third page (offset 4, limit 2)
    let page3 = filter.tokens_by_game_address(game_metadata.contract_address, 4, 2);
    assert!(page3.token_ids.len() == 1, "Page 3 should have 1 token");
    assert!(page3.total == 5, "Total should still be 5");
}

// ================================================================================================
// GAME + SETTINGS FILTER TESTS
// Note: Settings must exist before minting with them, which requires additional setup.
// For now, we test with settings_id = 0 (no settings) which the filter can still filter on.
// ================================================================================================

#[test]
fn test_tokens_by_game_and_settings_no_settings() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens with default settings (settings_id = 0)
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // Query settings_id = 0 (default)
    let result = filter.tokens_by_game_and_settings(game_metadata.contract_address, 0, 0, 100);
    assert!(result.token_ids.len() == 2, "Should return 2 tokens with settings_id=0");
    assert!(result.total == 2, "Total should be 2");

    // Query non-existent settings
    let result2 = filter.tokens_by_game_and_settings(game_metadata.contract_address, 99, 0, 100);
    assert!(result2.token_ids.len() == 0, "Should return 0 tokens for unknown settings");
    assert!(result2.total == 0, "Total should be 0");
}

// ================================================================================================
// GAME + OBJECTIVE FILTER TESTS
// Note: Objectives must exist before minting with them.
// We test with objective_id = 0 (no objective) which the filter can still filter on.
// ================================================================================================

#[test]
fn test_tokens_by_game_and_objective_no_objective() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens with default objective (objective_id = 0)
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // Query objective_id = 0 (default)
    let result = filter.tokens_by_game_and_objective(game_metadata.contract_address, 0, 0, 100);
    assert!(result.token_ids.len() == 2, "Should return 2 tokens with objective_id=0");
    assert!(result.total == 2, "Total should be 2");

    // Query non-existent objective
    let result2 = filter.tokens_by_game_and_objective(game_metadata.contract_address, 99, 0, 100);
    assert!(result2.token_ids.len() == 0, "Should return 0 tokens for unknown objective");
    assert!(result2.total == 0, "Total should be 0");
}

// ================================================================================================
// MINTER ADDRESS FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_by_minter_address_unknown_minter() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Query with an address that has never minted
    let unknown_minter: ContractAddress = 'UNKNOWN_MINTER'.try_into().unwrap();
    let result = filter.tokens_by_minter_address(unknown_minter, 0, 100);

    assert!(result.token_ids.len() == 0, "Should return empty for unknown minter");
    assert!(result.total == 0, "Total should be 0 for unknown minter");
}

#[test]
fn test_tokens_by_minter_address_with_tokens() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens - the minter registered is the caller address (ALICE in our case)
    // The cheat_caller_address in mint_token_with_salt sets caller to 'to' param
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 3);

    // Query tokens minted by ALICE (caller for first 2 mints)
    let result = filter.tokens_by_minter_address(ALICE(), 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have minted 2 tokens");
    assert!(result.total == 2, "Total should be 2");

    // Query tokens minted by BOB (caller for 3rd mint)
    let result2 = filter.tokens_by_minter_address(BOB(), 0, 100);
    assert!(result2.token_ids.len() == 1, "BOB should have minted 1 token");
    assert!(result2.total == 1, "Total should be 1");
}

// ================================================================================================
// OWNER + GAME FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_game() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register two games
    let (game_id1, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let game1_metadata = tc.registry.game_metadata(game_id1);

    let (game_id2, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );
    let game2_metadata = tc.registry.game_metadata(game_id2);

    // ALICE owns tokens from both games (using different salts per game)
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game2_metadata.contract_address, ALICE(), false, 1);

    // BOB owns tokens from game1 only
    mint_token_with_salt(@tc, game1_metadata.contract_address, BOB(), false, 3);

    // Query ALICE's game1 tokens
    let result = filter.tokens_of_owner_by_game(ALICE(), game1_metadata.contract_address, 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have 2 game1 tokens");
    assert!(result.total == 2, "Total should be 2");

    // Query ALICE's game2 tokens
    let result2 = filter.tokens_of_owner_by_game(ALICE(), game2_metadata.contract_address, 0, 100);
    assert!(result2.token_ids.len() == 1, "ALICE should have 1 game2 token");
    assert!(result2.total == 1, "Total should be 1");

    // Query BOB's game2 tokens (should be empty)
    let result3 = filter.tokens_of_owner_by_game(BOB(), game2_metadata.contract_address, 0, 100);
    assert!(result3.token_ids.len() == 0, "BOB should have 0 game2 tokens");
    assert!(result3.total == 0, "Total should be 0");
}

// ================================================================================================
// SOULBOUND FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_by_soulbound() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint soulbound and transferable tokens with different salts
    let _soulbound1 = mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), true, 1);
    let _soulbound2 = mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), true, 2);
    let _transferable1 = mint_token_with_salt(
        @tc, game_metadata.contract_address, CHARLIE(), false, 3,
    );

    // Query soulbound tokens
    let result = filter.tokens_by_soulbound(true, 0, 100);
    assert!(result.token_ids.len() == 2, "Should return 2 soulbound tokens");
    assert!(result.total == 2, "Total soulbound should be 2");

    // Verify they are soulbound
    assert!(unpack_soulbound(*result.token_ids.at(0)), "First token should be soulbound");
    assert!(unpack_soulbound(*result.token_ids.at(1)), "Second token should be soulbound");

    // Query transferable tokens
    let result2 = filter.tokens_by_soulbound(false, 0, 100);
    assert!(result2.token_ids.len() == 1, "Should return 1 transferable token");
    assert!(result2.total == 1, "Total transferable should be 1");
    assert!(!unpack_soulbound(*result2.token_ids.at(0)), "Token should not be soulbound");
}

// ================================================================================================
// TIME RANGE FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_by_minted_at_range() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens at different times with unique salts
    cheat_block_timestamp(tc.denshokan_address, 1000, CheatSpan::TargetCalls(1));
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);

    cheat_block_timestamp(tc.denshokan_address, 2000, CheatSpan::TargetCalls(1));
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    cheat_block_timestamp(tc.denshokan_address, 3000, CheatSpan::TargetCalls(1));
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 3);

    // Query range that includes all tokens
    let result = filter.tokens_by_minted_at_range(500, 3500, 0, 100);
    assert!(result.token_ids.len() == 3, "Should return all 3 tokens");
    assert!(result.total == 3, "Total should be 3");

    // Query range that includes first 2 tokens
    let result2 = filter.tokens_by_minted_at_range(500, 2500, 0, 100);
    assert!(result2.token_ids.len() == 2, "Should return 2 tokens");
    assert!(result2.total == 2, "Total should be 2");

    // Query range that includes no tokens
    let result3 = filter.tokens_by_minted_at_range(5000, 6000, 0, 100);
    assert!(result3.token_ids.len() == 0, "Should return 0 tokens");
    assert!(result3.total == 0, "Total should be 0");
}

#[test]
fn test_tokens_by_minted_at_range_invalid_range() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // end_time < start_time should return empty
    let result = filter.tokens_by_minted_at_range(3000, 1000, 0, 100);
    assert!(result.token_ids.len() == 0, "Invalid range should return empty");
    assert!(result.total == 0, "Total should be 0 for invalid range");
}

// ================================================================================================
// COUNT FUNCTION TESTS
// ================================================================================================

#[test]
fn test_count_functions_match_filter_totals() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens with different salts and soulbound values
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), true, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 3);

    // Verify count matches filter total for game
    let game_count = filter.count_tokens_by_game_address(game_metadata.contract_address);
    let game_result = filter.tokens_by_game_address(game_metadata.contract_address, 0, 100);
    assert!(game_count == game_result.total, "Game count should match filter total");
    assert!(game_count == 3, "Should have 3 tokens total");

    // Verify soulbound count
    let soulbound_count = filter.count_tokens_by_soulbound(true);
    let soulbound_result = filter.tokens_by_soulbound(true, 0, 100);
    assert!(soulbound_count == soulbound_result.total, "Soulbound count should match filter total");
    assert!(soulbound_count == 1, "Should have 1 soulbound token");

    // Verify owner game count
    let owner_game_count = filter
        .count_tokens_of_owner_by_game(ALICE(), game_metadata.contract_address);
    let owner_game_result = filter
        .tokens_of_owner_by_game(ALICE(), game_metadata.contract_address, 0, 100);
    assert!(
        owner_game_count == owner_game_result.total, "Owner game count should match filter total",
    );
    assert!(owner_game_count == 2, "ALICE should have 2 tokens");
}

// ================================================================================================
// MULTI-GAME FILTERING TESTS
// ================================================================================================

#[test]
fn test_multi_game_filtering() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register three games
    let (game_id1, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let game1_metadata = tc.registry.game_metadata(game_id1);

    let (game_id2, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );
    let game2_metadata = tc.registry.game_metadata(game_id2);

    let (game_id3, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game3", Option::None,
    );
    let game3_metadata = tc.registry.game_metadata(game_id3);

    // Mint tokens for each game with unique salts per game
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game2_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game2_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game2_metadata.contract_address, ALICE(), false, 3);
    mint_token_with_salt(@tc, game3_metadata.contract_address, ALICE(), false, 1);

    // Verify each game returns correct tokens
    let result1 = filter.tokens_by_game_address(game1_metadata.contract_address, 0, 100);
    assert!(result1.total == 2, "Game1 should have 2 tokens");

    let result2 = filter.tokens_by_game_address(game2_metadata.contract_address, 0, 100);
    assert!(result2.total == 3, "Game2 should have 3 tokens");

    let result3 = filter.tokens_by_game_address(game3_metadata.contract_address, 0, 100);
    assert!(result3.total == 1, "Game3 should have 1 token");

    // Verify game IDs in results
    let mut i = 0;
    while i < result1.token_ids.len() {
        let game_id = unpack_game_id(*result1.token_ids.at(i));
        assert!(game_id == game_id1.try_into().unwrap(), "Token should belong to game1");
        i += 1;
    };
}

// ================================================================================================
// EDGE CASE TESTS
// ================================================================================================

#[test]
fn test_offset_greater_than_total() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game and mint tokens
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // Offset > total should return empty array but correct total
    let result = filter.tokens_by_game_address(game_metadata.contract_address, 100, 10);
    assert!(result.token_ids.len() == 0, "Should return empty when offset > total");
    assert!(result.total == 2, "Total should still report all matches");
}

#[test]
fn test_limit_zero() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game and mint tokens
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // limit = 0 should use MAX_FILTER_LIMIT (returns all tokens up to limit)
    let result = filter.tokens_by_game_address(game_metadata.contract_address, 0, 0);
    assert!(result.token_ids.len() == 2, "Should return tokens when limit=0 (uses default)");
    assert!(result.total == 2, "Total should be 2");
}

#[test]
fn test_empty_token_supply() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game but don't mint any tokens
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Query should return empty
    let result = filter.tokens_by_game_address(game_metadata.contract_address, 0, 100);
    assert!(result.token_ids.len() == 0, "Should return empty for no tokens");
    assert!(result.total == 0, "Total should be 0");

    let count = filter.count_tokens_by_game_address(game_metadata.contract_address);
    assert!(count == 0, "Count should be 0");
}
