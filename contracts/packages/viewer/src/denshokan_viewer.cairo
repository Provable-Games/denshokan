// DenshokanViewer Contract
// This contract implements IDenshokanFilter for efficient RPC batching.
// It separates view logic from the main Denshokan contract to reduce contract size.
// Now includes OwnableComponent and UpgradeableComponent for access control and upgradability.

use core::num::traits::Zero;
use denshokan_interfaces::filter::{
    DenshokanTokenState, FilterResult, GameEntry, GamesResult, IDenshokanFilter, IDenshokanGames,
    IDenshokanSettingsObjectives, ObjectiveEntry, ObjectivesResult, SettingsEntry, SettingsResult,
    TokenFullState,
};
use game_components_embeddable_game_standard::minigame::extensions::objectives::interface::{
    IMINIGAME_OBJECTIVES_ID, IMinigameObjectivesDetailsDispatcher,
    IMinigameObjectivesDetailsDispatcherTrait,
};
use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
    IMINIGAME_SETTINGS_ID, IMinigameSettingsDetailsDispatcher,
    IMinigameSettingsDetailsDispatcherTrait,
};
use game_components_embeddable_game_standard::registry::interface::{
    IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
};
use game_components_embeddable_game_standard::token::interface::{
    IMinigameTokenMixinDispatcher, IMinigameTokenMixinDispatcherTrait,
};
use game_components_embeddable_game_standard::token::structs::{
    unpack_game_id, unpack_minted_at, unpack_minted_by, unpack_objective_id, unpack_settings_id,
    unpack_soulbound,
};
use openzeppelin_access::ownable::OwnableComponent;
use openzeppelin_interfaces::erc721::{
    IERC721Dispatcher, IERC721DispatcherTrait, IERC721EnumerableDispatcher,
    IERC721EnumerableDispatcherTrait, IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait,
};
use openzeppelin_interfaces::introspection::{ISRC5Dispatcher, ISRC5DispatcherTrait};
use openzeppelin_interfaces::upgrades::IUpgradeable;
use openzeppelin_upgrades::UpgradeableComponent;
use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
use starknet::{ClassHash, ContractAddress};

// ================================================================================================
// CONTRACT
// ================================================================================================

#[starknet::contract]
pub mod DenshokanViewer {
    use super::*;

    // ================================================================================================
    // COMPONENT DECLARATIONS
    // ================================================================================================

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    // ================================================================================================
    // COMPONENT IMPLEMENTATIONS
    // ================================================================================================

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableCamelOnlyImpl =
        OwnableComponent::OwnableCamelOnlyImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // ================================================================================================
    // STORAGE
    // ================================================================================================

    #[storage]
    struct Storage {
        denshokan_address: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
    }

    // ================================================================================================
    // EVENTS
    // ================================================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    // ================================================================================================
    // CONSTRUCTOR
    // ================================================================================================

    #[constructor]
    fn constructor(
        ref self: ContractState, owner: ContractAddress, denshokan_address: ContractAddress,
    ) {
        assert!(!owner.is_zero(), "DenshokanViewer: owner address cannot be zero");
        assert!(!denshokan_address.is_zero(), "DenshokanViewer: denshokan address cannot be zero");
        self.ownable.initializer(owner);
        self.denshokan_address.write(denshokan_address);
    }

    // ================================================================================================
    // UPGRADEABLE IMPLEMENTATION
    // ================================================================================================

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    // ================================================================================================
    // DISPATCHER HELPERS
    // ================================================================================================

    #[generate_trait]
    impl DispatcherHelpers of DispatcherHelpersTrait {
        fn _get_denshokan_address(self: @ContractState) -> ContractAddress {
            self.denshokan_address.read()
        }

        fn _get_erc721(self: @ContractState) -> IERC721Dispatcher {
            IERC721Dispatcher { contract_address: self._get_denshokan_address() }
        }

        fn _get_enumerable(self: @ContractState) -> IERC721EnumerableDispatcher {
            IERC721EnumerableDispatcher { contract_address: self._get_denshokan_address() }
        }

        fn _get_erc721_metadata(self: @ContractState) -> IERC721MetadataDispatcher {
            IERC721MetadataDispatcher { contract_address: self._get_denshokan_address() }
        }

