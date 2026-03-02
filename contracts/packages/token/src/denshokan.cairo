// Denshokan Token Contract
// This contract imports from the game-components library and composes
// a full token implementation using the modular component system.

use core::num::traits::Zero;
use denshokan_interfaces::filter::IDenshokanTokenUriBatch;
use denshokan_renderer::default_renderer::{
    IDefaultRendererDispatcher, IDefaultRendererDispatcherTrait,
};
use game_components_embeddable_game_standard::metagame::extensions::context::structs::GameContextDetails;
use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::GameObjectiveDetails;
use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
use game_components_embeddable_game_standard::minigame::structs::GameDetail;

// Game components imports - using full package paths
use game_components_embeddable_game_standard::registry::interface::{
    GameMetadata, IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
};
use game_components_embeddable_game_standard::token::extensions::context::context::ContextComponent;
use game_components_embeddable_game_standard::token::extensions::minter::minter::MinterComponent;
use game_components_embeddable_game_standard::token::extensions::objectives::objectives::ObjectivesComponent;
use game_components_embeddable_game_standard::token::extensions::renderer::renderer::RendererComponent;
use game_components_embeddable_game_standard::token::extensions::settings::settings::SettingsComponent;
use game_components_embeddable_game_standard::token::structs::TokenMetadata;
use game_components_embeddable_game_standard::token::token_component::CoreTokenComponent;
use game_components_utilities::renderer::svg::create_custom_metadata;
use openzeppelin_interfaces::erc2981::{IERC2981, IERC2981_ID};
use openzeppelin_interfaces::erc721::{
    IERC721Dispatcher, IERC721DispatcherTrait, IERC721Metadata, IERC721MetadataCamelOnly,
};
use openzeppelin_introspection::src5::SRC5Component;
use openzeppelin_token::common::erc2981::erc2981::{DefaultConfig, ERC2981Component};
use openzeppelin_token::erc721::ERC721Component;
use openzeppelin_token::erc721::extensions::erc721_enumerable::ERC721EnumerableComponent;
use starknet::ContractAddress;
use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
use starknet::syscalls::call_contract_syscall;

fn try_call_and_deserialize<T, +Serde<T>, +Drop<T>>(
    address: ContractAddress, selector: felt252, calldata: Span<felt252>, default: T,
) -> T {
    match call_contract_syscall(address, selector, calldata) {
        Result::Ok(result) => {
            let mut result_span = result;
            match Serde::<T>::deserialize(ref result_span) {
                Option::Some(value) => value,
                Option::None => default,
            }
        },
        Result::Err(_) => default,
    }
}

/// Lookup game_metadata from cache or fetch from registry. Returns a clone.
fn _lookup_or_fetch_game_metadata(
    ref keys: Array<u64>,
    ref values: Array<GameMetadata>,
    registry: IMinigameRegistryDispatcher,
    game_id: u64,
) -> GameMetadata {
    let mut j: u32 = 0;
    let found: Option<GameMetadata> = loop {
        if j >= keys.len() {
            break Option::None;
        }
        if *keys.at(j) == game_id {
            break Option::Some(values.at(j).clone());
        }
        j += 1;
    };
    match found {
        Option::Some(metadata) => metadata,
        Option::None => {
            let metadata = registry.game_metadata(game_id);
            keys.append(game_id);
            let cloned = metadata.clone();
            values.append(metadata);
            cloned
        },
    }
}

/// Lookup a ContractAddress from cache or fetch via syscall. Used for settings_address,
/// objectives_address.
fn _lookup_or_fetch_address(
    ref keys: Array<ContractAddress>,
    ref vals: Array<ContractAddress>,
    target: ContractAddress,
    selector: felt252,
) -> ContractAddress {
    let mut j: u32 = 0;
    let found: Option<ContractAddress> = loop {
        if j >= keys.len() {
            break Option::None;
        }
        if *keys.at(j) == target {
            break Option::Some(*vals.at(j));
        }
        j += 1;
    };
    match found {
        Option::Some(addr) => addr,
        Option::None => {
            let addr = try_call_and_deserialize::<
                ContractAddress,
            >(target, selector, array![].span(), Zero::zero());
            keys.append(target);
            vals.append(addr);
            addr
        },
    }
}

