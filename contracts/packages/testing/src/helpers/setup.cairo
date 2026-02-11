use game_components_minigame::interface::IMinigameDispatcher;
use game_components_registry::interface::{
    IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
};
use game_components_test_common::mocks::minigame_starknet_mock::{
    IMinigameStarknetMockDispatcher, IMinigameStarknetMockInitDispatcher,
    IMinigameStarknetMockInitDispatcherTrait,
};
use game_components_token::interface::IMinigameTokenMixinDispatcher;
use openzeppelin_interfaces::erc2981::IERC2981Dispatcher;
use openzeppelin_interfaces::erc721::IERC721Dispatcher;
use snforge_std::{ContractClassTrait, DeclareResultTrait, declare};
use starknet::ContractAddress;
use crate::helpers::constants::GAME_CREATOR;

// ================================================================================================
// TEST CONTRACTS STRUCT
// ================================================================================================

#[derive(Drop)]
pub struct TestContracts {
    pub registry: IMinigameRegistryDispatcher,
    pub denshokan_address: ContractAddress,
    pub erc721: IERC721Dispatcher,
    pub erc2981: IERC2981Dispatcher,
    pub token_mixin: IMinigameTokenMixinDispatcher,
    pub minigame: IMinigameDispatcher,
    pub mock_minigame: IMinigameStarknetMockDispatcher,
}

// ================================================================================================
// DEPLOYMENT HELPERS
// ================================================================================================

/// Deploy MinigameRegistry contract
pub fn deploy_minigame_registry() -> IMinigameRegistryDispatcher {
    let contract = declare("MinigameRegistry").unwrap().contract_class();

    let mut constructor_calldata = array![];
    let name: ByteArray = "GameCreatorToken";
    let symbol: ByteArray = "GCT";
    let base_uri: ByteArray = "https://denshokan.dev/game/";
    name.serialize(ref constructor_calldata);
    symbol.serialize(ref constructor_calldata);
    base_uri.serialize(ref constructor_calldata);

    let (contract_address, _) = contract.deploy(@constructor_calldata).unwrap();

    IMinigameRegistryDispatcher { contract_address }
}

/// Deploy a minigame_starknet_mock contract
pub fn deploy_mock_game() -> (
    IMinigameDispatcher, IMinigameStarknetMockInitDispatcher, IMinigameStarknetMockDispatcher,
) {
    let contract = declare("minigame_starknet_mock").unwrap().contract_class();
    let (contract_address, _) = contract.deploy(@array![]).unwrap();

    let minigame_dispatcher = IMinigameDispatcher { contract_address };
    let minigame_init_dispatcher = IMinigameStarknetMockInitDispatcher { contract_address };
    let minigame_mock_dispatcher = IMinigameStarknetMockDispatcher { contract_address };
    (minigame_dispatcher, minigame_init_dispatcher, minigame_mock_dispatcher)
}

/// Deploy Denshokan token contract
pub fn deploy_denshokan(
    registry_address: ContractAddress,
) -> (ContractAddress, IERC721Dispatcher, IERC2981Dispatcher, IMinigameTokenMixinDispatcher) {
    let contract = declare("Denshokan").unwrap().contract_class();

    let mut constructor_calldata = array![];
    let name: ByteArray = "Denshokan";
    let symbol: ByteArray = "DNSK";
    let base_uri: ByteArray = "https://denshokan.dev/token/";
    name.serialize(ref constructor_calldata);
    symbol.serialize(ref constructor_calldata);
    base_uri.serialize(ref constructor_calldata);

    // Serialize game_registry_address (required)
    constructor_calldata.append(registry_address.into());

    let (contract_address, _) = contract.deploy(@constructor_calldata).unwrap();

    let erc721 = IERC721Dispatcher { contract_address };
    let erc2981 = IERC2981Dispatcher { contract_address };
    let token_mixin = IMinigameTokenMixinDispatcher { contract_address };

    (contract_address, erc721, erc2981, token_mixin)
}

// ================================================================================================
// COMPLETE TEST SETUP FUNCTIONS
// ================================================================================================

/// Setup multi-game test environment (modeled after game-components setup_multi_game).
///
/// Deploys:
/// - MinigameRegistry
/// - Denshokan token with registry
/// - A mock minigame that auto-registers with the registry during initialization
pub fn setup_with_registry() -> TestContracts {
    let registry = deploy_minigame_registry();
    let (denshokan_address, erc721, erc2981, token_mixin) = deploy_denshokan(
        registry.contract_address,
    );

    // Deploy and initialize a mock game (this auto-registers with the registry)
    let (game_dispatcher, game_init_dispatcher, mock_minigame_dispatcher) = deploy_mock_game();

    game_init_dispatcher
        .initializer(
            GAME_CREATOR(),
            "TestGame",
            "TestDescription",
            "TestDeveloper",
            "TestPublisher",
            "TestGenre",
            "TestImage",
            Option::None, // color
            Option::None, // client_url
            Option::None, // renderer_address
            Option::None, // settings_address
            Option::None, // objectives_address
            denshokan_address, // minigame_token_address
            Option::None // royalty_fraction
        );

    TestContracts {
        registry,
        denshokan_address,
        erc721,
        erc2981,
        token_mixin,
        minigame: game_dispatcher,
        mock_minigame: mock_minigame_dispatcher,
    }
}

/// Register an additional game in the registry.
/// Deploys a new mock minigame, initializes it (which auto-registers), and returns its game_id.
pub fn register_game(
    registry: IMinigameRegistryDispatcher,
    denshokan_address: ContractAddress,
    creator: ContractAddress,
    name: ByteArray,
    royalty_fraction: Option<u128>,
) -> (u64, IMinigameDispatcher, IMinigameStarknetMockDispatcher) {
    let (game_dispatcher, game_init_dispatcher, mock_minigame_dispatcher) = deploy_mock_game();

    game_init_dispatcher
        .initializer(
            creator,
            name.clone(),
            "Test Description",
            "Test Developer",
            "Test Publisher",
            "Test Genre",
            "https://test.com/image.png",
            Option::None, // color
            Option::None, // client_url
            Option::None, // renderer_address
            Option::None, // settings_address
            Option::None, // objectives_address
            denshokan_address, // minigame_token_address
            royalty_fraction,
        );

    // Look up the game_id by the game contract address
    let game_id = registry.game_id_from_address(game_dispatcher.contract_address);

    (game_id, game_dispatcher, mock_minigame_dispatcher)
}
