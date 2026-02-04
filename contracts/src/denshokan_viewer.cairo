// DenshokanViewer Contract
// This contract implements IDenshokanFilter for efficient RPC batching.
// It separates view logic from the main Denshokan contract to reduce contract size.

use core::num::traits::Zero;
use crate::filter::{FilterResult, IDenshokanFilter, MAX_FILTER_LIMIT, TokenFullState};
use game_components_registry::interface::{
    IMinigameRegistryDispatcher, IMinigameRegistryDispatcherTrait,
};
use game_components_token::interface::{
    IMinigameTokenMixinDispatcher, IMinigameTokenMixinDispatcherTrait,
};
use game_components_token::structs::{
    unpack_game_id, unpack_minted_at, unpack_minted_by, unpack_objective_id, unpack_settings_id,
    unpack_soulbound,
};
use openzeppelin_interfaces::erc721::{
    IERC721Dispatcher, IERC721DispatcherTrait, IERC721EnumerableDispatcher,
    IERC721EnumerableDispatcherTrait,
};
use starknet::ContractAddress;
use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

// ================================================================================================
// CONTRACT
// ================================================================================================

#[starknet::contract]
pub mod DenshokanViewer {
    use super::*;

    // ================================================================================================
    // STORAGE
    // ================================================================================================

    #[storage]
    struct Storage {
        denshokan_address: ContractAddress,
    }

    // ================================================================================================
    // CONSTRUCTOR
    // ================================================================================================

    #[constructor]
    fn constructor(ref self: ContractState, denshokan_address: ContractAddress) {
        assert!(!denshokan_address.is_zero(), "DenshokanViewer: denshokan address cannot be zero");
        self.denshokan_address.write(denshokan_address);
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

        fn _get_token(self: @ContractState) -> IMinigameTokenMixinDispatcher {
            IMinigameTokenMixinDispatcher { contract_address: self._get_denshokan_address() }
        }

        fn _get_registry(self: @ContractState) -> IMinigameRegistryDispatcher {
            let game_registry_address = self._get_token().game_registry_address();
            IMinigameRegistryDispatcher { contract_address: game_registry_address }
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

        fn count_tokens_of_owner_by_game_over(self: @ContractState, owner: ContractAddress) -> u256 {
            self._count_owner_tokens_by_game_over(owner)
        }

        // ============================================================
        // BATCH FULL STATE
        // ============================================================

        fn tokens_full_state_batch(
            self: @ContractState, token_ids: Array<felt252>,
        ) -> Array<TokenFullState> {
            let erc721 = self._get_erc721();
            let token = self._get_token();
            let mut result: Array<TokenFullState> = array![];

            for token_id in token_ids {
                let metadata = token.token_metadata(token_id);
                let owner = erc721.owner_of(token_id.into());
                let player_name = token.player_name(token_id);
                let is_playable = token.is_playable(token_id);
                let game_address = token.token_game_address(token_id);

                result
                    .append(
                        TokenFullState {
                            token_id,
                            owner,
                            player_name,
                            is_playable,
                            game_address,
                            game_over: metadata.game_over,
                            completed_objective: metadata.completed_objective,
                            lifecycle: metadata.lifecycle,
                        },
                    );
            };

            result
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
            let effective_limit = if limit == 0 || limit > MAX_FILTER_LIMIT {
                MAX_FILTER_LIMIT
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
    }
}