        fn _get_token(self: @ContractState) -> IMinigameTokenMixinDispatcher {
            IMinigameTokenMixinDispatcher { contract_address: self._get_denshokan_address() }
        }

        fn _get_registry(self: @ContractState) -> IMinigameRegistryDispatcher {
            let game_registry_address = self._get_token().game_registry_address();
            IMinigameRegistryDispatcher { contract_address: game_registry_address }
        }

        fn _get_settings_dispatcher(
            self: @ContractState, game_address: ContractAddress,
        ) -> IMinigameSettingsDetailsDispatcher {
            IMinigameSettingsDetailsDispatcher { contract_address: game_address }
        }

        fn _get_objectives_dispatcher(
            self: @ContractState, game_address: ContractAddress,
        ) -> IMinigameObjectivesDetailsDispatcher {
            IMinigameObjectivesDetailsDispatcher { contract_address: game_address }
        }

        fn _supports_settings(self: @ContractState, game_address: ContractAddress) -> bool {
            ISRC5Dispatcher { contract_address: game_address }
                .supports_interface(IMINIGAME_SETTINGS_ID)
        }

        fn _supports_objectives(self: @ContractState, game_address: ContractAddress) -> bool {
            ISRC5Dispatcher { contract_address: game_address }
                .supports_interface(IMINIGAME_OBJECTIVES_ID)
        }

        fn _resolve_minter_address_cached(
            self: @ContractState,
            token: @IMinigameTokenMixinDispatcher,
            minter_id: u64,
            ref cache: Array<(u64, ContractAddress)>,
        ) -> ContractAddress {
            // Check cache first
            let mut j: u32 = 0;
            loop {
                if j >= cache.len() {
                    break;
                }
                let (cached_id, cached_addr) = *cache.at(j);
                if cached_id == minter_id {
                    break;
                }
                j += 1;
            }
            if j < cache.len() {
                let (_, addr) = *cache.at(j);
                return addr;
            }
            // Cache miss — resolve via contract
            let addr = (*token).get_minter_address(minter_id);
            cache.append((minter_id, addr));
            addr
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
            let registry = self._get_registry();
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
            let registry = self._get_registry();
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
            let registry = self._get_registry();
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
            let minter_id: u64 = self._get_token().get_minter_id(minter_address);

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
            let registry = self._get_registry();
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
            let registry = self._get_registry();
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
            let registry = self._get_registry();
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
            let registry = self._get_registry();
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
            let minter_id: u64 = self._get_token().get_minter_id(minter_address);

            if minter_id == 0 {
                return 0;
            }

            self._count_tokens_by_minter(minter_id)
        }

