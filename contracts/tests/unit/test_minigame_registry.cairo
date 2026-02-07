use game_components_registry::interface::{
    IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait, IMINIGAME_REGISTRY_ID,
};
use openzeppelin_interfaces::erc721::{
    IERC721Dispatcher, IERC721DispatcherTrait, IERC721MetadataDispatcher,
    IERC721MetadataDispatcherTrait,
};
use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use snforge_std::{CheatSpan, cheat_caller_address};
use starknet::ContractAddress;
use crate::helpers::constants::{ALICE, BOB, CHARLIE, GAME_CREATOR};
use crate::helpers::setup::{register_game, setup_with_registry};

// ================================================================================================
// HELPER: Get ERC721 dispatcher for the registry contract
// ================================================================================================

fn registry_erc721(registry: IMinigameRegistryDispatcher) -> IERC721Dispatcher {
    IERC721Dispatcher { contract_address: registry.contract_address }
}

fn registry_erc721_metadata(registry: IMinigameRegistryDispatcher) -> IERC721MetadataDispatcher {
    IERC721MetadataDispatcher { contract_address: registry.contract_address }
}

fn registry_src5(registry: IMinigameRegistryDispatcher) -> ISRC5Dispatcher {
    ISRC5Dispatcher { contract_address: registry.contract_address }
}

// ================================================================================================
// TEST: register_game mints creator token to the creator
// ================================================================================================

#[test]
fn test_register_game_mints_creator_token() {
    let tc = setup_with_registry();

    // Register a game with GAME_CREATOR as the creator
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "MintTestGame", Option::None,
    );

    // The after_register_game hook should have minted an ERC721 token
    // with token_id = game_id to the creator
    let erc721 = registry_erc721(tc.registry);
    let owner = erc721.owner_of(game_id.into());
    assert!(owner == GAME_CREATOR(), "Creator should own the ERC721 token for their game");
}

// ================================================================================================
// TEST: Multiple game registrations produce sequential token IDs
// ================================================================================================

#[test]
fn test_register_multiple_games() {
    let tc = setup_with_registry();

    // Note: setup_with_registry already registers 1 game (game_id 1) with GAME_CREATOR

    // Register 3 more games with different creators
    let (game_id_2, _, _) = register_game(
        tc.registry, tc.denshokan_address, ALICE(), "AliceGame", Option::None,
    );
    let (game_id_3, _, _) = register_game(
        tc.registry, tc.denshokan_address, BOB(), "BobGame", Option::None,
    );
    let (game_id_4, _, _) = register_game(
        tc.registry, tc.denshokan_address, CHARLIE(), "CharlieGame", Option::None,
    );

    // Game IDs should be sequential starting from 2 (1 was taken by setup)
    assert!(game_id_2 == 2, "Second game should have ID 2");
    assert!(game_id_3 == 3, "Third game should have ID 3");
    assert!(game_id_4 == 4, "Fourth game should have ID 4");

    // Each creator should own their respective game token
    let erc721 = registry_erc721(tc.registry);
    let owner_2 = erc721.owner_of(game_id_2.into());
    let owner_3 = erc721.owner_of(game_id_3.into());
    let owner_4 = erc721.owner_of(game_id_4.into());

    assert!(owner_2 == ALICE(), "ALICE should own game token 2");
    assert!(owner_3 == BOB(), "BOB should own game token 3");
    assert!(owner_4 == CHARLIE(), "CHARLIE should own game token 4");
}

// ================================================================================================
// TEST: Creator token balance increases when same creator registers multiple games
// ================================================================================================

