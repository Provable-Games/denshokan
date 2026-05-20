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
        client_url: ByteArray,
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
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_interfaces::upgrades::IUpgradeable;
    use openzeppelin_upgrades::upgradeable::UpgradeableComponent;
    use starknet::{ClassHash, ContractAddress};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    #[abi(embed_v0)]
    impl OwnableImpl = OwnableComponent::OwnableImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress) {
        self.ownable.initializer(owner);
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.ownable.assert_only_owner();
            self.upgradeable.upgrade(new_class_hash);
        }
    }

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
            client_url: ByteArray,
        ) -> ByteArray {
            _create_default_svg(
                game_metadata,
                token_metadata,
                score,
                player_name,
                settings_details,
                objective_details,
                context_details,
                client_url,
            )
        }
    }
}