        fn count_tokens_of_owner_by_game(
            self: @ContractState, owner: ContractAddress, game_address: ContractAddress,
        ) -> u256 {
            let registry = self._get_registry();
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

        // ============================================================
        // PLAYABLE/GAME_OVER FILTERS
        // ============================================================

        fn tokens_by_game_and_playable(
            self: @ContractState, game_address: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_all_tokens_by_game_and_playable(target_game_id, offset, limit)
        }

        fn tokens_by_game_and_game_over(
            self: @ContractState, game_address: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_all_tokens_by_game_and_game_over(target_game_id, offset, limit)
        }

        fn tokens_of_owner_by_game_and_playable(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_owner_tokens_by_game_and_playable(owner, target_game_id, offset, limit)
        }

        fn tokens_by_playable(self: @ContractState, offset: u256, limit: u256) -> FilterResult {
            self._filter_all_tokens_by_playable(offset, limit)
        }

        fn tokens_of_owner_by_soulbound(
            self: @ContractState,
            owner: ContractAddress,
            is_soulbound: bool,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            self._filter_owner_tokens_by_soulbound(owner, is_soulbound, offset, limit)
        }

        // ============================================================
        // MINTER + OWNER FILTER
        // ============================================================

        fn tokens_of_owner_by_minter(
            self: @ContractState,
            owner: ContractAddress,
            minter_address: ContractAddress,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let minter_id: u64 = self._get_token().get_minter_id(minter_address);

            if minter_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            self._filter_owner_tokens_by_minter(owner, minter_id, offset, limit)
        }

        // ============================================================
        // MINTER + GAME FILTER
        // ============================================================

        fn tokens_by_minter_and_game(
            self: @ContractState,
            minter_address: ContractAddress,
            game_address: ContractAddress,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let minter_id: u64 = self._get_token().get_minter_id(minter_address);

            if minter_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_all_tokens_by_minter_and_game(minter_id, target_game_id, offset, limit)
        }

        // ============================================================
        // OWNER + GAME + SETTINGS FILTER
        // ============================================================

        fn tokens_of_owner_by_game_and_settings(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            settings_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self
                ._filter_owner_tokens_by_game_and_settings(
                    owner, target_game_id, settings_id, offset, limit,
                )
        }

        // ============================================================
        // OWNER + GAME + OBJECTIVE FILTER
        // ============================================================

        fn tokens_of_owner_by_game_and_objective(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            objective_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self
                ._filter_owner_tokens_by_game_and_objective(
                    owner, target_game_id, objective_id, offset, limit,
                )
        }

        // ============================================================
        // OWNER + GAME + GAME_OVER FILTER
        // ============================================================

        fn tokens_of_owner_by_game_and_game_over(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._filter_owner_tokens_by_game_and_game_over(owner, target_game_id, offset, limit)
        }

        // ============================================================
        // GAME + SOULBOUND FILTER
        // ============================================================

        fn tokens_by_game_and_soulbound(
            self: @ContractState,
            game_address: ContractAddress,
            is_soulbound: bool,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return FilterResult { token_ids: array![], total: 0 };
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self
                ._filter_all_tokens_by_game_and_soulbound(
                    target_game_id, is_soulbound, offset, limit,
                )
        }

        // ============================================================
        // COUNT FUNCTIONS FOR NEW FILTERS
        // ============================================================

        fn count_tokens_by_game_and_playable(
            self: @ContractState, game_address: ContractAddress,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_game_and_playable(target_game_id)
        }

        fn count_tokens_by_game_and_game_over(
            self: @ContractState, game_address: ContractAddress,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_game_and_game_over(target_game_id)
        }

        fn count_tokens_of_owner_by_game_and_playable(
            self: @ContractState, owner: ContractAddress, game_address: ContractAddress,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_owner_tokens_by_game_and_playable(owner, target_game_id)
        }

        fn count_tokens_by_playable(self: @ContractState) -> u256 {
            self._count_tokens_by_playable()
        }

        fn count_tokens_of_owner_by_soulbound(
            self: @ContractState, owner: ContractAddress, is_soulbound: bool,
        ) -> u256 {
            self._count_owner_tokens_by_soulbound(owner, is_soulbound)
        }

        // ============================================================
        // COUNT FUNCTIONS FOR NEW FILTER COMBINATIONS
        // ============================================================

        fn count_tokens_of_owner_by_minter(
            self: @ContractState, owner: ContractAddress, minter_address: ContractAddress,
        ) -> u256 {
            let minter_id: u64 = self._get_token().get_minter_id(minter_address);

            if minter_id == 0 {
                return 0;
            }

            self._count_owner_tokens_by_minter(owner, minter_id)
        }

        fn count_tokens_by_minter_and_game(
            self: @ContractState, minter_address: ContractAddress, game_address: ContractAddress,
        ) -> u256 {
            let minter_id: u64 = self._get_token().get_minter_id(minter_address);

            if minter_id == 0 {
                return 0;
            }

            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_minter_and_game(minter_id, target_game_id)
        }

        fn count_tokens_of_owner_by_game_and_settings(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            settings_id: u32,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_owner_tokens_by_game_and_settings(owner, target_game_id, settings_id)
        }

        fn count_tokens_of_owner_by_game_and_objective(
            self: @ContractState,
            owner: ContractAddress,
            game_address: ContractAddress,
            objective_id: u32,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_owner_tokens_by_game_and_objective(owner, target_game_id, objective_id)
        }

        fn count_tokens_of_owner_by_game_and_game_over(
            self: @ContractState, owner: ContractAddress, game_address: ContractAddress,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_owner_tokens_by_game_and_game_over(owner, target_game_id)
        }

        fn count_tokens_by_game_and_soulbound(
            self: @ContractState, game_address: ContractAddress, is_soulbound: bool,
        ) -> u256 {
            let registry = self._get_registry();
            let game_id: u64 = registry.game_id_from_address(game_address);

            if game_id == 0 {
                return 0;
            }

            let target_game_id: u32 = game_id.try_into().unwrap();
            self._count_tokens_by_game_and_soulbound(target_game_id, is_soulbound)
        }

        // ============================================================
        // OWNER TOKENS (no game filter)
        // ============================================================

        fn tokens_of_owner(
            self: @ContractState, owner: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            self._filter_owner_tokens(owner, offset, limit)
        }

        fn count_tokens_of_owner(self: @ContractState, owner: ContractAddress) -> u256 {
            self._get_erc721().balance_of(owner)
        }

        // ============================================================
        // OWNER + PLAYABLE STATUS (across all games)
        // ============================================================

        fn tokens_of_owner_by_playable(
            self: @ContractState, owner: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            self._filter_owner_tokens_by_playable(owner, offset, limit)
        }

        fn tokens_of_owner_by_game_over(
            self: @ContractState, owner: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            self._filter_owner_tokens_by_game_over(owner, offset, limit)
        }

        fn count_tokens_of_owner_by_playable(self: @ContractState, owner: ContractAddress) -> u256 {
            self._count_owner_tokens_by_playable(owner)
        }

        fn count_tokens_of_owner_by_game_over(
            self: @ContractState, owner: ContractAddress,
        ) -> u256 {
            self._count_owner_tokens_by_game_over(owner)
        }

        // ============================================================
        // BATCH FULL STATE
        // ============================================================

        fn tokens_full_state_batch(
            self: @ContractState, token_ids: Array<felt252>,
        ) -> Array<TokenFullState> {
            // Single dispatch: viewer → denshokan (component handles everything locally)
            let token = self._get_token();
            token.token_full_state_batch(token_ids.span())
        }

        fn denshokan_tokens_batch(
            self: @ContractState, token_ids: Array<felt252>,
        ) -> Array<DenshokanTokenState> {
            let token = self._get_token();
            let base_states = token.token_full_state_batch(token_ids.span());

            // Cache minter_id -> minter_address to avoid redundant lookups
            let mut minter_cache: Array<(u64, ContractAddress)> = array![];
            let mut results: Array<DenshokanTokenState> = array![];

            let mut i: u32 = 0;
            loop {
                if i >= base_states.len() {
                    break;
                }
                let base = base_states.at(i);
                let token_id = *base.token_id;
                let minted_by = unpack_minted_by(token_id);

                // Resolve minter_address with cache
                let minter_address = self
                    ._resolve_minter_address_cached(@token, minted_by, ref minter_cache);

                let renderer_address = token.renderer_address(token_id);
                let skills_address = token.skills_address(token_id);
                let client_url = token.client_url(token_id);

                results
                    .append(
                        DenshokanTokenState {
                            base: TokenFullState {
                                token_id,
                                owner: *base.owner,
                                player_name: *base.player_name,
                                is_playable: *base.is_playable,
                                game_address: *base.game_address,
                                game_over: *base.game_over,
                                completed_objective: *base.completed_objective,
                                lifecycle: *base.lifecycle,
                            },
                            minter_address,
                            renderer_address,
                            skills_address,
                            client_url,
                        },
                    );
                i += 1;
            }

            results
        }
    }

