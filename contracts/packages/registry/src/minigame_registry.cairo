// Re-export types and interface from game_components_registry for convenience
pub use game_components_embeddable_game_standard::registry::interface::{
    GameMetadata, IMINIGAME_REGISTRY_ID, IMinigameRegistry, IMinigameRegistryDispatcher,
    IMinigameRegistryDispatcherTrait,
};

#[starknet::contract]
pub mod MinigameRegistry {
    use game_components_embeddable_game_standard::registry::registry_component::MinigameRegistryComponent;
    use openzeppelin_introspection::src5::SRC5Component;
    use openzeppelin_token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use starknet::ContractAddress;

    // ==========================================================================
    // COMPONENT DECLARATIONS
    // ==========================================================================

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(
        path: MinigameRegistryComponent, storage: minigame_registry, event: MinigameRegistryEvent,
    );

    // ==========================================================================
    // COMPONENT IMPLEMENTATIONS
    // ==========================================================================

    // ERC721 Mixin (includes SRC5 support)
    #[abi(embed_v0)]
    impl ERC721MixinImpl = ERC721Component::ERC721MixinImpl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;

    // SRC5 Internal implementation (not exposed in ABI to avoid conflict)
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;

    // MinigameRegistry implementation
    #[abi(embed_v0)]
    impl MinigameRegistryImpl =
        MinigameRegistryComponent::MinigameRegistryImpl<ContractState>;
    impl MinigameRegistryInternalImpl = MinigameRegistryComponent::InternalImpl<ContractState>;

    // ==========================================================================
    // STORAGE
    // ==========================================================================

    #[storage]
    pub struct Storage {
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        minigame_registry: MinigameRegistryComponent::Storage,
    }

    // ==========================================================================
    // EVENTS
    // ==========================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        MinigameRegistryEvent: MinigameRegistryComponent::Event,
    }

    // ==========================================================================
    // HOOKS IMPLEMENTATION
    // ==========================================================================
    // This contract mints creator tokens when a game is registered

    impl MinigameRegistryHooksImpl of MinigameRegistryComponent::MinigameRegistryHooksTrait<
        ContractState,
    > {
        fn before_register_game(
            ref self: ContractState,
            caller_address: ContractAddress,
            creator_address: ContractAddress,
        ) { // No additional validation needed for this contract
        }

        fn after_register_game(
            ref self: ContractState, game_id: u64, creator_address: ContractAddress,
        ) {
            // Mint the ERC721 creator token to the creator
            self.erc721.mint(creator_address, game_id.into());
        }

        fn assert_registry_owner(
            self: @ContractState,
        ) { // No owner restriction - registry is permissionless
        }
    }

    // ==========================================================================
    // CONSTRUCTOR
    // ==========================================================================

    #[constructor]
    pub fn constructor(
        ref self: ContractState, name: ByteArray, symbol: ByteArray, base_uri: ByteArray,
    ) {
        self.erc721.initializer(name, symbol, base_uri);
        self.minigame_registry.initializer();
    }
}
