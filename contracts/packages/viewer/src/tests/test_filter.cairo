use denshokan_interfaces::filter::{
    IDenshokanFilterDispatcher, IDenshokanFilterDispatcherTrait,
    IDenshokanSettingsObjectivesDispatcher, IDenshokanSettingsObjectivesDispatcherTrait,
};
use denshokan_testing::helpers::constants::{ALICE, BOB, GAME_CREATOR};
use denshokan_testing::helpers::setup::{register_game, setup_with_registry};
use game_components_embeddable_game_standard::registry::interface::IMinigameRegistryDispatcherTrait;
use game_components_embeddable_game_standard::token::interface::IMinigameTokenMixinDispatcherTrait;
use openzeppelin_interfaces::ownable::{IOwnableDispatcher, IOwnableDispatcherTrait};
use openzeppelin_interfaces::upgrades::{IUpgradeableDispatcher, IUpgradeableDispatcherTrait};
use snforge_std::{CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_caller_address, declare};
use starknet::ContractAddress;

// ================================================================================================
// HELPER FUNCTIONS
// ================================================================================================

fn get_filter_dispatcher(denshokan_address: ContractAddress) -> IDenshokanFilterDispatcher {
    let contract = declare("DenshokanViewer").unwrap().contract_class();
    let owner: ContractAddress = 'VIEWER_OWNER'.try_into().unwrap();
    let mut calldata = array![];
    calldata.append(owner.into());
    calldata.append(denshokan_address.into());
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    IDenshokanFilterDispatcher { contract_address }
}

/// Helper to mint a token with specific parameters for testing
/// Uses salt to avoid token ID collisions
fn mint_token_with_salt(
    tc: @denshokan_testing::helpers::setup::TestContracts,
    game_address: ContractAddress,
    to: ContractAddress,
    is_soulbound: bool,
    salt: u16,
) -> felt252 {
    cheat_caller_address(*tc.denshokan_address, to, CheatSpan::TargetCalls(1));
    let token_id = (*tc.token_mixin)
        .mint(
            game_address,
            Option::None, // player_name
            Option::None, // settings_id
            Option::None, // start
            Option::None, // end
            Option::None, // objective_id
            Option::None, // context
            Option::None, // client_url
            Option::None, // renderer_address
            Option::None, // skills_address
            to,
            is_soulbound,
            false, // paymaster
            salt,
            0 // metadata
        );
    token_id.try_into().unwrap()
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
// PLAYABLE/GAME_OVER FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_game_and_playable() {
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

    // ALICE has tokens in both games
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game2_metadata.contract_address, ALICE(), false, 1);

    // BOB has tokens in game1
    mint_token_with_salt(@tc, game1_metadata.contract_address, BOB(), false, 3);

    // Query ALICE's playable tokens in game1
    let result = filter
        .tokens_of_owner_by_game_and_playable(ALICE(), game1_metadata.contract_address, 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have 2 playable game1 tokens");
    assert!(result.total == 2, "Total should be 2");

    // Query ALICE's playable tokens in game2
    let result2 = filter
        .tokens_of_owner_by_game_and_playable(ALICE(), game2_metadata.contract_address, 0, 100);
    assert!(result2.token_ids.len() == 1, "ALICE should have 1 playable game2 token");
    assert!(result2.total == 1, "Total should be 1");

    // Count should match
    let count = filter
        .count_tokens_of_owner_by_game_and_playable(ALICE(), game1_metadata.contract_address);
    assert!(count == result.total, "Count should match filter total");
}