    // ================================================================================================
    // SETTINGS/OBJECTIVES IMPLEMENTATION
    // ================================================================================================

    #[abi(embed_v0)]
    impl DenshokanSettingsObjectivesImpl of IDenshokanSettingsObjectives<ContractState> {
        fn all_settings(
            self: @ContractState, game_address: ContractAddress, offset: u32, limit: u32,
        ) -> SettingsResult {
            let filter_by_game = game_address.is_non_zero();

            if filter_by_game {
                // Single-game query — skip if game doesn't support settings
                if !self._supports_settings(game_address) {
                    return SettingsResult { entries: array![], total: 0 };
                }

                let settings_disp = self._get_settings_dispatcher(game_address);
                let settings_count = settings_disp.settings_count();

                let mut entries: Array<SettingsEntry> = array![];
                let mut total: u32 = 0;
                let mut settings_index: u32 = 1;

                while settings_index <= settings_count {
                    if total >= offset && (limit == 0 || entries.len() < limit) {
                        let details = settings_disp.settings_details(settings_index);
                        entries
                            .append(
                                SettingsEntry {
                                    game_address, settings_id: settings_index, details,
                                },
                            );
                    }
                    total += 1;
                    settings_index += 1;
                }

                SettingsResult { entries, total }
            } else {
                // Cross-game query
                let registry = self._get_registry();
                let game_count: u64 = registry.game_count();

                let mut entries: Array<SettingsEntry> = array![];
                let mut total: u32 = 0;
                let mut game_index: u64 = 1;

                while game_index <= game_count {
                    let game_metadata = registry.game_metadata(game_index);
                    let ga = game_metadata.contract_address;

                    // Skip games that don't support settings interface
                    if !self._supports_settings(ga) {
                        game_index += 1;
                        continue;
                    }

                    let settings_disp = self._get_settings_dispatcher(ga);
                    let settings_count = settings_disp.settings_count();

                    let mut settings_index: u32 = 1;
                    while settings_index <= settings_count {
                        if total >= offset && (limit == 0 || entries.len() < limit) {
                            let details = settings_disp.settings_details(settings_index);
                            entries
                                .append(
                                    SettingsEntry {
                                        game_address: ga, settings_id: settings_index, details,
                                    },
                                );
                        }
                        total += 1;
                        settings_index += 1;
                    }

                    game_index += 1;
                }

                SettingsResult { entries, total }
            }
        }

