#[dojo::contract]
pub mod game_objectives {
    use dojo::model::ModelStorage;
    use dojo_tic_tac_toe::models::{GameConfig, ObjectiveModel, TokenGameState};
    use game_components_embeddable_game_standard::minigame::extensions::objectives::interface::{
        IMinigameObjectives, IMinigameObjectivesDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::objectives::objectives::ObjectivesComponent;
    use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::{
        GameObjective, GameObjectiveDetails,
    };
    use game_components_utilities::utils::encoding::u128_to_ascii_felt;
    use openzeppelin_introspection::src5::SRC5Component;

    // ======================================================================
    // COMPONENTS
    // ======================================================================

    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    impl ObjectivesInternalImpl = ObjectivesComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    // ======================================================================
    // STORAGE
    // ======================================================================

    #[storage]
    struct Storage {
        #[substorage(v0)]
        objectives: ObjectivesComponent::Storage,
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
        ObjectivesEvent: ObjectivesComponent::Event,
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

    fn dojo_init(ref self: ContractState, denshokan_address: starknet::ContractAddress) {
        self.objectives.initializer();

        // Write default objective model
        let mut w = self.world_default();
        w.write_model(@ObjectiveModel { objective_id: 1, target_wins: 3, exists: true });

        // Update objectives count
        let mut config: GameConfig = w.read_model(0_u8);
        config.objectives_count = 1;
        w.write_model(@config);

        self
            .objectives
            .create_objective(
                1,
                GameObjectiveDetails {
                    name: "Win 3 Games",
                    description: "Win 3 games against the AI",
                    objectives: array![GameObjective { name: 'target_wins', value: '3' }].span(),
                },
                denshokan_address,
            );
    }

    // ======================================================================
    // IMinigameObjectives
    // ======================================================================

    #[abi(embed_v0)]
    impl GameObjectivesImpl of IMinigameObjectives<ContractState> {
        fn objective_exists(self: @ContractState, objective_id: u32) -> bool {
            let world = self.world_default();
            let data: ObjectiveModel = world.read_model(objective_id);
            data.exists
        }

        fn completed_objective(self: @ContractState, token_id: felt252, objective_id: u32) -> bool {
            let world = self.world_default();
            let objective: ObjectiveModel = world.read_model(objective_id);
            let state: TokenGameState = world.read_model(token_id);
            state.games_won >= objective.target_wins
        }

        fn objective_exists_batch(self: @ContractState, objective_ids: Span<u32>) -> Array<bool> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= objective_ids.len() {
                    break;
                }
                results.append(self.objective_exists(*objective_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameObjectivesDetails
    // ======================================================================

    #[abi(embed_v0)]
    impl GameObjectivesDetailsImpl of IMinigameObjectivesDetails<ContractState> {
        fn objectives_count(self: @ContractState) -> u32 {
            let world = self.world_default();
            let config: GameConfig = world.read_model(0_u8);
            config.objectives_count
        }

        fn objectives_details(self: @ContractState, objective_id: u32) -> GameObjectiveDetails {
            let world = self.world_default();
            let data: ObjectiveModel = world.read_model(objective_id);
            assert!(data.exists, "Objective does not exist");
            let target_wins = data.target_wins;

            let name: ByteArray = format!("Win {} games", target_wins);
            let description: ByteArray = format!("Win {} games of Tic Tac Toe", target_wins);

            GameObjectiveDetails {
                name,
                description,
                objectives: array![
                    GameObjective {
                        name: 'target_wins', value: u128_to_ascii_felt(target_wins.into()),
                    },
                ]
                    .span(),
            }
        }

        fn objectives_details_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<GameObjectiveDetails> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= objective_ids.len() {
                    break;
                }
                results.append(self.objectives_details(*objective_ids.at(i)));
                i += 1;
            }
            results
        }
    }
}
