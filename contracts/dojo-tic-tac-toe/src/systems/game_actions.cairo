use starknet::ContractAddress;

#[starknet::interface]
pub trait IGameActions<T> {
    /// Start a new game. Returns the game_id.
    fn new_game(ref self: T) -> u64;
    /// Player makes a move (position 0-8). AI responds automatically.
    fn make_move(ref self: T, game_id: u64, position: u8);
    /// Read the packed board state.
    fn get_board(self: @T, game_id: u64) -> u32;
    /// Read the game status (0=playing, 1=player_win, 2=ai_win, 3=draw).
    fn get_status(self: @T, game_id: u64) -> u8;
    /// Read a player's stats.
    fn get_player_stats(self: @T, player: ContractAddress) -> (u32, u32, u32, u32);
}

#[dojo::contract]
pub mod game_actions {
    use dojo::event::EventStorage;
    use dojo::model::ModelStorage;
    use dojo_tic_tac_toe::events::{GameEnded, GameStarted, MoveMade};
    use dojo_tic_tac_toe::models::{
        AI_O, Board, EMPTY, GameCounter, GameOwner, PLAYER_X, PlayerStats, STATUS_AI_WIN,
        STATUS_DRAW, STATUS_PLAYER_WIN, STATUS_PLAYING, ai_move, board_full, check_winner, get_cell,
        set_cell,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"tic_tac_toe")
        }
    }

    #[abi(embed_v0)]
    impl GameActionsImpl of super::IGameActions<ContractState> {
        fn new_game(ref self: ContractState) -> u64 {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Get and increment game counter
            let mut counter: GameCounter = world.read_model(0_u8);
            counter.count += 1;
            let game_id = counter.count;
            world.write_model(@counter);

            // Create empty board
            world.write_model(@Board { game_id, cells: 0, status: STATUS_PLAYING });

            // Track ownership
            world.write_model(@GameOwner { game_id, player });

            // Update player's current game
            let mut stats: PlayerStats = world.read_model(player);
            stats.current_game_id = game_id;
            world.write_model(@stats);

            // Emit event
            world.emit_event(@GameStarted { game_id, player });

            game_id
        }

        fn make_move(ref self: ContractState, game_id: u64, position: u8) {
            let mut world = self.world_default();
            let player = get_caller_address();

            // Validate ownership
            let owner: GameOwner = world.read_model(game_id);
            assert!(owner.player == player, "Not your game");

            // Validate position
            assert!(position < 9, "Position must be 0-8");

            // Read board
            let mut board: Board = world.read_model(game_id);
            assert!(board.status == STATUS_PLAYING, "Game is already over");
            assert!(get_cell(board.cells, position) == EMPTY, "Cell is already occupied");

            // Player move
            board.cells = set_cell(board.cells, position, PLAYER_X);
            let mut ai_pos: u8 = 255;

            // Check player win
            if check_winner(board.cells, PLAYER_X) {
                board.status = STATUS_PLAYER_WIN;
                let mut stats: PlayerStats = world.read_model(player);
                stats.games_played += 1;
                stats.games_won += 1;
                world.write_model(@stats);
                world.emit_event(@GameEnded { game_id, player, status: STATUS_PLAYER_WIN });
            } else if board_full(board.cells) {
                // Draw after player move
                board.status = STATUS_DRAW;
                let mut stats: PlayerStats = world.read_model(player);
                stats.games_played += 1;
                stats.games_drawn += 1;
                world.write_model(@stats);
                world.emit_event(@GameEnded { game_id, player, status: STATUS_DRAW });
            } else {
                // AI move
                ai_pos = ai_move(board.cells);
                board.cells = set_cell(board.cells, ai_pos, AI_O);

                if check_winner(board.cells, AI_O) {
                    board.status = STATUS_AI_WIN;
                    let mut stats: PlayerStats = world.read_model(player);
                    stats.games_played += 1;
                    stats.games_lost += 1;
                    world.write_model(@stats);
                    world.emit_event(@GameEnded { game_id, player, status: STATUS_AI_WIN });
                } else if board_full(board.cells) {
                    board.status = STATUS_DRAW;
                    let mut stats: PlayerStats = world.read_model(player);
                    stats.games_played += 1;
                    stats.games_drawn += 1;
                    world.write_model(@stats);
                    world.emit_event(@GameEnded { game_id, player, status: STATUS_DRAW });
                }
            }

            // Write updated board
            world.write_model(@board);

            // Emit move event
            world
                .emit_event(
                    @MoveMade {
                        game_id,
                        player_position: position,
                        ai_position: ai_pos,
                        status: board.status,
                    },
                );
        }

        fn get_board(self: @ContractState, game_id: u64) -> u32 {
            let world = self.world_default();
            let board: Board = world.read_model(game_id);
            board.cells
        }

        fn get_status(self: @ContractState, game_id: u64) -> u8 {
            let world = self.world_default();
            let board: Board = world.read_model(game_id);
            board.status
        }

        fn get_player_stats(self: @ContractState, player: ContractAddress) -> (u32, u32, u32, u32) {
            let world = self.world_default();
            let stats: PlayerStats = world.read_model(player);
            (stats.games_played, stats.games_won, stats.games_drawn, stats.games_lost)
        }
    }
}