        fn all_objectives(
            self: @ContractState, game_address: ContractAddress, offset: u32, limit: u32,
        ) -> ObjectivesResult {
            let filter_by_game = game_address.is_non_zero();

            if filter_by_game {
                // Single-game query — skip if game doesn't support objectives
                if !self._supports_objectives(game_address) {
                    return ObjectivesResult { entries: array![], total: 0 };
                }

                let objectives_disp = self._get_objectives_dispatcher(game_address);
                let objectives_count = objectives_disp.objectives_count();

                let mut entries: Array<ObjectiveEntry> = array![];
                let mut total: u32 = 0;
                let mut obj_index: u32 = 1;

                while obj_index <= objectives_count {
                    if total >= offset && (limit == 0 || entries.len() < limit) {
                        let details = objectives_disp.objectives_details(obj_index);
                        entries
                            .append(
                                ObjectiveEntry { game_address, objective_id: obj_index, details },
                            );
                    }
                    total += 1;
                    obj_index += 1;
                }

                ObjectivesResult { entries, total }
            } else {
                // Cross-game query
                let registry = self._get_registry();
                let game_count: u64 = registry.game_count();

                let mut entries: Array<ObjectiveEntry> = array![];
                let mut total: u32 = 0;
                let mut game_index: u64 = 1;

                while game_index <= game_count {
                    let game_metadata = registry.game_metadata(game_index);
                    let ga = game_metadata.contract_address;

                    // Skip games that don't support objectives interface
                    if !self._supports_objectives(ga) {
                        game_index += 1;
                        continue;
                    }

                    let objectives_disp = self._get_objectives_dispatcher(ga);
                    let objectives_count = objectives_disp.objectives_count();

                    let mut obj_index: u32 = 1;
                    while obj_index <= objectives_count {
                        if total >= offset && (limit == 0 || entries.len() < limit) {
                            let details = objectives_disp.objectives_details(obj_index);
                            entries
                                .append(
                                    ObjectiveEntry {
                                        game_address: ga, objective_id: obj_index, details,
                                    },
                                );
                        }
                        total += 1;
                        obj_index += 1;
                    }

                    game_index += 1;
                }

                ObjectivesResult { entries, total }
            }
        }

