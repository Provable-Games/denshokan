// Metadata assembly, split out of the token contract as a library class.
//
// `create_custom_metadata` is ~13.3k felts of JSON/SVG string building — 16% of
// the Denshokan class, and enough on its own to push it past Starknet's 81,920
// felt limit. It is a pure function (13 value inputs -> ByteArray: no storage,
// no cross-contract calls), so it can be moved wholesale behind a
// `library_call_syscall` without the caller's context mattering.
//
// This class is DECLARED but never deployed. Denshokan stores its class hash and
// library-calls `render`, which executes in Denshokan's own context.

use game_components_embeddable_game_standard::metagame::extensions::context::structs::GameContextDetails;
use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
use game_components_embeddable_game_standard::minigame::structs::GameDetail;
use game_components_embeddable_game_standard::registry::interface::GameMetadata;
use game_components_embeddable_game_standard::token::structs::TokenMetadata;
use starknet::ContractAddress;

#[starknet::interface]
pub trait IDenshokanMetadataLib<TState> {
    /// Argument order mirrors `create_custom_metadata` exactly so the two stay
    /// trivially comparable.
    fn render(
        self: @TState,
        token_id: felt252,
        token_name: ByteArray,
        token_description: ByteArray,
        game_metadata: GameMetadata,
        game_details_image: ByteArray,
        game_details: Span<GameDetail>,
        settings_details: GameSettingDetails,
        context_details: GameContextDetails,
        token_metadata: TokenMetadata,
        score: u64,
        minted_by: ContractAddress,
        player_name: felt252,
        objective_name: ByteArray,
    ) -> ByteArray;
}

#[starknet::contract]
pub mod DenshokanMetadataLib {
    use game_components_embeddable_game_standard::metagame::extensions::context::structs::GameContextDetails;
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
    use game_components_embeddable_game_standard::minigame::structs::GameDetail;
    use game_components_embeddable_game_standard::registry::interface::GameMetadata;
    use game_components_embeddable_game_standard::token::structs::TokenMetadata;
    use game_components_utilities::renderer::metadata::create_custom_metadata;
    use starknet::ContractAddress;

    // Intentionally empty: `render` is pure, so a library call into this class
    // never touches the caller's storage and no layout agreement is required.
    #[storage]
    pub struct Storage {}

    #[abi(embed_v0)]
    impl DenshokanMetadataLibImpl of super::IDenshokanMetadataLib<ContractState> {
        fn render(
            self: @ContractState,
            token_id: felt252,
            token_name: ByteArray,
            token_description: ByteArray,
            game_metadata: GameMetadata,
            game_details_image: ByteArray,
            game_details: Span<GameDetail>,
            settings_details: GameSettingDetails,
            context_details: GameContextDetails,
            token_metadata: TokenMetadata,
            score: u64,
            minted_by: ContractAddress,
            player_name: felt252,
            objective_name: ByteArray,
        ) -> ByteArray {
            create_custom_metadata(
                token_id,
                token_name,
                token_description,
                game_metadata,
                game_details_image,
                game_details,
                settings_details,
                context_details,
                token_metadata,
                score,
                minted_by,
                player_name,
                objective_name,
            )
        }
    }
}