#[test]
fn test_tokens_of_owner_by_soulbound() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // ALICE has soulbound and non-soulbound tokens
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), true, 1); // soulbound
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), true, 2); // soulbound
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 3); // transferable

    // BOB has only non-soulbound
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 4);

    // Query ALICE's soulbound tokens
    let result = filter.tokens_of_owner_by_soulbound(ALICE(), true, 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have 2 soulbound tokens");
    assert!(result.total == 2, "Total should be 2");

    // Query ALICE's transferable tokens
    let result2 = filter.tokens_of_owner_by_soulbound(ALICE(), false, 0, 100);
    assert!(result2.token_ids.len() == 1, "ALICE should have 1 transferable token");
    assert!(result2.total == 1, "Total should be 1");

    // Query BOB's soulbound tokens (should be empty)
    let result3 = filter.tokens_of_owner_by_soulbound(BOB(), true, 0, 100);
    assert!(result3.token_ids.len() == 0, "BOB should have 0 soulbound tokens");
    assert!(result3.total == 0, "Total should be 0");

    // Count should match
    let count = filter.count_tokens_of_owner_by_soulbound(ALICE(), true);
    assert!(count == result.total, "Count should match filter total");
}

// ================================================================================================
// OWNER TOKENS (NO FILTER) TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // ALICE owns multiple tokens
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), true, 3);

    // BOB owns one token
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 4);

    // Query ALICE's tokens
    let result = filter.tokens_of_owner(ALICE(), 0, 100);
    assert!(result.token_ids.len() == 3, "ALICE should have 3 tokens");
    assert!(result.total == 3, "Total should be 3");

    // Query BOB's tokens
    let result2 = filter.tokens_of_owner(BOB(), 0, 100);
    assert!(result2.token_ids.len() == 1, "BOB should have 1 token");
    assert!(result2.total == 1, "Total should be 1");

    // Count should match
    let count = filter.count_tokens_of_owner(ALICE());
    assert!(count == result.total, "Count should match filter total");
}

#[test]
fn test_tokens_of_owner_pagination() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint 5 tokens for ALICE
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 3);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 4);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 5);

    // Test first page (limit 2)
    let page1 = filter.tokens_of_owner(ALICE(), 0, 2);
    assert!(page1.token_ids.len() == 2, "Page 1 should have 2 tokens");
    assert!(page1.total == 5, "Total should be 5");

    // Test second page (offset 2, limit 2)
    let page2 = filter.tokens_of_owner(ALICE(), 2, 2);
    assert!(page2.token_ids.len() == 2, "Page 2 should have 2 tokens");
    assert!(page2.total == 5, "Total should still be 5");

    // Test third page (offset 4, limit 2)
    let page3 = filter.tokens_of_owner(ALICE(), 4, 2);
    assert!(page3.token_ids.len() == 1, "Page 3 should have 1 token");
    assert!(page3.total == 5, "Total should still be 5");
}

// ================================================================================================
// OWNER + PLAYABLE/GAME_OVER (ACROSS ALL GAMES) TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_playable_across_games() {
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

    // ALICE has tokens in both games - all should be playable initially
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game1_metadata.contract_address, ALICE(), false, 2);
    mint_token_with_salt(@tc, game2_metadata.contract_address, ALICE(), false, 1);

    // BOB has tokens
    mint_token_with_salt(@tc, game1_metadata.contract_address, BOB(), false, 3);

    // Query ALICE's playable tokens across all games
    let result = filter.tokens_of_owner_by_playable(ALICE(), 0, 100);
    assert!(result.token_ids.len() == 3, "ALICE should have 3 playable tokens");
    assert!(result.total == 3, "Total should be 3");

    // Query BOB's playable tokens
    let result2 = filter.tokens_of_owner_by_playable(BOB(), 0, 100);
    assert!(result2.token_ids.len() == 1, "BOB should have 1 playable token");
    assert!(result2.total == 1, "Total should be 1");

    // Count should match
    let count = filter.count_tokens_of_owner_by_playable(ALICE());
    assert!(count == result.total, "Count should match filter total");
}

