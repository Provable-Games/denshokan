// Denshokan Token Contract
// This contract imports from the game-components library and composes
// a full token implementation using the modular component system.

use core::num::traits::Zero;
use game_components_metagame::extensions::context::structs::GameContextDetails;
use game_components_minigame::extensions::settings::structs::GameSettingDetails;
use game_components_minigame::interface::{IMinigameDispatcher, IMinigameDispatcherTrait};
use game_components_minigame::structs::GameDetail;

// Game components imports - using full package paths
use game_components_registry::interface::{
    IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
};
use game_components_token::core::core_token::CoreTokenComponent;
use game_components_token::extensions::context::context::ContextComponent;
use game_components_token::extensions::minter::minter::MinterComponent;
use game_components_token::extensions::objectives::objectives::ObjectivesComponent;
use game_components_token::extensions::renderer::renderer::RendererComponent;
use game_components_token::extensions::settings::settings::SettingsComponent;
use game_components_token::structs::TokenMetadata;

// Core imports
use game_components_token::structs::{
    unpack_game_id, unpack_minted_at, unpack_minted_by, unpack_objective_id, unpack_settings_id,
    unpack_soulbound,
};
use game_components_utils::renderer::{create_custom_metadata, create_default_svg};
use openzeppelin_interfaces::erc2981::{IERC2981, IERC2981_ID};
use openzeppelin_interfaces::erc721::{
    IERC721Dispatcher, IERC721DispatcherTrait, IERC721Enumerable, IERC721Metadata,
};
use openzeppelin_introspection::src5::SRC5Component;
use openzeppelin_token::common::erc2981::erc2981::{DefaultConfig, ERC2981Component};
use openzeppelin_token::erc721::ERC721Component;
use openzeppelin_token::erc721::extensions::erc721_enumerable::ERC721EnumerableComponent;
use starknet::ContractAddress;
use starknet::storage::StoragePointerReadAccess;
use starknet::syscalls::call_contract_syscall;

