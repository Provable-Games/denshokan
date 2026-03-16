#[dojo::contract]
pub mod game_setup {
    use dojo::model::ModelStorage;
    use dojo::world::{WorldStorage, WorldStorageTrait};
    use dojo_tic_tac_toe::models::{
        STATUS_AI_WIN, STATUS_PLAYER_WIN, STATUS_PLAYING, TokenGameState,
    };
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameDetails, IMinigameTokenData,
    };
    use game_components_embeddable_game_standard::minigame::minigame_component::MinigameComponent;
    use game_components_embeddable_game_standard::minigame::structs::GameDetail;
    use game_components_utilities::utils::encoding::u128_to_ascii_felt;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::ContractAddress;

    // ======================================================================
    // COMPONENTS
    // ======================================================================

    component!(path: MinigameComponent, storage: minigame, event: MinigameEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl MinigameImpl = MinigameComponent::MinigameImpl<ContractState>;
    impl MinigameInternalImpl = MinigameComponent::InternalImpl<ContractState>;

    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;

    // ======================================================================
    // STORAGE
    // ======================================================================

    #[storage]
    struct Storage {
        #[substorage(v0)]
        minigame: MinigameComponent::Storage,
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
        MinigameEvent: MinigameComponent::Event,
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
    // Resolves game_settings and game_objectives addresses via world DNS.
    // ======================================================================

    fn dojo_init(
        ref self: ContractState,
        creator_address: ContractAddress,
        denshokan_address: ContractAddress,
    ) {
        let world: WorldStorage = self.world(@"tic_tac_toe");
        let (game_settings_address, _) = world.dns(@"game_settings").unwrap();
        let (game_objectives_address, _) = world.dns(@"game_objectives").unwrap();

        self
            .minigame
            .initializer(
                creator_address,
                "Tic Tac Toe",
                "On-chain Tic Tac Toe with AI opponent",
                "Provable Games",
                "Provable Games",
                "Puzzle",
                "",
                Option::None, // color
                Option::None, // client_url
                Option::None, // renderer_address
                Option::Some(game_settings_address), // settings_address
                Option::Some(game_objectives_address), // objectives_address
                denshokan_address,
                Option::None, // royalty_fraction
                Option::None, // skills_address
                1 // version
            );
    }

    // ======================================================================
    // IMinigameTokenData -- reads from TokenGameState Dojo model
    // ======================================================================

    #[abi(embed_v0)]
    impl TokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            state.score
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            state.status != STATUS_PLAYING
        }

        fn score_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<u64> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.score(*token_ids.at(i)));
                i += 1;
            }
            results
        }

        fn game_over_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<bool> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.game_over(*token_ids.at(i)));
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // IMinigameDetails -- reads from TokenGameState Dojo model
    // ======================================================================

    #[abi(embed_v0)]
    impl DetailsImpl of IMinigameDetails<ContractState> {
        fn token_name(self: @ContractState, token_id: felt252) -> ByteArray {
            "Tic Tac Toe"
        }

        fn token_description(self: @ContractState, token_id: felt252) -> ByteArray {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            let won = state.games_won;
            let played = state.games_played;
            let drawn = state.games_drawn;
            let lost = played - won - drawn;
            format!(
                "Tic Tac Toe on-chain. Record: {} wins, {} losses, {} draws out of {} games.",
                won,
                lost,
                drawn,
                played,
            )
        }

        fn game_details(self: @ContractState, token_id: felt252) -> Span<GameDetail> {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            let won = state.games_won;
            let played = state.games_played;
            let drawn = state.games_drawn;
            let lost = played - won - drawn;
            let board_val = state.board;
            let status_val = state.status;

            let status_felt: felt252 = if status_val == STATUS_PLAYING {
                'Playing'
            } else if status_val == STATUS_PLAYER_WIN {
                'Player Won'
            } else if status_val == STATUS_AI_WIN {
                'AI Won'
            } else {
                'Draw'
            };

            array![
                GameDetail { name: 'Wins', value: u128_to_ascii_felt(won.into()) },
                GameDetail { name: 'Losses', value: u128_to_ascii_felt(lost.into()) },
                GameDetail { name: 'Draws', value: u128_to_ascii_felt(drawn.into()) },
                GameDetail { name: 'Games Played', value: u128_to_ascii_felt(played.into()) },
                GameDetail { name: 'Board', value: u128_to_ascii_felt(board_val.into()) },
                GameDetail { name: 'Status', value: status_felt },
            ]
                .span()
        }

        fn token_name_batch(self: @ContractState, token_ids: Span<felt252>) -> Array<ByteArray> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.token_name(*token_ids.at(i)));
                i += 1;
            }
            results
        }

        fn token_description_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<ByteArray> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.token_description(*token_ids.at(i)));
                i += 1;
            }
            results
        }

        fn game_details_batch(
            self: @ContractState, token_ids: Span<felt252>,
        ) -> Array<Span<GameDetail>> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= token_ids.len() {
                    break;
                }
                results.append(self.game_details(*token_ids.at(i)));
                i += 1;
            }
            results
        }
    }
}