        fn count_settings(self: @ContractState, game_address: ContractAddress) -> u32 {
            if game_address.is_non_zero() {
                // Skip if game doesn't support settings interface
                if !self._supports_settings(game_address) {
                    return 0;
                }
                let settings_disp = self._get_settings_dispatcher(game_address);
                settings_disp.settings_count()
            } else {
                let registry = self._get_registry();
                let game_count: u64 = registry.game_count();
                let mut total: u32 = 0;
                let mut game_index: u64 = 1;

                while game_index <= game_count {
                    let game_metadata = registry.game_metadata(game_index);
                    let ga = game_metadata.contract_address;

                    // Skip games that don't support settings interface
                    if self._supports_settings(ga) {
                        let settings_disp = self._get_settings_dispatcher(ga);
                        total += settings_disp.settings_count();
                    }

                    game_index += 1;
                }

                total
            }
        }

        fn count_objectives(self: @ContractState, game_address: ContractAddress) -> u32 {
            if game_address.is_non_zero() {
                // Skip if game doesn't support objectives interface
                if !self._supports_objectives(game_address) {
                    return 0;
                }
                let objectives_disp = self._get_objectives_dispatcher(game_address);
                objectives_disp.objectives_count()
            } else {
                let registry = self._get_registry();
                let game_count: u64 = registry.game_count();
                let mut total: u32 = 0;
                let mut game_index: u64 = 1;

                while game_index <= game_count {
                    let game_metadata = registry.game_metadata(game_index);
                    let ga = game_metadata.contract_address;

                    // Skip games that don't support objectives interface
                    if self._supports_objectives(ga) {
                        let objectives_disp = self._get_objectives_dispatcher(ga);
                        total += objectives_disp.objectives_count();
                    }

                    game_index += 1;
                }

                total
            }
        }
    }

    // ================================================================================================
    // GAMES IMPLEMENTATION
    // ================================================================================================

    #[abi(embed_v0)]
    impl DenshokanGamesImpl of IDenshokanGames<ContractState> {
        fn all_games(self: @ContractState, offset: u64, limit: u64) -> GamesResult {
            let registry = self._get_registry();
            let total = registry.game_count();

            let mut entries: Array<GameEntry> = array![];

            if offset >= total {
                return GamesResult { entries, total };
            }

            let effective_limit = if limit == 0 {
                total
            } else {
                limit
            };
            let mut game_index: u64 = offset + 1;

            while game_index <= total {
                if entries.len().into() >= effective_limit {
                    break;
                }
                let metadata = registry.game_metadata(game_index);
                let fee_info = registry.game_fee_info(game_index);
                entries.append(GameEntry { game_id: game_index, metadata, fee_info });
                game_index += 1;
            }

            GamesResult { entries, total }
        }

        fn games_by_genre(
            self: @ContractState, genre: ByteArray, offset: u64, limit: u64,
        ) -> GamesResult {
            let registry = self._get_registry();
            let total_games = registry.game_count();
            let effective_limit = if limit == 0 {
                total_games
            } else {
                limit
            };

            let mut entries: Array<GameEntry> = array![];
            let mut matched: u64 = 0;
            let mut game_index: u64 = 1;

            while game_index <= total_games {
                let metadata = registry.game_metadata(game_index);
                if metadata.genre == genre {
                    if matched >= offset && entries.len().into() < effective_limit {
                        let fee_info = registry.game_fee_info(game_index);
                        entries.append(GameEntry { game_id: game_index, metadata, fee_info });
                    }
                    matched += 1;
                }
                game_index += 1;
            }

            GamesResult { entries, total: matched }
        }

        fn games_by_developer(
            self: @ContractState, developer: ByteArray, offset: u64, limit: u64,
        ) -> GamesResult {
            let registry = self._get_registry();
            let total_games = registry.game_count();
            let effective_limit = if limit == 0 {
                total_games
            } else {
                limit
            };

            let mut entries: Array<GameEntry> = array![];
            let mut matched: u64 = 0;
            let mut game_index: u64 = 1;

            while game_index <= total_games {
                let metadata = registry.game_metadata(game_index);
                if metadata.developer == developer {
                    if matched >= offset && entries.len().into() < effective_limit {
                        let fee_info = registry.game_fee_info(game_index);
                        entries.append(GameEntry { game_id: game_index, metadata, fee_info });
                    }
                    matched += 1;
                }
                game_index += 1;
            }

            GamesResult { entries, total: matched }
        }