#[test]
fn test_creator_token_balance() {
    let tc = setup_with_registry();

    // Register 2 games with the same creator (ALICE)
    let (game_id_1, _, _) = register_game(
        tc.registry, tc.denshokan_address, ALICE(), "AliceGame1", Option::None,
    );
    let (game_id_2, _, _) = register_game(
        tc.registry, tc.denshokan_address, ALICE(), "AliceGame2", Option::None,
    );

    let erc721 = registry_erc721(tc.registry);

    // ALICE should own both tokens
    assert!(erc721.owner_of(game_id_1.into()) == ALICE(), "ALICE should own game token 1");
    assert!(erc721.owner_of(game_id_2.into()) == ALICE(), "ALICE should own game token 2");

    // balance_of should reflect the 2 tokens
    let balance = erc721.balance_of(ALICE());
    assert!(balance == 2, "ALICE should have balance of 2");
}

// ================================================================================================
// TEST: Creator can transfer their game token to another address
// ================================================================================================

#[test]
fn test_creator_token_transfer() {
    let tc = setup_with_registry();

    // Register a game as GAME_CREATOR
    let (game_id, _, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "TransferGame", Option::None,
    );

    let erc721 = registry_erc721(tc.registry);

    // Verify GAME_CREATOR owns the token initially
    let initial_owner = erc721.owner_of(game_id.into());
    assert!(initial_owner == GAME_CREATOR(), "GAME_CREATOR should initially own the token");

    // Transfer from GAME_CREATOR to BOB
    cheat_caller_address(tc.registry.contract_address, GAME_CREATOR(), CheatSpan::TargetCalls(1));
    erc721.transfer_from(GAME_CREATOR(), BOB(), game_id.into());

    // Verify BOB now owns the token
    let new_owner = erc721.owner_of(game_id.into());
    assert!(new_owner == BOB(), "BOB should now own the game token after transfer");

    // Verify balance updates
    // Note: GAME_CREATOR also owns a token from the default game registered in setup_with_registry
    // so after transferring 1 of their 2 tokens, they should have 1 remaining
    let creator_balance = erc721.balance_of(GAME_CREATOR());
    let bob_balance = erc721.balance_of(BOB());
    assert!(creator_balance == 1, "GAME_CREATOR balance should be 1 after transfer (1 remaining from setup)");
    assert!(bob_balance == 1, "BOB balance should be 1 after receiving transfer");
}

// ================================================================================================
// TEST: game_metadata returns correct data
// ================================================================================================

#[test]
fn test_game_metadata_retrieval() {
    let tc = setup_with_registry();

    // Register a game with specific metadata
    let (game_id, game_dispatcher, _) = register_game(
        tc.registry, tc.denshokan_address, ALICE(), "MetadataTestGame", Option::Some(750),
    );

    // Retrieve metadata
    let metadata = tc.registry.game_metadata(game_id);

    // Verify the metadata fields
    assert!(metadata.name == "MetadataTestGame", "Game name should match");
    assert!(
        metadata.contract_address == game_dispatcher.contract_address,
        "Contract address should match the deployed game",
    );
    // The register_game helper uses "Test Description", "Test Developer", "Test Publisher",
    // "Test Genre"
    assert!(metadata.description == "Test Description", "Description should match");
    assert!(metadata.developer == "Test Developer", "Developer should match");
    assert!(metadata.publisher == "Test Publisher", "Publisher should match");
    assert!(metadata.genre == "Test Genre", "Genre should match");
    assert!(metadata.royalty_fraction == 750, "Royalty fraction should be 750");
}

// ================================================================================================
// TEST: game_id_from_address returns correct ID for registered game
// ================================================================================================

#[test]
fn test_game_id_from_address() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, game_dispatcher, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "AddressLookupGame", Option::None,
    );

    // Look up the game_id by contract address
    let looked_up_id = tc.registry.game_id_from_address(game_dispatcher.contract_address);
    assert!(looked_up_id == game_id, "game_id_from_address should return the correct game ID");
}

// ================================================================================================
// TEST: game_id_from_address returns 0 for unregistered address
// ================================================================================================

