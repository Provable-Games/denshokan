use game_components_embeddable_game_standard::metagame::extensions::context::structs::GameContextDetails;
use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::GameObjectiveDetails;
use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
use game_components_embeddable_game_standard::registry::interface::GameMetadata;
use game_components_embeddable_game_standard::token::structs::TokenMetadata;

#[starknet::interface]
pub trait IDefaultRenderer<TContractState> {
    fn create_default_svg(
        self: @TContractState,
        game_metadata: GameMetadata,
        token_metadata: TokenMetadata,
        score: u64,
        player_name: felt252,
        settings_details: GameSettingDetails,
        objective_details: GameObjectiveDetails,
        context_details: GameContextDetails,
        token_name: ByteArray,
        token_symbol: ByteArray,
    ) -> ByteArray;
}

#[starknet::contract]
pub mod DefaultRenderer {
    use game_components_embeddable_game_standard::metagame::extensions::context::structs::GameContextDetails;
    use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::GameObjectiveDetails;
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::GameSettingDetails;
    use game_components_embeddable_game_standard::registry::interface::GameMetadata;
    use game_components_embeddable_game_standard::token::structs::TokenMetadata;
    use game_components_utilities::renderer::svg::create_default_svg as _create_default_svg;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl DefaultRendererImpl of super::IDefaultRenderer<ContractState> {
        fn create_default_svg(
            self: @ContractState,
            game_metadata: GameMetadata,
            token_metadata: TokenMetadata,
            score: u64,
            player_name: felt252,
            settings_details: GameSettingDetails,
            objective_details: GameObjectiveDetails,
            context_details: GameContextDetails,
            token_name: ByteArray,
            token_symbol: ByteArray,
        ) -> ByteArray {
            _create_default_svg(
                game_metadata,
                token_metadata,
                score,
                player_name,
                settings_details,
                objective_details,
                context_details,
                token_name,
                token_symbol,
            )
        }
    }
}