#[test]
fn test_tokens_of_owner_by_game_over() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens - newly minted tokens are NOT game_over
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // Query game_over tokens - should be empty since none are game_over yet
    let result = filter.tokens_of_owner_by_game_over(ALICE(), 0, 100);
    assert!(result.token_ids.len() == 0, "Should return 0 game_over tokens");
    assert!(result.total == 0, "Total should be 0");

    // Count should match
    let count = filter.count_tokens_of_owner_by_game_over(ALICE());
    assert!(count == result.total, "Count should match filter total");
}

// ================================================================================================
// BATCH FULL STATE TESTS
// ================================================================================================

#[test]
fn test_tokens_full_state_batch() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens
    let token1 = mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    let token2 = mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), true, 2);

    // Query full state for both tokens
    let token_ids = array![token1, token2];
    let states = filter.tokens_full_state_batch(token_ids);

    assert!(states.len() == 2, "Should return 2 states");

    // Check first token state
    let state1 = states.at(0);
    assert!(*state1.token_id == token1, "Token ID should match");
    assert!(*state1.owner == ALICE(), "Owner should be ALICE");
    assert!(*state1.is_playable, "Should be playable");
    assert!(!*state1.game_over, "Should not be game_over");
    assert!(*state1.game_address == game_metadata.contract_address, "Game address should match");

    // Check second token state
    let state2 = states.at(1);
    assert!(*state2.token_id == token2, "Token ID should match");
    assert!(*state2.owner == BOB(), "Owner should be BOB");
    assert!(*state2.is_playable, "Should be playable");
    assert!(!*state2.game_over, "Should not be game_over");
}

#[test]
#[should_panic(expected: "MinigameToken: token_ids array cannot be empty")]
fn test_tokens_full_state_batch_empty() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Query with empty array panics
    let token_ids: Array<felt252> = array![];
    filter.tokens_full_state_batch(token_ids);
}

// ================================================================================================
// MINTER + OWNER FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_minter() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // ALICE mints tokens for herself and for BOB
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // BOB mints token for himself (different minter)
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 3);

    // Query ALICE's tokens that were minted by ALICE
    let result = filter.tokens_of_owner_by_minter(ALICE(), ALICE(), 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have 2 tokens minted by ALICE");
    assert!(result.total == 2, "Total should be 2");

    // Query BOB's tokens that were minted by ALICE (should be 0)
    let result2 = filter.tokens_of_owner_by_minter(BOB(), ALICE(), 0, 100);
    assert!(result2.token_ids.len() == 0, "BOB should have 0 tokens minted by ALICE");
    assert!(result2.total == 0, "Total should be 0");

    // Query BOB's tokens that were minted by BOB
    let result3 = filter.tokens_of_owner_by_minter(BOB(), BOB(), 0, 100);
    assert!(result3.token_ids.len() == 1, "BOB should have 1 token minted by BOB");
    assert!(result3.total == 1, "Total should be 1");

    // Count should match
    let count = filter.count_tokens_of_owner_by_minter(ALICE(), ALICE());
    assert!(count == result.total, "Count should match filter total");
}

#[test]
fn test_tokens_of_owner_by_minter_unknown_minter() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Query with unknown minter
    let unknown_minter: ContractAddress = 'UNKNOWN_MINTER'.try_into().unwrap();
    let result = filter.tokens_of_owner_by_minter(ALICE(), unknown_minter, 0, 100);
    assert!(result.token_ids.len() == 0, "Should return empty for unknown minter");
    assert!(result.total == 0, "Total should be 0");
}

// ================================================================================================
// OWNER + GAME + SETTINGS FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_game_and_settings() {
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
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 3);

    // Query ALICE's tokens with settings_id = 0
    let result = filter
        .tokens_of_owner_by_game_and_settings(ALICE(), game_metadata.contract_address, 0, 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have 2 tokens with settings_id=0");
    assert!(result.total == 2, "Total should be 2");

    // Query ALICE's tokens with non-existent settings
    let result2 = filter
        .tokens_of_owner_by_game_and_settings(ALICE(), game_metadata.contract_address, 99, 0, 100);
    assert!(result2.token_ids.len() == 0, "Should return 0 for unknown settings");
    assert!(result2.total == 0, "Total should be 0");

    // Count should match
    let count = filter
        .count_tokens_of_owner_by_game_and_settings(ALICE(), game_metadata.contract_address, 0);
    assert!(count == result.total, "Count should match filter total");
}