#[test]
fn test_game_id_from_unregistered_address() {
    let tc = setup_with_registry();

    // Use an address that has no game registered
    let unregistered_address: ContractAddress = 'UNREGISTERED'.try_into().unwrap();
    let result = tc.registry.game_id_from_address(unregistered_address);
    assert!(result == 0, "game_id_from_address should return 0 for unregistered address");
}

// ================================================================================================
// TEST: ERC721 name and symbol match constructor params
// ================================================================================================

#[test]
fn test_registry_name_and_symbol() {
    let tc = setup_with_registry();

    let metadata_dispatcher = registry_erc721_metadata(tc.registry);

    // The deploy_minigame_registry helper uses name="GameCreatorToken", symbol="GCT"
    let name = metadata_dispatcher.name();
    let symbol = metadata_dispatcher.symbol();

    assert!(name == "GameCreatorToken", "ERC721 name should be GameCreatorToken");
    assert!(symbol == "GCT", "ERC721 symbol should be GCT");
}

// ================================================================================================
// TEST: SRC5 supports_interface for IMINIGAME_REGISTRY_ID
// ================================================================================================

#[test]
fn test_supports_interface() {
    let tc = setup_with_registry();

    let src5 = registry_src5(tc.registry);

    // Should support the minigame registry interface
    let supports_registry = src5.supports_interface(IMINIGAME_REGISTRY_ID);
    assert!(supports_registry, "Registry should support IMINIGAME_REGISTRY_ID interface");

    // Should also support SRC5 itself (interface ID 0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055)
    let isrc5_id: felt252 = 0x3f918d17e5ee77373b56385708f855659a07f75997f365cf87748628532a055;
    let supports_src5 = src5.supports_interface(isrc5_id);
    assert!(supports_src5, "Registry should support ISRC5 interface");

    // Should NOT support a random interface ID
    let random_id: felt252 = 0xdeadbeef;
    let supports_random = src5.supports_interface(random_id);
    assert!(!supports_random, "Registry should not support random interface ID");
}

// ================================================================================================
// TEST: game_count increases with registrations
// ================================================================================================

#[test]
fn test_game_count_increases_with_registrations() {
    let tc = setup_with_registry();

    // setup_with_registry already registers 1 game
    let initial_count = tc.registry.game_count();
    assert!(initial_count == 1, "Should have 1 game from setup");

    // Register a second game
    register_game(tc.registry, tc.denshokan_address, ALICE(), "Game2", Option::None);
    let count_after_1 = tc.registry.game_count();
    assert!(count_after_1 == 2, "Should have 2 games after first registration");

    // Register a third game
    register_game(tc.registry, tc.denshokan_address, BOB(), "Game3", Option::None);
    let count_after_2 = tc.registry.game_count();
    assert!(count_after_2 == 3, "Should have 3 games after second registration");
}

// ================================================================================================
// TEST: is_game_registered returns correct boolean
// ================================================================================================

#[test]
fn test_is_game_registered() {
    let tc = setup_with_registry();

    // Register a game
    let (_, game_dispatcher, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "RegisteredGame", Option::None,
    );

    // The registered game address should return true
    let is_registered = tc.registry.is_game_registered(game_dispatcher.contract_address);
    assert!(is_registered, "Registered game should return true");

    // An unregistered address should return false
    let unregistered: ContractAddress = 'NOT_A_GAME'.try_into().unwrap();
    let is_not_registered = tc.registry.is_game_registered(unregistered);
    assert!(!is_not_registered, "Unregistered address should return false");
}

// ================================================================================================
// TEST: game_address_from_id returns correct contract address
// ================================================================================================

#[test]
fn test_game_address_from_id() {
    let tc = setup_with_registry();

    // Register a game
    let (game_id, game_dispatcher, _) = register_game(
        tc.registry, tc.denshokan_address, GAME_CREATOR(), "AddressFromIdGame", Option::None,
    );

    // Look up the address by game_id
    let address = tc.registry.game_address_from_id(game_id);
    assert!(
        address == game_dispatcher.contract_address,
        "game_address_from_id should return the correct contract address",
    );
}
