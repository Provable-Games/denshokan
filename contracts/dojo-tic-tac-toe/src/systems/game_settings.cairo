#[dojo::contract]
pub mod game_settings {
    use dojo::model::ModelStorage;
    use dojo::world::{WorldStorage, WorldStorageTrait};
    use dojo_tic_tac_toe::models::{GameConfig, SettingsModel};
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMinigameSettings, IMinigameSettingsDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::settings::SettingsComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::{
        GameSetting, GameSettingDetails,
    };
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::ContractAddress;

    // ======================================================================
    // COMPONENTS
    // ======================================================================

    component!(path: SettingsComponent, storage: settings, event: SettingsEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    impl SettingsInternalImpl = SettingsComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    // ======================================================================
    // STORAGE
    // ======================================================================

    #[storage]
    struct Storage {
        #[substorage(v0)]
        settings: SettingsComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
    }

    // ======================================================================
    // EVENTS
    // ======================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        SettingsEvent: SettingsComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"tic_tac_toe")
        }
    }

    // ======================================================================
    // dojo_init -- called once by sozo migrate
    // Resolves game_setup via DNS to get the token address.
    // ======================================================================

    fn dojo_init(ref self: ContractState, denshokan_address: ContractAddress) {
        let world: WorldStorage = self.world(@"tic_tac_toe");
        self.settings.initializer();

        // Write default settings model
        let mut w = self.world_default();
        w
            .write_model(
                @SettingsModel {
                    settings_id: 1,
                    name: "Standard",
                    description: "Standard AI opponent",
                    exists: true,
                },
            );

        // Update settings count
        let mut config: GameConfig = w.read_model(0_u8);
        config.settings_count = 1;
        w.write_model(@config);

        // Resolve game_setup address via DNS
        let (game_setup_address, _) = world.dns(@"game_setup").unwrap();

        self
            .settings
            .create_settings(
                game_setup_address,
                1,
                GameSettingDetails {
                    name: "Standard",
                    description: "Standard AI opponent",
                    settings: array![GameSetting { name: 'AI', value: 'Standard' }].span(),
                },
                denshokan_address,
            );
    }

    // ======================================================================
    // IMinigameSettings
    // ======================================================================

    #[abi(embed_v0)]
    impl GameSettingsImpl of IMinigameSettings<ContractState> {
        fn settings_exist(self: @ContractState, settings_id: u32) -> bool {
            let world = self.world_default();
            let data: SettingsModel = world.read_model(settings_id);
            data.exists
        }

        fn settings_exist_batch(self: @ContractState, settings_ids: Span<u32>) -> Array<bool> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= settings_ids.len() {
                    break;
                }
                results.append(self.settings_exist(*settings_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameSettingsDetails
    // ======================================================================

    #[abi(embed_v0)]
    impl GameSettingsDetailsImpl of IMinigameSettingsDetails<ContractState> {
        fn settings_count(self: @ContractState) -> u32 {
            let world = self.world_default();
            let config: GameConfig = world.read_model(0_u8);
            config.settings_count
        }

        fn settings_details(self: @ContractState, settings_id: u32) -> GameSettingDetails {
            let world = self.world_default();
            let data: SettingsModel = world.read_model(settings_id);
            GameSettingDetails {
                name: data.name,
                description: data.description,
                settings: array![GameSetting { name: 'AI', value: 'Standard' }].span(),
            }
        }

        fn settings_details_batch(
            self: @ContractState, settings_ids: Span<u32>,
        ) -> Array<GameSettingDetails> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= settings_ids.len() {
                    break;
                }
                results.append(self.settings_details(*settings_ids.at(i)));
                i += 1;
            }
            results
        }
    }
}