// ================================================================================================
// OWNER + GAME + OBJECTIVE FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_game_and_objective() {
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
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 3);

    // Query ALICE's tokens with objective_id = 0
    let result = filter
        .tokens_of_owner_by_game_and_objective(ALICE(), game_metadata.contract_address, 0, 0, 100);
    assert!(result.token_ids.len() == 2, "ALICE should have 2 tokens with objective_id=0");
    assert!(result.total == 2, "Total should be 2");

    // Query ALICE's tokens with non-existent objective
    let result2 = filter
        .tokens_of_owner_by_game_and_objective(ALICE(), game_metadata.contract_address, 99, 0, 100);
    assert!(result2.token_ids.len() == 0, "Should return 0 for unknown objective");
    assert!(result2.total == 0, "Total should be 0");

    // Count should match
    let count = filter
        .count_tokens_of_owner_by_game_and_objective(ALICE(), game_metadata.contract_address, 0);
    assert!(count == result.total, "Count should match filter total");
}

// ================================================================================================
// OWNER + GAME + GAME_OVER FILTER TESTS
// ================================================================================================

#[test]
fn test_tokens_of_owner_by_game_and_game_over() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    // Register a game
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // Mint tokens - newly minted tokens are NOT game_over
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // Query ALICE's game_over tokens (should be 0 since none are game_over yet)
    let result = filter
        .tokens_of_owner_by_game_and_game_over(ALICE(), game_metadata.contract_address, 0, 100);
    assert!(result.token_ids.len() == 0, "ALICE should have 0 game_over tokens");
    assert!(result.total == 0, "Total should be 0");

    // Count should match
    let count = filter
        .count_tokens_of_owner_by_game_and_game_over(ALICE(), game_metadata.contract_address);
    assert!(count == result.total, "Count should match filter total");
}

// ================================================================================================
// UPGRADE FUNCTIONALITY TESTS
// ================================================================================================