// Filter module imports
use crate::filter::{FilterResult, IDenshokanFilter, MAX_FILTER_LIMIT};

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

            let token_metadata: TokenMetadata = self
                .core_token
                .token_metadata(token_id.try_into().unwrap());

            assert!(token_metadata.game_id != 0, "Token has invalid game ID");

            let game_registry_address = self.core_token.game_registry_address();
            let game_registry_dispatcher = IMinigameRegistryDispatcher {
                contract_address: game_registry_address,
            };
            let game_metadata = game_registry_dispatcher.game_metadata(token_metadata.game_id);
            let game_address = game_metadata.contract_address;
            let renderer_address = self.core_token.renderer_address(token_id.try_into().unwrap());
            let player_name = self.core_token.player_name(token_id.try_into().unwrap());
            let game_dispatcher = IMinigameDispatcher { contract_address: game_address };
            let settings_address = game_dispatcher.settings_address();

            let mut token_calldata = array![];
            token_calldata.append(token_id.low.into());

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

            let game_details_svg = try_call_and_deserialize::<
                ByteArray,
            >(
                renderer_address,
                selector!("game_details_svg"),
                token_calldata.span(),
                create_default_svg(
                    token_id.try_into().unwrap(), game_metadata.clone(), score, player_name,
                ),
            );

            let game_details = try_call_and_deserialize::<
                Span<GameDetail>,
            >(renderer_address, selector!("game_details"), token_calldata.span(), array![].span());

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

            create_custom_metadata(
                token_id.try_into().unwrap(),
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
            )
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

    // ================================================================================================
    // FILTER IMPLEMENTATION
    // ================================================================================================

    #[abi(embed_v0)]
    impl DenshokanFilterImpl of IDenshokanFilter<ContractState> {
        fn tokens_by_game_address(
            self: @ContractState, game_address: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            // Look up game_id from registry
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            // Return empty result if game not registered
            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_all_tokens_by_game(target_game_id, offset, limit)
        }

        fn tokens_by_game_and_settings(
            self: @ContractState,
            game_address: ContractAddress,
            settings_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            // Look up game_id from registry
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            // Return empty result if game not registered
            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_all_tokens_by_game_and_settings(target_game_id, settings_id, offset, limit)
        }

        fn tokens_by_game_and_objective(
            self: @ContractState,
            game_address: ContractAddress,
            objective_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            // Look up game_id from registry
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            // Return empty result if game not registered
            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self
                ._filter_all_tokens_by_game_and_objective(
                    target_game_id, objective_id, offset, limit,
                )
        }

        fn tokens_by_minter_address(
            self: @ContractState, minter_address: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            // Look up minter_id from minter component
            let minter_id: u64 = self.minter.get_minter_id(minter_address);

            // Return empty result if minter not registered (id 0 means unknown)
            if minter_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            self._filter_all_tokens_by_minter(minter_id, offset, limit)
        }

        fn tokens_of_owner_by_game(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            // Look up game_id from registry
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            // Return empty result if game not registered
            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_owner_tokens_by_game(owner, target_game_id, offset, limit)
        }

        fn tokens_by_soulbound(
            self: @ContractState, is_soulbound: bool, offset: u256, limit: u256,
        ) -> FilterResult {
            self._filter_all_tokens_by_soulbound(is_soulbound, offset, limit)
        }

        fn tokens_by_minted_at_range(
            self: @ContractState, start_time: u64, end_time: u64, offset: u256, limit: u256,
        ) -> FilterResult {
            // Return empty if invalid range
            if end_time < start_time {
                return FilterResult { token_ids: array![], total: 0 };
            }

            self._filter_all_tokens_by_minted_at_range(start_time, end_time, offset, limit)
        }

        // ============================================================
        // COUNT FUNCTIONS
        // ============================================================

        fn count_tokens_by_game_address(
            self: @ContractState, game_address: ContractAddress,
        ) -> u256 {
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_game(target_game_id)
        }

        fn count_tokens_by_game_and_settings(
            self: @ContractState, game_address: ContractAddress, settings_id: u32,
        ) -> u256 {
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_game_and_settings(target_game_id, settings_id)
        }

        fn count_tokens_by_game_and_objective(
            self: @ContractState, game_address: ContractAddress, objective_id: u32,
        ) -> u256 {
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_game_and_objective(target_game_id, objective_id)
        }

        fn count_tokens_by_minter_address(
            self: @ContractState, minter_address: ContractAddress,
        ) -> u256 {
            let minter_id: u64 = self.minter.get_minter_id(minter_address);

            if minter_id == 0 {
                return 0;
            }

            self._count_tokens_by_minter(minter_id)
        }

        fn count_tokens_of_owner_by_game(
            self: @ContractState, owner: ContractAddress, game_address: ContractAddress,
        ) -> u256 {
            let game_registry_address = self.core_token.game_registry_address();
            let registry = IMinigameRegistryDispatcher { contract_address: game_registry_address };
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_owner_tokens_by_game(owner, target_game_id)
        }

        fn count_tokens_by_soulbound(self: @ContractState, is_soulbound: bool) -> u256 {
            self._count_tokens_by_soulbound(is_soulbound)
        }

        fn count_tokens_by_minted_at_range(
            self: @ContractState, start_time: u64, end_time: u64,
        ) -> u256 {
            if end_time < start_time {
                return 0;
            }

            self._count_tokens_by_minted_at_range(start_time, end_time)
        }
    }

    // ================================================================================================
    // FILTER INTERNAL HELPERS
    // ================================================================================================

    #[generate_trait]
    impl FilterInternalImpl of FilterInternalTrait {
        // ============================================================
        // GAME FILTER HELPERS
        // ============================================================

        fn _filter_all_tokens_by_game(
            self: @ContractState, target_game_id: u32, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let total_supply = self.erc721_enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);

                if game_id == target_game_id {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_all_tokens_by_game_and_settings(
            self: @ContractState,
            target_game_id: u32,
            target_settings_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let total_supply = self.erc721_enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);
                let settings_id = unpack_settings_id(token_id);

                if game_id == target_game_id && settings_id == target_settings_id {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_all_tokens_by_game_and_objective(
            self: @ContractState,
            target_game_id: u32,
            target_objective_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let total_supply = self.erc721_enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);
                let objective_id = unpack_objective_id(token_id);

                if game_id == target_game_id && objective_id == target_objective_id {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        // ============================================================
        // MINTER FILTER HELPERS
        // ============================================================

        fn _filter_all_tokens_by_minter(
            self: @ContractState, target_minter_id: u64, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let total_supply = self.erc721_enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let minted_by = unpack_minted_by(token_id);

                if minted_by == target_minter_id {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        // ============================================================
        // OWNER FILTER HELPERS
        // ============================================================

        fn _filter_owner_tokens_by_game(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let owner_balance = self.erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = self.erc721_enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);

                if game_id == target_game_id {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        // ============================================================
        // SOULBOUND FILTER HELPERS
        // ============================================================

        fn _filter_all_tokens_by_soulbound(
            self: @ContractState, target_soulbound: bool, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let total_supply = self.erc721_enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let is_soulbound = unpack_soulbound(token_id);

                if is_soulbound == target_soulbound {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        // ============================================================
        // TIME RANGE FILTER HELPERS
        // ============================================================

        fn _filter_all_tokens_by_minted_at_range(
            self: @ContractState, start_time: u64, end_time: u64, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
            } else {
                limit
            };

            let total_supply = self.erc721_enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let minted_at = unpack_minted_at(token_id);

                if minted_at >= start_time && minted_at <= end_time {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        // ============================================================
        // COUNT HELPERS
        // ============================================================

        fn _count_tokens_by_game(self: @ContractState, target_game_id: u32) -> u256 {
            let total_supply = self.erc721_enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_game_and_settings(
            self: @ContractState, target_game_id: u32, target_settings_id: u32,
        ) -> u256 {
            let total_supply = self.erc721_enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id
                    && unpack_settings_id(token_id) == target_settings_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_game_and_objective(
            self: @ContractState, target_game_id: u32, target_objective_id: u32,
        ) -> u256 {
            let total_supply = self.erc721_enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id
                    && unpack_objective_id(token_id) == target_objective_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_minter(self: @ContractState, target_minter_id: u64) -> u256 {
            let total_supply = self.erc721_enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_minted_by(token_id) == target_minter_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_owner_tokens_by_game(
            self: @ContractState, owner: ContractAddress, target_game_id: u32,
        ) -> u256 {
            let owner_balance = self.erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = self.erc721_enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_soulbound(self: @ContractState, target_soulbound: bool) -> u256 {
            let total_supply = self.erc721_enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_soulbound(token_id) == target_soulbound {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_minted_at_range(
            self: @ContractState, start_time: u64, end_time: u64,
        ) -> u256 {
            let total_supply = self.erc721_enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = self.erc721_enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let minted_at = unpack_minted_at(token_id);
                if minted_at >= start_time && minted_at <= end_time {
                    count += 1;
                }
                index += 1;
            }

            count
        }
    }

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
    ) {
        // Initialize core components
        self.erc721.initializer(name, symbol, base_uri);
        // Register erc2981 interface as not storing default royalties
        self.src5.register_interface(IERC2981_ID);
        assert!(
            !game_registry_address.is_zero(), "Denshokan: Game registry address cannot be zero",
        );
        self
            .core_token
            .initializer(Option::None, Option::None, Option::Some(game_registry_address));

        self.erc721_enumerable.initializer();
        self.minter.initializer();
        self.objectives.initializer();
        self.settings.initializer();
        self.context.initializer();
        self.renderer.initializer();
    }
}
