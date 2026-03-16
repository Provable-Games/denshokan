#[starknet::interface]
pub trait IGameActions<T> {
    /// Start a new game for a token. Resets the board.
    fn new_game(ref self: T, token_id: felt252);
    /// Player makes a move (position 0-8). AI responds automatically.
    fn make_move(ref self: T, token_id: felt252, position: u8);
    /// Read the packed board state.
    fn board(self: @T, token_id: felt252) -> u32;
    /// Number of games completed for a token.
    fn games_played(self: @T, token_id: felt252) -> u32;
    /// Number of games won by the player.
    fn games_won(self: @T, token_id: felt252) -> u32;
    /// Number of games drawn.
    fn games_drawn(self: @T, token_id: felt252) -> u32;
}

#[dojo::contract]
pub mod game_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use dojo_tic_tac_toe::events::{GameEnded, GameStarted, MoveMade};
    use dojo_tic_tac_toe::models::{
        AI_O, Board, EMPTY, GameCounter, GameOwner, PLAYER_X, PlayerStats, STATUS_AI_WIN,
        STATUS_DRAW, STATUS_PLAYER_WIN, STATUS_PLAYING, TokenGameState, ai_move, board_full,
        check_winner, get_cell, set_cell,
    };
    // Library functions from game_components (multi-contract pattern)
    use game_components_embeddable_game_standard::minigame::minigame::{
        assert_token_ownership, post_action, pre_action,
    };
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address};

    // ======================================================================
    // STORAGE
    // ======================================================================

    #[storage]
    struct Storage {
        /// Address of the minigame token contract (Denshokan).
        /// Set during dojo_init via init_call_args.
        denshokan_address: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {}

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"tic_tac_toe")
        }
    }

    // ======================================================================
    // dojo_init -- called once by sozo migrate
    // ======================================================================

    fn dojo_init(ref self: ContractState, denshokan_address: ContractAddress) {
        self.denshokan_address.write(denshokan_address);
    }

    // ======================================================================
    // IGameActions -- Game logic with library function hooks
    // ======================================================================

    #[abi(embed_v0)]
    impl GameActionsImpl of super::IGameActions<ContractState> {
        fn new_game(ref self: ContractState, token_id: felt252) {
            let denshokan_address = self.denshokan_address.read();

            assert_token_ownership(denshokan_address, token_id);
            pre_action(denshokan_address, token_id);

            // Update TokenGameState Dojo model (shared with game_setup)
            let mut world = self.world_default();
            let mut state: TokenGameState = world.read_model(token_id);
            state.board = 0;
            state.status = STATUS_PLAYING;
            world.write_model(@state);

            // Also update Dojo models for ECS indexing
            let mut counter: GameCounter = world.read_model(0_u8);
            counter.count += 1;
            let game_id = counter.count;
            world.write_model(@counter);
            world.write_model(@Board { game_id, cells: 0, status: STATUS_PLAYING });
            let player = get_caller_address();
            world.write_model(@GameOwner { game_id, player });
            let mut stats: PlayerStats = world.read_model(player);
            stats.current_game_id = game_id;
            world.write_model(@stats);
            world.emit_event(@GameStarted { game_id, player });

            post_action(denshokan_address, token_id);
        }

        fn make_move(ref self: ContractState, token_id: felt252, position: u8) {
            let denshokan_address = self.denshokan_address.read();

            assert_token_ownership(denshokan_address, token_id);
            pre_action(denshokan_address, token_id);

            assert!(position < 9, "Position must be 0-8");

            let mut world = self.world_default();
            let mut state: TokenGameState = world.read_model(token_id);
            assert!(state.status == STATUS_PLAYING, "Game is already over");

            let mut board = state.board;
            assert!(get_cell(board, position) == EMPTY, "Cell is already occupied");

            // Player move
            board = set_cell(board, position, PLAYER_X);

            let player = get_caller_address();

            // Read current Dojo stats for syncing
            let mut dojo_stats: PlayerStats = world.read_model(player);
            let dojo_game_id = dojo_stats.current_game_id;

            // Check player win
            if check_winner(board, PLAYER_X) {
                state.board = board;
                state.status = STATUS_PLAYER_WIN;
                state.games_played += 1;
                state.games_won += 1;
                state.score += 1;
                world.write_model(@state);

                world
                    .write_model(
                        @Board { game_id: dojo_game_id, cells: board, status: STATUS_PLAYER_WIN },
                    );
                dojo_stats.games_played += 1;
                dojo_stats.games_won += 1;
                world.write_model(@dojo_stats);
                world
                    .emit_event(
                        @GameEnded { game_id: dojo_game_id, player, status: STATUS_PLAYER_WIN },
                    );
            } else if board_full(board) {
                // Draw after player move
                state.board = board;
                state.status = STATUS_DRAW;
                state.games_played += 1;
                state.games_drawn += 1;
                world.write_model(@state);

                world
                    .write_model(
                        @Board { game_id: dojo_game_id, cells: board, status: STATUS_DRAW },
                    );
                dojo_stats.games_played += 1;
                dojo_stats.games_drawn += 1;
                world.write_model(@dojo_stats);
                world.emit_event(@GameEnded { game_id: dojo_game_id, player, status: STATUS_DRAW });
            } else {
                // AI move
                let ai_pos = ai_move(board);
                board = set_cell(board, ai_pos, AI_O);

                // Check AI win
                if check_winner(board, AI_O) {
                    state.board = board;
                    state.status = STATUS_AI_WIN;
                    state.games_played += 1;
                    world.write_model(@state);

                    world
                        .write_model(
                            @Board { game_id: dojo_game_id, cells: board, status: STATUS_AI_WIN },
                        );
                    dojo_stats.games_played += 1;
                    dojo_stats.games_lost += 1;
                    world.write_model(@dojo_stats);
                    world
                        .emit_event(
                            @GameEnded { game_id: dojo_game_id, player, status: STATUS_AI_WIN },
                        );
                } else if board_full(board) {
                    // Draw after AI move
                    state.board = board;
                    state.status = STATUS_DRAW;
                    state.games_played += 1;
                    state.games_drawn += 1;
                    world.write_model(@state);

                    world
                        .write_model(
                            @Board { game_id: dojo_game_id, cells: board, status: STATUS_DRAW },
                        );
                    dojo_stats.games_played += 1;
                    dojo_stats.games_drawn += 1;
                    world.write_model(@dojo_stats);
                    world
                        .emit_event(
                            @GameEnded { game_id: dojo_game_id, player, status: STATUS_DRAW },
                        );
                } else {
                    // Game continues
                    state.board = board;
                    world.write_model(@state);
                    world
                        .write_model(
                            @Board { game_id: dojo_game_id, cells: board, status: STATUS_PLAYING },
                        );
                }

                world
                    .emit_event(
                        @MoveMade {
                            game_id: dojo_game_id,
                            player_position: position,
                            ai_position: ai_pos,
                            status: state.status,
                        },
                    );
            }

            post_action(denshokan_address, token_id);
        }

        fn board(self: @ContractState, token_id: felt252) -> u32 {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            state.board
        }

        fn games_played(self: @ContractState, token_id: felt252) -> u32 {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            state.games_played
        }

        fn games_won(self: @ContractState, token_id: felt252) -> u32 {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            state.games_won
        }

        fn games_drawn(self: @ContractState, token_id: felt252) -> u32 {
            let world = self.world_default();
            let state: TokenGameState = world.read_model(token_id);
            state.games_drawn
        }
    }
}