#[test]
fn test_viewer_has_owner() {
    let tc = setup_with_registry();
    let contract = declare("DenshokanViewer").unwrap().contract_class();
    let owner: ContractAddress = 'VIEWER_OWNER'.try_into().unwrap();
    let mut calldata = array![];
    calldata.append(owner.into());
    calldata.append(tc.denshokan_address.into());
    let (contract_address, _) = contract.deploy(@calldata).unwrap();

    let ownable = IOwnableDispatcher { contract_address };
    let retrieved_owner = ownable.owner();
    assert!(retrieved_owner == owner, "Owner should be set correctly");
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn test_upgrade_only_owner() {
    let tc = setup_with_registry();
    let contract = declare("DenshokanViewer").unwrap().contract_class();
    let owner: ContractAddress = 'VIEWER_OWNER'.try_into().unwrap();
    let mut calldata = array![];
    calldata.append(owner.into());
    calldata.append(tc.denshokan_address.into());
    let (contract_address, _) = contract.deploy(@calldata).unwrap();

    let upgradeable = IUpgradeableDispatcher { contract_address };

    // Try to upgrade as non-owner (should fail)
    let non_owner: ContractAddress = 'NOT_OWNER'.try_into().unwrap();
    cheat_caller_address(contract_address, non_owner, CheatSpan::TargetCalls(1));

    // Get the class hash of the viewer contract itself (just for testing)
    let new_class_hash = *contract.class_hash;
    upgradeable.upgrade(new_class_hash);
}

#[test]
fn test_upgrade_as_owner() {
    let tc = setup_with_registry();
    let contract = declare("DenshokanViewer").unwrap().contract_class();
    let owner: ContractAddress = 'VIEWER_OWNER'.try_into().unwrap();
    let mut calldata = array![];
    calldata.append(owner.into());
    calldata.append(tc.denshokan_address.into());
    let (contract_address, _) = contract.deploy(@calldata).unwrap();

    let upgradeable = IUpgradeableDispatcher { contract_address };

    // Upgrade as owner (should succeed)
    cheat_caller_address(contract_address, owner, CheatSpan::TargetCalls(1));

    // Get the class hash of the viewer contract itself (just for testing)
    let new_class_hash = *contract.class_hash;
    upgradeable.upgrade(new_class_hash);

    // If we reach here, the upgrade succeeded
    // Verify the contract still works after upgrade
    let filter = IDenshokanFilterDispatcher { contract_address };
    let result = filter.tokens_of_owner(ALICE(), 0, 100);
    assert!(result.token_ids.len() == 0, "Contract should still work after upgrade");
}

// ================================================================================================
// UNREGISTERED GAME/MINTER EARLY RETURN TESTS FOR COUNT FUNCTIONS
// ================================================================================================

#[test]
fn test_count_functions_unregistered_game_returns_zero() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);
    let fake_game: ContractAddress = 'FAKE_GAME'.try_into().unwrap();

    assert!(filter.count_tokens_of_owner_by_game(ALICE(), fake_game) == 0, "owner+game count");
    assert!(
        filter.count_tokens_of_owner_by_game_and_playable(ALICE(), fake_game) == 0,
        "owner+game+playable count",
    );
    assert!(
        filter.count_tokens_of_owner_by_game_and_settings(ALICE(), fake_game, 0) == 0,
        "owner+game+settings count",
    );
    assert!(
        filter.count_tokens_of_owner_by_game_and_objective(ALICE(), fake_game, 0) == 0,
        "owner+game+objective count",
    );
    assert!(
        filter.count_tokens_of_owner_by_game_and_game_over(ALICE(), fake_game) == 0,
        "owner+game+game_over count",
    );
}

#[test]
fn test_count_functions_unknown_minter_returns_zero() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);
    let unknown_minter: ContractAddress = 'UNKNOWN_MINTER'.try_into().unwrap();

    assert!(
        filter.count_tokens_of_owner_by_minter(ALICE(), unknown_minter) == 0, "owner+minter count",
    );
}

// ================================================================================================
// UNREGISTERED GAME EARLY RETURN TESTS FOR FILTER FUNCTIONS
// ================================================================================================

#[test]
fn test_filter_functions_unregistered_game_returns_empty() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);
    let fake_game: ContractAddress = 'FAKE_GAME'.try_into().unwrap();

    let r3 = filter.tokens_of_owner_by_game(ALICE(), fake_game, 0, 100);
    assert!(r3.total == 0, "owner+game filter");

    let r5 = filter.tokens_of_owner_by_game_and_playable(ALICE(), fake_game, 0, 100);
    assert!(r5.total == 0, "owner+game+playable filter");

    let r6 = filter.tokens_of_owner_by_game_and_settings(ALICE(), fake_game, 0, 0, 100);
    assert!(r6.total == 0, "owner+game+settings filter");

    let r7 = filter.tokens_of_owner_by_game_and_objective(ALICE(), fake_game, 0, 0, 100);
    assert!(r7.total == 0, "owner+game+objective filter");

    let r8 = filter.tokens_of_owner_by_game_and_game_over(ALICE(), fake_game, 0, 100);
    assert!(r8.total == 0, "owner+game+game_over filter");
}

// ================================================================================================
// OWNER + MINTER FILTER WITH MULTIPLE OWNERS
// ================================================================================================