// ================================================================================================
// CONTRACT
// ================================================================================================

#[starknet::contract]
pub mod Denshokan {
    use super::*;

    // ================================================================================================
    // COMPONENT DECLARATIONS
    // ================================================================================================

    // Core components (always included)
    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: ERC2981Component, storage: erc2981, event: ERC2981Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: CoreTokenComponent, storage: core_token, event: CoreTokenEvent);
    component!(
        path: ERC721EnumerableComponent, storage: erc721_enumerable, event: ERC721EnumerableEvent,
    );

    // Optional components (only included if enabled)
    component!(path: MinterComponent, storage: minter, event: MinterEvent);
    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SettingsComponent, storage: settings, event: SettingsEvent);
    component!(path: ContextComponent, storage: context, event: ContextEvent);
    component!(path: RendererComponent, storage: renderer, event: RendererEvent);

    // ================================================================================================
    // STORAGE
    // ================================================================================================

    #[storage]
    struct Storage {
        // Core storage (always included)
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        erc2981: ERC2981Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        core_token: CoreTokenComponent::Storage,
        #[substorage(v0)]
        erc721_enumerable: ERC721EnumerableComponent::Storage,
        // Default renderer contract address (for SVG generation)
        default_renderer_address: ContractAddress,
        // Optional storage (only included if features are enabled)
        #[substorage(v0)]
        minter: MinterComponent::Storage,
        #[substorage(v0)]
        objectives: ObjectivesComponent::Storage,
        #[substorage(v0)]
        settings: SettingsComponent::Storage,
        #[substorage(v0)]
        context: ContextComponent::Storage,
        #[substorage(v0)]
        renderer: RendererComponent::Storage,
    }

    // ================================================================================================
    // EVENTS
    // ================================================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        ERC2981Event: ERC2981Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        CoreTokenEvent: CoreTokenComponent::Event,
        #[flat]
        ERC721EnumerableEvent: ERC721EnumerableComponent::Event,
        #[flat]
        MinterEvent: MinterComponent::Event,
        #[flat]
        ObjectivesEvent: ObjectivesComponent::Event,
        #[flat]
        SettingsEvent: SettingsComponent::Event,
        #[flat]
        ContextEvent: ContextComponent::Event,
        #[flat]
        RendererEvent: RendererComponent::Event,
    }

    // ================================================================================================
    // COMPONENT IMPLEMENTATIONS
    // ================================================================================================

    // Core implementations (always included)
    #[abi(embed_v0)]
    impl ERC721Impl = ERC721Component::ERC721Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC721CamelOnlyImpl = ERC721Component::ERC721CamelOnlyImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    #[abi(embed_v0)]
    impl CoreTokenImpl = CoreTokenComponent::CoreTokenImpl<ContractState>;
    #[abi(embed_v0)]
    impl ERC721EnumerableImpl =
        ERC721EnumerableComponent::ERC721EnumerableImpl<ContractState>;

    // Optional implementations (conditional based on feature flags)
    #[abi(embed_v0)]
    impl MinterImpl = MinterComponent::MinterImpl<ContractState>;
    #[abi(embed_v0)]
    impl ObjectivesImpl = ObjectivesComponent::ObjectivesImpl<ContractState>;
    #[abi(embed_v0)]
    impl SettingsImpl = SettingsComponent::SettingsImpl<ContractState>;
    #[abi(embed_v0)]
    impl RendererImpl = RendererComponent::RendererImpl<ContractState>;

    // Internal implementations
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
    impl ERC2981InternalImpl = ERC2981Component::InternalImpl<ContractState>;
    impl SRC5InternalImpl = SRC5Component::InternalImpl<ContractState>;
    impl CoreTokenInternalImpl = CoreTokenComponent::InternalImpl<ContractState>;
    impl MinterInternalImpl = MinterComponent::InternalImpl<ContractState>;
    impl ObjectivesInternalImpl = ObjectivesComponent::InternalImpl<ContractState>;
    impl SettingsInternalImpl = SettingsComponent::InternalImpl<ContractState>;
    impl ContextInternalImpl = ContextComponent::InternalImpl<ContractState>;
    impl RendererInternalImpl = RendererComponent::InternalImpl<ContractState>;
    impl ERC721EnumerableInternalImpl = ERC721EnumerableComponent::InternalImpl<ContractState>;

    // ================================================================================================
    // OPTIONAL TRAIT IMPLEMENTATIONS
    // ================================================================================================

    // These implementations are chosen based on compile-time feature flags
    // If a feature is disabled, the NoOp implementation is used (zero runtime cost)

    impl MinterOptionalImpl = MinterComponent::MinterOptionalImpl<ContractState>;
    impl ObjectivesOptionalImpl = ObjectivesComponent::ObjectivesOptionalImpl<ContractState>;
    impl SettingsOptionalImpl = SettingsComponent::SettingsOptionalImpl<ContractState>;
    impl ContextOptionalImpl = ContextComponent::ContextOptionalImpl<ContractState>;
    impl RendererOptionalImpl = RendererComponent::RendererOptionalImpl<ContractState>;

    #[abi(embed_v0)]
    impl ERC721Metadata of IERC721Metadata<ContractState> {
        /// Returns the NFT name.
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_name.read()
        }

        /// Returns the NFT symbol.
        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_symbol.read()
        }

        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            self.erc721._require_owned(token_id);

            let token_id_felt: felt252 = token_id.try_into().unwrap();

            let token_metadata: TokenMetadata = self.core_token.token_metadata(token_id_felt);

            assert!(token_metadata.game_id != 0, "Token has invalid game ID");

            let game_registry_address = self.core_token.game_registry_address();
            let game_registry_dispatcher = IMinigameRegistryDispatcher {
                contract_address: game_registry_address,
            };
            let game_metadata = game_registry_dispatcher.game_metadata(token_metadata.game_id);
            let game_address = game_metadata.contract_address;
            let renderer_address = self.core_token.renderer_address(token_id_felt);
            let player_name = self.core_token.player_name(token_id_felt);
            let settings_address = try_call_and_deserialize::<
                ContractAddress,
            >(game_address, selector!("settings_address"), array![].span(), Zero::zero());

            let mut token_calldata = array![];
            token_calldata.append(token_id_felt);

            let score = try_call_and_deserialize::<
                u64,
            >(game_address, selector!("score"), token_calldata.span(), 0);

            let token_name = try_call_and_deserialize::<
                ByteArray,
            >(
                renderer_address,
                selector!("token_name"),
                token_calldata.span(),
                game_metadata.name.clone(),
            );

            let token_description = try_call_and_deserialize::<
                ByteArray,
            >(
                renderer_address,
                selector!("token_description"),
                token_calldata.span(),
                "An NFT representing ownership of an embeddable game.",
            );

            let mut settings_calldata = array![];
            settings_calldata.append(token_metadata.settings_id.into());

            let settings_details = try_call_and_deserialize::<
                GameSettingDetails,
            >(
                settings_address,
                selector!("settings_details"),
                settings_calldata.span(),
                GameSettingDetails { name: "", description: "", settings: array![].span() },
            );

            let minted_by_address = self.minter.get_minter_address(token_metadata.minted_by);

            let context_details = try_call_and_deserialize::<
                GameContextDetails,
            >(
                minted_by_address,
                selector!("context_details"),
                token_calldata.span(),
                GameContextDetails {
                    name: "", description: "", id: Option::None, context: array![].span(),
                },
            );

            let objective_details = if token_metadata.objective_id != 0 {
                let objectives_address = try_call_and_deserialize::<
                    ContractAddress,
                >(game_address, selector!("objectives_address"), array![].span(), Zero::zero());
                let mut obj_calldata = array![];
                obj_calldata.append(token_metadata.objective_id.into());
                try_call_and_deserialize::<
                    GameObjectiveDetails,
                >(
                    objectives_address,
                    selector!("objectives_details"),
                    obj_calldata.span(),
                    GameObjectiveDetails { name: "", description: "", objectives: array![].span() },
                )
            } else {
                GameObjectiveDetails { name: "", description: "", objectives: array![].span() }
            };

            let objective_name: ByteArray = objective_details.name.clone();

            // Try per-token renderer first, fall back to default renderer
            let game_details_svg = try_call_and_deserialize::<
                ByteArray,
            >(renderer_address, selector!("game_details_svg"), token_calldata.span(), "");

            let game_details_svg = if game_details_svg.len() > 0 {
                game_details_svg
            } else {
                let default_renderer = IDefaultRendererDispatcher {
                    contract_address: self.default_renderer_address.read(),
                };
                default_renderer
                    .create_default_svg(
                        game_metadata.clone(),
                        token_metadata.clone(),
                        score,
                        player_name,
                        settings_details.clone(),
                        objective_details,
                        context_details.clone(),
                        self.erc721.ERC721_name.read(),
                        self.erc721.ERC721_symbol.read(),
                    )
            };

            let game_details = try_call_and_deserialize::<
                Span<GameDetail>,
            >(renderer_address, selector!("game_details"), token_calldata.span(), array![].span());

            create_custom_metadata(
                token_id_felt,
                token_name,
                token_description,
                game_metadata,
                game_details_svg,
                game_details,
                settings_details,
                context_details,
                token_metadata,
                score,
                minted_by_address,
                player_name,
                objective_name,
            )
        }
    }

    #[abi(embed_v0)]
    impl ERC721MetadataCamelOnlyImpl of IERC721MetadataCamelOnly<ContractState> {
        fn tokenURI(self: @ContractState, tokenId: u256) -> ByteArray {
            self.token_uri(tokenId)
        }
    }

    // ================================================================================================
    // BATCH TOKEN URI — caches game-level data across tokens for efficiency
    // ================================================================================================

    #[abi(embed_v0)]
    impl TokenUriBatchImpl of IDenshokanTokenUriBatch<ContractState> {
        fn token_uri_batch(self: @ContractState, token_ids: Array<felt252>) -> Array<ByteArray> {
            let game_registry_address = self.core_token.game_registry_address();
            let game_registry_dispatcher = IMinigameRegistryDispatcher {
                contract_address: game_registry_address,
            };

            // Game-level caches (keyed by game_id or game_address)
            let mut game_ids_cache: Array<u64> = array![];
            let mut game_metadata_cache: Array<GameMetadata> = array![];
            let mut settings_addr_keys: Array<ContractAddress> = array![];
            let mut settings_addr_vals: Array<ContractAddress> = array![];
            let mut objectives_addr_keys: Array<ContractAddress> = array![];
            let mut objectives_addr_vals: Array<ContractAddress> = array![];

            let mut result: Array<ByteArray> = array![];

            for token_id in token_ids {
                self.erc721._require_owned(token_id.into());

                // Local component reads (no cross-contract dispatch)
                let token_metadata: TokenMetadata = self.core_token.token_metadata(token_id);
                assert!(token_metadata.game_id != 0, "Token has invalid game ID");

                // Cached: game_metadata per game_id
                let game_metadata = _lookup_or_fetch_game_metadata(
                    ref game_ids_cache,
                    ref game_metadata_cache,
                    game_registry_dispatcher,
                    token_metadata.game_id,
                );
                let game_address = game_metadata.contract_address;

                let renderer_address = self.core_token.renderer_address(token_id);
                let player_name = self.core_token.player_name(token_id);

                // Cached: settings_address per game
                let settings_address = _lookup_or_fetch_address(
                    ref settings_addr_keys,
                    ref settings_addr_vals,
                    game_address,
                    selector!("settings_address"),
                );

                // Per-token: score
                let mut token_calldata = array![];
                token_calldata.append(token_id);

                let score = try_call_and_deserialize::<
                    u64,
                >(game_address, selector!("score"), token_calldata.span(), 0);

                // Per-token: renderer calls
                let token_name = try_call_and_deserialize::<
                    ByteArray,
                >(
                    renderer_address,
                    selector!("token_name"),
                    token_calldata.span(),
                    game_metadata.name.clone(),
                );

                let token_description = try_call_and_deserialize::<
                    ByteArray,
                >(
                    renderer_address,
                    selector!("token_description"),
                    token_calldata.span(),
                    "An NFT representing ownership of an embeddable game.",
                );

                // Per-token: settings_details
                let mut settings_calldata = array![];
                settings_calldata.append(token_metadata.settings_id.into());

                let settings_details = try_call_and_deserialize::<
                    GameSettingDetails,
                >(
                    settings_address,
                    selector!("settings_details"),
                    settings_calldata.span(),
                    GameSettingDetails { name: "", description: "", settings: array![].span() },
                );

                // Per-token: context_details
                let minted_by_address = self.minter.get_minter_address(token_metadata.minted_by);

                let context_details = try_call_and_deserialize::<
                    GameContextDetails,
                >(
                    minted_by_address,
                    selector!("context_details"),
                    token_calldata.span(),
                    GameContextDetails {
                        name: "", description: "", id: Option::None, context: array![].span(),
                    },
                );

                // Cached: objectives_address per game (conditional)
                let objective_details = if token_metadata.objective_id != 0 {
                    let objectives_address = _lookup_or_fetch_address(
                        ref objectives_addr_keys,
                        ref objectives_addr_vals,
                        game_address,
                        selector!("objectives_address"),
                    );
                    let mut obj_calldata = array![];
                    obj_calldata.append(token_metadata.objective_id.into());
                    try_call_and_deserialize::<
                        GameObjectiveDetails,
                    >(
                        objectives_address,
                        selector!("objectives_details"),
                        obj_calldata.span(),
                        GameObjectiveDetails {
                            name: "", description: "", objectives: array![].span(),
                        },
                    )
                } else {
                    GameObjectiveDetails { name: "", description: "", objectives: array![].span() }
                };

                let objective_name: ByteArray = objective_details.name.clone();

                // Try per-token renderer first, fall back to default renderer
                let game_details_svg = try_call_and_deserialize::<
                    ByteArray,
                >(renderer_address, selector!("game_details_svg"), token_calldata.span(), "");

                let game_details_svg = if game_details_svg.len() > 0 {
                    game_details_svg
                } else {
                    let default_renderer = IDefaultRendererDispatcher {
                        contract_address: self.default_renderer_address.read(),
                    };
                    default_renderer
                        .create_default_svg(
                            game_metadata.clone(),
                            token_metadata.clone(),
                            score,
                            player_name,
                            settings_details.clone(),
                            objective_details,
                            context_details.clone(),
                            token_name.clone(),
                            self.erc721.ERC721_symbol.read(),
                        )
                };

                let game_details = try_call_and_deserialize::<
                    Span<GameDetail>,
                >(
                    renderer_address,
                    selector!("game_details"),
                    token_calldata.span(),
                    array![].span(),
                );

                result
                    .append(
                        create_custom_metadata(
                            token_id,
                            token_name,
                            token_description,
                            game_metadata,
                            game_details_svg,
                            game_details,
                            settings_details,
                            context_details,
                            token_metadata,
                            score,
                            minted_by_address,
                            player_name,
                            objective_name,
                        ),
                    );
            }

            result
        }
    }

    // Custom ERC2981 implementation with dynamic royalty receiver
    // For multi-game tokens: queries registry for royalty_fraction and current game creator token
    // owner
    #[abi(embed_v0)]
    impl ERC2981Impl of IERC2981<ContractState> {
        fn royalty_info(
            self: @ContractState, token_id: u256, sale_price: u256,
        ) -> (ContractAddress, u256) {
            let metadata = self.core_token.token_metadata(token_id.try_into().unwrap());
            let game_registry_address = self.core_token.game_registry_address();

            // Multi-game token: get royalty info from registry with dynamic receiver
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_metadata = registry.game_metadata(metadata.game_id.into());

            // Get royalty fraction from registry
            let royalty_fraction = game_metadata.royalty_fraction;

            // Query current owner of game_id token in registry (game creator token holder)
            // This makes royalty receiver DYNAMIC - follows token ownership
            let registry_erc721 = IERC721Dispatcher { contract_address: game_registry_address };
            let game_id_u256: u256 = metadata.game_id.into();
            let receiver = registry_erc721.owner_of(game_id_u256);

            // Calculate royalty amount: (sale_price * royalty_fraction) / 10000
            // royalty_fraction is in basis points (e.g., 500 = 5%)
            let royalty_amount = if royalty_fraction > 0 && !receiver.is_zero() {
                (sale_price * royalty_fraction.into()) / 10000
            } else {
                0
            };

            (receiver, royalty_amount)
        }
    }

    // NOTE: Filter functionality has been moved to DenshokanViewer contract
    // to reduce contract size. Use the separate DenshokanViewer contract
    // for all IDenshokanFilter operations.

    // ================================================================================================
    // ERC721 HOOKS
    // ================================================================================================

    impl ERC721HooksImpl of ERC721Component::ERC721HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) {
            // Only check soulbound restriction for transfers, not mints or burns
            // For mints, the current owner would be zero
            let current_owner = self._owner_of(token_id);
            if current_owner.into() != 0 && to.into() != 0 {
                // This is a transfer (not mint or burn)
                let contract_state = self.get_contract();
                if contract_state.is_soulbound(token_id.try_into().unwrap()) {
                    panic!("Token is soulbound and cannot be transferred");
                }
            }

            // Update ERC721Enumerable tracking
            let mut contract_state = self.get_contract_mut();
            contract_state.erc721_enumerable.before_update(to, token_id);
        }

        fn after_update(
            ref self: ERC721Component::ComponentState<ContractState>,
            to: ContractAddress,
            token_id: u256,
            auth: ContractAddress,
        ) { // No-op: event relayer pattern removed for gas efficiency
        // Transfer events are already emitted by ERC721 component
        }
    }

    // ================================================================================================
    // CONSTRUCTOR
    // ================================================================================================

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: ByteArray,
        symbol: ByteArray,
        base_uri: ByteArray,
        game_registry_address: ContractAddress,
        default_renderer_address: ContractAddress,
    ) {
        // Initialize core components
        self.erc721.initializer(name, symbol, base_uri);
        // Register erc2981 interface as not storing default royalties
        self.src5.register_interface(IERC2981_ID);
        assert!(
            !game_registry_address.is_zero(), "Denshokan: Game registry address cannot be zero",
        );
        assert!(
            !default_renderer_address.is_zero(),
            "Denshokan: Default renderer address cannot be zero",
        );
        self
            .core_token
            .initializer(Option::None, Option::None, Option::Some(game_registry_address));

        self.default_renderer_address.write(default_renderer_address);

        self.erc721_enumerable.initializer();
        self.minter.initializer();
        self.objectives.initializer();
        self.settings.initializer();
        self.context.initializer();
        self.renderer.initializer();
    }
}