        fn games_by_publisher(
            self: @ContractState, publisher: ByteArray, offset: u64, limit: u64,
        ) -> GamesResult {
            let registry = self._get_registry();
            let total_games = registry.game_count();
            let effective_limit = if limit == 0 {
                total_games
            } else {
                limit
            };

            let mut entries: Array<GameEntry> = array![];
            let mut matched: u64 = 0;
            let mut game_index: u64 = 1;

            while game_index <= total_games {
                let metadata = registry.game_metadata(game_index);
                if metadata.publisher == publisher {
                    if matched >= offset && entries.len().into() < effective_limit {
                        let fee_info = registry.game_fee_info(game_index);
                        entries.append(GameEntry { game_id: game_index, metadata, fee_info });
                    }
                    matched += 1;
                }
                game_index += 1;
            }

            GamesResult { entries, total: matched }
        }

        fn game_count(self: @ContractState) -> u64 {
            let registry = self._get_registry();
            registry.game_count()
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_soulbound(self: @ContractState, target_soulbound: bool) -> u256 {
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
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
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let minted_at = unpack_minted_at(token_id);
                if minted_at >= start_time && minted_at <= end_time {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // PLAYABLE/GAME_OVER FILTER HELPERS
        // ============================================================

        fn _filter_all_tokens_by_game_and_playable(
            self: @ContractState, target_game_id: u32, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);

                if game_id == target_game_id && token.is_playable(token_id) {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_all_tokens_by_game_and_game_over(
            self: @ContractState, target_game_id: u32, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);
                let metadata = token.token_metadata(token_id);

                if game_id == target_game_id && metadata.game_over {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_owner_tokens_by_game_and_playable(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);

                if game_id == target_game_id && token.is_playable(token_id) {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_all_tokens_by_playable(
            self: @ContractState, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();

                if token.is_playable(token_id) {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_owner_tokens_by_soulbound(
            self: @ContractState,
            owner: ContractAddress,
            target_soulbound: bool,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
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
        // COUNT HELPERS FOR NEW FILTERS
        // ============================================================

        fn _count_tokens_by_game_and_playable(self: @ContractState, target_game_id: u32) -> u256 {
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id && token.is_playable(token_id) {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_game_and_game_over(self: @ContractState, target_game_id: u32) -> u256 {
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let metadata = token.token_metadata(token_id);
                if unpack_game_id(token_id) == target_game_id && metadata.game_over {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_owner_tokens_by_game_and_playable(
            self: @ContractState, owner: ContractAddress, target_game_id: u32,
        ) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id && token.is_playable(token_id) {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_tokens_by_playable(self: @ContractState) -> u256 {
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if token.is_playable(token_id) {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_owner_tokens_by_soulbound(
            self: @ContractState, owner: ContractAddress, target_soulbound: bool,
        ) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_soulbound(token_id) == target_soulbound {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // OWNER TOKENS HELPERS (no game filter)
        // ============================================================

        fn _filter_owner_tokens(
            self: @ContractState, owner: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut collected: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                if index >= offset && collected < effective_limit {
                    let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                    let token_id: felt252 = token_id_u256.try_into().unwrap();
                    result.append(token_id);
                    collected += 1;
                }
                index += 1;
            }

            FilterResult { token_ids: result, total: owner_balance }
        }

        // ============================================================
        // OWNER + PLAYABLE/GAME_OVER HELPERS (across all games)
        // ============================================================

        fn _filter_owner_tokens_by_playable(
            self: @ContractState, owner: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();

                if token.is_playable(token_id) {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _filter_owner_tokens_by_game_over(
            self: @ContractState, owner: ContractAddress, offset: u256, limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let metadata = token.token_metadata(token_id);

                if metadata.game_over {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _count_owner_tokens_by_playable(self: @ContractState, owner: ContractAddress) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if token.is_playable(token_id) {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        fn _count_owner_tokens_by_game_over(self: @ContractState, owner: ContractAddress) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let metadata = token.token_metadata(token_id);
                if metadata.game_over {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // NEW FILTER HELPERS: MINTER + OWNER
        // ============================================================

        fn _filter_owner_tokens_by_minter(
            self: @ContractState,
            owner: ContractAddress,
            target_minter_id: u64,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
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

        fn _count_owner_tokens_by_minter(
            self: @ContractState, owner: ContractAddress, target_minter_id: u64,
        ) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_minted_by(token_id) == target_minter_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // NEW FILTER HELPERS: MINTER + GAME
        // ============================================================

        fn _filter_all_tokens_by_minter_and_game(
            self: @ContractState,
            target_minter_id: u64,
            target_game_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let minted_by = unpack_minted_by(token_id);
                let game_id = unpack_game_id(token_id);

                if minted_by == target_minter_id && game_id == target_game_id {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _count_tokens_by_minter_and_game(
            self: @ContractState, target_minter_id: u64, target_game_id: u32,
        ) -> u256 {
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_minted_by(token_id) == target_minter_id
                    && unpack_game_id(token_id) == target_game_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // NEW FILTER HELPERS: OWNER + GAME + SETTINGS
        // ============================================================

        fn _filter_owner_tokens_by_game_and_settings(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            target_settings_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
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

        fn _count_owner_tokens_by_game_and_settings(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            target_settings_id: u32,
        ) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id
                    && unpack_settings_id(token_id) == target_settings_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // NEW FILTER HELPERS: OWNER + GAME + OBJECTIVE
        // ============================================================

        fn _filter_owner_tokens_by_game_and_objective(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            target_objective_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
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

        fn _count_owner_tokens_by_game_and_objective(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            target_objective_id: u32,
        ) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id
                    && unpack_objective_id(token_id) == target_objective_id {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // NEW FILTER HELPERS: OWNER + GAME + GAME_OVER
        // ============================================================

        fn _filter_owner_tokens_by_game_and_game_over(
            self: @ContractState,
            owner: ContractAddress,
            target_game_id: u32,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);
                let metadata = token.token_metadata(token_id);

                if game_id == target_game_id && metadata.game_over {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _count_owner_tokens_by_game_and_game_over(
            self: @ContractState, owner: ContractAddress, target_game_id: u32,
        ) -> u256 {
            let erc721 = self._get_erc721();
            let enumerable = self._get_enumerable();
            let token = self._get_token();
            let owner_balance = erc721.balance_of(owner);
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < owner_balance {
                let token_id_u256 = enumerable.token_of_owner_by_index(owner, index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let metadata = token.token_metadata(token_id);
                if unpack_game_id(token_id) == target_game_id && metadata.game_over {
                    count += 1;
                }
                index += 1;
            }

            count
        }

        // ============================================================
        // NEW FILTER HELPERS: GAME + SOULBOUND
        // ============================================================

        fn _filter_all_tokens_by_game_and_soulbound(
            self: @ContractState,
            target_game_id: u32,
            target_soulbound: bool,
            offset: u256,
            limit: u256,
        ) -> FilterResult {
            let effective_limit = if limit == 0 {
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
            } else {
                limit
            };

            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut result: Array<felt252> = array![];
            let mut total_matches: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                let game_id = unpack_game_id(token_id);
                let is_soulbound = unpack_soulbound(token_id);

                if game_id == target_game_id && is_soulbound == target_soulbound {
                    if total_matches >= offset && result.len().into() < effective_limit {
                        result.append(token_id);
                    }
                    total_matches += 1;
                }

                index += 1;
            }

            FilterResult { token_ids: result, total: total_matches }
        }

        fn _count_tokens_by_game_and_soulbound(
            self: @ContractState, target_game_id: u32, target_soulbound: bool,
        ) -> u256 {
            let enumerable = self._get_enumerable();
            let total_supply = enumerable.total_supply();
            let mut count: u256 = 0;
            let mut index: u256 = 0;

            while index < total_supply {
                let token_id_u256 = enumerable.token_by_index(index);
                let token_id: felt252 = token_id_u256.try_into().unwrap();
                if unpack_game_id(token_id) == target_game_id
                    && unpack_soulbound(token_id) == target_soulbound {
                    count += 1;
                }
                index += 1;
            }

            count
        }
    }
}