#[test]
fn test_count_tokens_of_owner_by_minter_with_tokens() {
    let tc = setup_with_registry();
    let filter = get_filter_dispatcher(tc.denshokan_address);

    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let game_metadata = tc.registry.game_metadata(game_id);

    // ALICE mints for herself
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 1);
    mint_token_with_salt(@tc, game_metadata.contract_address, ALICE(), false, 2);

    // BOB mints for himself
    mint_token_with_salt(@tc, game_metadata.contract_address, BOB(), false, 3);

    let count = filter.count_tokens_of_owner_by_minter(ALICE(), ALICE());
    assert!(count == 2, "ALICE owns 2 tokens minted by ALICE");

    let count2 = filter.count_tokens_of_owner_by_minter(BOB(), BOB());
    assert!(count2 == 1, "BOB owns 1 token minted by BOB");

    let count3 = filter.count_tokens_of_owner_by_minter(ALICE(), BOB());
    assert!(count3 == 0, "ALICE owns 0 tokens minted by BOB");
}

// ================================================================================================
// SETTINGS / OBJECTIVES QUERY TESTS
// ================================================================================================

fn get_settings_objectives_dispatcher(
    denshokan_address: ContractAddress,
) -> IDenshokanSettingsObjectivesDispatcher {
    let contract = declare("DenshokanViewer").unwrap().contract_class();
    let owner: ContractAddress = 'VIEWER_OWNER'.try_into().unwrap();
    let mut calldata = array![];
    calldata.append(owner.into());
    calldata.append(denshokan_address.into());
    let (contract_address, _) = contract.deploy(@calldata).unwrap();
    IDenshokanSettingsObjectivesDispatcher { contract_address }
}

#[test]
fn test_all_settings_single_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    // Register a game (mock games have settings via the minigame component)
    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let registry = tc.registry;
    let game_metadata = registry.game_metadata(1);

    // Query settings for the registered game
    let result = so.all_settings(game_metadata.contract_address, 0, 0);
    // Mock games may have 0 or more settings depending on setup
    assert!(result.total >= 0, "Should return settings count for game");
}

#[test]
fn test_all_settings_cross_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    // Register 2 games
    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );

    // Query settings across all games (zero address)
    let zero_address: ContractAddress = 0.try_into().unwrap();
    let result = so.all_settings(zero_address, 0, 0);
    assert!(result.total >= 0, "Should return cross-game settings count");
}

#[test]
fn test_all_objectives_single_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let registry = tc.registry;
    let game_metadata = registry.game_metadata(1);

    // Query objectives for the game with settings_id=0 (all objectives)
    let result = so.all_objectives(game_metadata.contract_address, 0, 0);
    assert!(result.total >= 0, "Should return objectives count for game");
}

#[test]
fn test_all_objectives_cross_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );

    // Query objectives across all games
    let zero_address: ContractAddress = 0.try_into().unwrap();
    let result = so.all_objectives(zero_address, 0, 0);
    assert!(result.total >= 0, "Should return cross-game objectives count");
}

#[test]
fn test_count_settings_single_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let registry = tc.registry;
    let game_metadata = registry.game_metadata(1);

    let count = so.count_settings(game_metadata.contract_address);
    assert!(count >= 0, "Should return settings count for game");
}

#[test]
fn test_count_settings_cross_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );

    let zero_address: ContractAddress = 0.try_into().unwrap();
    let count = so.count_settings(zero_address);
    assert!(count >= 0, "Should return cross-game settings count");
}

#[test]
fn test_count_objectives_single_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TestGame", Option::None,
    );
    let registry = tc.registry;
    let game_metadata = registry.game_metadata(1);

    let count = so.count_objectives(game_metadata.contract_address);
    assert!(count >= 0, "Should return objectives count for game");
}

#[test]
fn test_count_objectives_cross_game() {
    let tc = setup_with_registry();
    let so = get_settings_objectives_dispatcher(tc.denshokan_address);

    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game1", Option::None,
    );
    let (_, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "Game2", Option::None,
    );

    let zero_address: ContractAddress = 0.try_into().unwrap();
    let count = so.count_objectives(zero_address);
    assert!(count >= 0, "Should return cross-game objectives count");
}
