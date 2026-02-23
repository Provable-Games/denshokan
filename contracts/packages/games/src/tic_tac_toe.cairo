use starknet::ContractAddress;

// ==========================================================================
// TIC TAC TOE GAME INTERFACE
// ==========================================================================

#[starknet::interface]
pub trait ITicTacToe<TContractState> {
    /// Start a new game for a minted token. Resets the board.
    fn new_game(ref self: TContractState, token_id: felt252);
    /// Player makes a move (position 0-8). AI responds automatically.
    fn make_move(ref self: TContractState, token_id: felt252, position: u8);
    /// Read the packed board state (18 bits: 2 bits per cell, cells 0-8).
    fn board(self: @TContractState, token_id: felt252) -> u32;
    /// Number of games completed for a token.
    fn games_played(self: @TContractState, token_id: felt252) -> u32;
    /// Number of games won by the player.
    fn games_won(self: @TContractState, token_id: felt252) -> u32;
    /// Number of games drawn.
    fn games_drawn(self: @TContractState, token_id: felt252) -> u32;
}

#[starknet::interface]
pub trait ITicTacToeInit<TContractState> {
    fn initializer(
        ref self: TContractState,
        game_creator: ContractAddress,
        game_name: ByteArray,
        game_description: ByteArray,
        game_developer: ByteArray,
        game_publisher: ByteArray,
        game_genre: ByteArray,
        game_image: ByteArray,
        game_color: Option<ByteArray>,
        client_url: Option<ByteArray>,
        renderer_address: Option<ContractAddress>,
        settings_address: Option<ContractAddress>,
        objectives_address: Option<ContractAddress>,
        minigame_token_address: ContractAddress,
        royalty_fraction: Option<u128>,
    );
}

// ==========================================================================
// BOARD ENCODING
// ==========================================================================
// Board is packed into a u32 using 2 bits per cell (18 bits total for 9 cells).
//   00 = Empty
//   01 = X (player)
//   10 = O (AI)
//
// Cell index layout:
//   0 | 1 | 2
//   ---------
//   3 | 4 | 5
//   ---------
//   6 | 7 | 8

const EMPTY: u32 = 0;
const PLAYER_X: u32 = 1;
const AI_O: u32 = 2;

// Game status stored separately
const STATUS_PLAYING: u8 = 0;
const STATUS_PLAYER_WIN: u8 = 1;
const STATUS_AI_WIN: u8 = 2;
const STATUS_DRAW: u8 = 3;

// ==========================================================================
// PURE BOARD LOGIC
// ==========================================================================

fn get_cell(board: u32, pos: u8) -> u32 {
    (board / pow2(pos * 2)) % 4
}

fn set_cell(board: u32, pos: u8, value: u32) -> u32 {
    let shift = pow2(pos * 2);
    let current = get_cell(board, pos);
    board - (current * shift) + (value * shift)
}

fn pow2(n: u8) -> u32 {
    if n == 0 {
        1
    } else if n == 2 {
        4
    } else if n == 4 {
        16
    } else if n == 6 {
        64
    } else if n == 8 {
        256
    } else if n == 10 {
        1024
    } else if n == 12 {
        4096
    } else if n == 14 {
        16384
    } else if n == 16 {
        65536
    } else {
        let half = pow2(n / 2);
        if n % 2 == 0 {
            half * half
        } else {
            half * half * 2
        }
    }
}

/// Check if a given player has won.
fn check_winner(board: u32, player: u32) -> bool {
    // Winning lines: rows, columns, diagonals
    // Row 0: 0,1,2  Row 1: 3,4,5  Row 2: 6,7,8
    // Col 0: 0,3,6  Col 1: 1,4,7  Col 2: 2,5,8
    // Diag:  0,4,8  Anti:  2,4,6
    check_line(board, player, 0, 1, 2)
        || check_line(board, player, 3, 4, 5)
        || check_line(board, player, 6, 7, 8)
        || check_line(board, player, 0, 3, 6)
        || check_line(board, player, 1, 4, 7)
        || check_line(board, player, 2, 5, 8)
        || check_line(board, player, 0, 4, 8)
        || check_line(board, player, 2, 4, 6)
}

fn check_line(board: u32, player: u32, a: u8, b: u8, c: u8) -> bool {
    get_cell(board, a) == player && get_cell(board, b) == player && get_cell(board, c) == player
}

/// Check if the board is full (no empty cells).
fn board_full(board: u32) -> bool {
    let mut i: u8 = 0;
    let mut full = true;
    loop {
        if i >= 9 {
            break;
        }
        if get_cell(board, i) == EMPTY {
            full = false;
            break;
        }
        i += 1;
    }
    full
}

/// Count empty cells on the board.
fn count_empty(board: u32) -> u8 {
    let mut count: u8 = 0;
    let mut i: u8 = 0;
    loop {
        if i >= 9 {
            break;
        }
        if get_cell(board, i) == EMPTY {
            count += 1;
        }
        i += 1;
    }
    count
}

/// Simple AI: try to win, then block, then take center, then corners, then edges.
fn ai_move(board: u32) -> u8 {
    // 1. Try to win
    let win_pos = find_winning_move(board, AI_O);
    if win_pos != 255 {
        return win_pos;
    }

    // 2. Block player from winning
    let block_pos = find_winning_move(board, PLAYER_X);
    if block_pos != 255 {
        return block_pos;
    }

    // 3. Take center
    if get_cell(board, 4) == EMPTY {
        return 4;
    }

    // 4. Take a corner
    if get_cell(board, 0) == EMPTY {
        return 0;
    }
    if get_cell(board, 2) == EMPTY {
        return 2;
    }
    if get_cell(board, 6) == EMPTY {
        return 6;
    }
    if get_cell(board, 8) == EMPTY {
        return 8;
    }

    // 5. Take any edge
    if get_cell(board, 1) == EMPTY {
        return 1;
    }
    if get_cell(board, 3) == EMPTY {
        return 3;
    }
    if get_cell(board, 5) == EMPTY {
        return 5;
    }
    7 // position 7 must be empty at this point
}

/// Find a move that would complete a line for the given player. Returns 255 if none found.
fn find_winning_move(board: u32, player: u32) -> u8 {
    let mut pos: u8 = 0;
    loop {
        if pos >= 9 {
            break 255_u8;
        }
        if get_cell(board, pos) == EMPTY {
            let test_board = set_cell(board, pos, player);
            if check_winner(test_board, player) {
                break pos;
            }
        }
        pos += 1;
    }
}

// ==========================================================================
// CONTRACT
// ==========================================================================

#[starknet::contract]
pub mod TicTacToe {
    use game_components_embeddable_game_standard::minigame::extensions::objectives::interface::{
        IMinigameObjectives, IMinigameObjectivesDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::objectives::objectives::ObjectivesComponent;
    use game_components_embeddable_game_standard::minigame::extensions::objectives::structs::{
        GameObjective, GameObjectiveDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::interface::{
        IMinigameSettings, IMinigameSettingsDetails,
    };
    use game_components_embeddable_game_standard::minigame::extensions::settings::settings::SettingsComponent;
    use game_components_embeddable_game_standard::minigame::extensions::settings::structs::{
        GameSetting, GameSettingDetails,
    };
    use game_components_embeddable_game_standard::minigame::interface::{
        IMinigameDetails, IMinigameTokenData,
    };
    use game_components_embeddable_game_standard::minigame::minigame_component::MinigameComponent;
    use game_components_embeddable_game_standard::minigame::structs::GameDetail;
    use openzeppelin_introspection::src5::SRC5Component;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_contract_address};
    use super::{
        AI_O, EMPTY, PLAYER_X, STATUS_AI_WIN, STATUS_DRAW, STATUS_PLAYER_WIN, STATUS_PLAYING,
        ai_move, board_full, check_winner, get_cell, set_cell,
    };

    // ======================================================================
    // COMPONENTS
    // ======================================================================

    component!(path: MinigameComponent, storage: minigame, event: MinigameEvent);
    component!(path: ObjectivesComponent, storage: objectives, event: ObjectivesEvent);
    component!(path: SettingsComponent, storage: settings, event: SettingsEvent);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);

    #[abi(embed_v0)]
    impl MinigameImpl = MinigameComponent::MinigameImpl<ContractState>;
    impl MinigameInternalImpl = MinigameComponent::InternalImpl<ContractState>;
    impl ObjectivesInternalImpl = ObjectivesComponent::InternalImpl<ContractState>;
    impl SettingsInternalImpl = SettingsComponent::InternalImpl<ContractState>;

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
        objectives: ObjectivesComponent::Storage,
        #[substorage(v0)]
        settings: SettingsComponent::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        // Board state per token (packed u32)
        boards: Map<felt252, u32>,
        // Game status per token
        status: Map<felt252, u8>,
        // Stats
        games_played: Map<felt252, u32>,
        games_won: Map<felt252, u32>,
        games_drawn: Map<felt252, u32>,
        // Total score (cumulative wins)
        scores: Map<felt252, u64>,
        // Settings storage
        settings_count: u32,
        settings_data: Map<u32, (ByteArray, ByteArray, bool)>,
        // Objectives storage
        objective_count: u32,
        objective_data: Map<u32, (u32, bool)> // objective_id -> (target_wins, exists)
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
        ObjectivesEvent: ObjectivesComponent::Event,
        #[flat]
        SettingsEvent: SettingsComponent::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
    }

    // ======================================================================
    // IMinigameTokenData — score & game_over
    // ======================================================================

    #[abi(embed_v0)]
    impl TokenDataImpl of IMinigameTokenData<ContractState> {
        fn score(self: @ContractState, token_id: felt252) -> u64 {
            self.scores.entry(token_id).read()
        }

        fn game_over(self: @ContractState, token_id: felt252) -> bool {
            self.status.entry(token_id).read() != STATUS_PLAYING
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
    // IMinigameDetails — token name, description, game details
    // ======================================================================

    #[abi(embed_v0)]
    impl DetailsImpl of IMinigameDetails<ContractState> {
        fn token_name(self: @ContractState, token_id: felt252) -> ByteArray {
            "Tic Tac Toe"
        }

        fn token_description(self: @ContractState, token_id: felt252) -> ByteArray {
            let won = self.games_won.entry(token_id).read();
            let played = self.games_played.entry(token_id).read();
            let drawn = self.games_drawn.entry(token_id).read();
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
            let won = self.games_won.entry(token_id).read();
            let played = self.games_played.entry(token_id).read();
            let drawn = self.games_drawn.entry(token_id).read();
            let lost = played - won - drawn;
            let board_val = self.boards.entry(token_id).read();
            let status_val = self.status.entry(token_id).read();

            let status_str: ByteArray = if status_val == STATUS_PLAYING {
                "Playing"
            } else if status_val == STATUS_PLAYER_WIN {
                "Player Won"
            } else if status_val == STATUS_AI_WIN {
                "AI Won"
            } else {
                "Draw"
            };

            array![
                GameDetail { name: "Wins", value: format!("{}", won) },
                GameDetail { name: "Losses", value: format!("{}", lost) },
                GameDetail { name: "Draws", value: format!("{}", drawn) },
                GameDetail { name: "Games Played", value: format!("{}", played) },
                GameDetail { name: "Board", value: format!("{}", board_val) },
                GameDetail { name: "Status", value: status_str },
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

    // ======================================================================
    // IMinigameSettings
    // ======================================================================

    #[abi(embed_v0)]
    impl GameSettingsImpl of IMinigameSettings<ContractState> {
        fn settings_exist(self: @ContractState, settings_id: u32) -> bool {
            let (_, _, exists) = self.settings_data.entry(settings_id).read();
            exists
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
            self.settings_count.read()
        }

        fn settings_details(self: @ContractState, settings_id: u32) -> GameSettingDetails {
            let (name, description, _) = self.settings_data.entry(settings_id).read();
            GameSettingDetails {
                name,
                description,
                settings: array![GameSetting { name: "AI", value: "Standard" }].span(),
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

    // ======================================================================
    // IMinigameObjectives
    // ======================================================================

    #[abi(embed_v0)]
    impl GameObjectivesImpl of IMinigameObjectives<ContractState> {
        fn objective_exists(self: @ContractState, objective_id: u32) -> bool {
            let (_, exists) = self.objective_data.entry(objective_id).read();
            exists
        }

        fn completed_objective(self: @ContractState, token_id: felt252, objective_id: u32) -> bool {
            let (target_wins, _) = self.objective_data.entry(objective_id).read();
            let player_wins = self.games_won.entry(token_id).read();
            player_wins >= target_wins
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
            self.objective_count.read()
        }

        fn objectives_details(self: @ContractState, objective_id: u32) -> GameObjectiveDetails {
            let (target_wins, exists) = self.objective_data.entry(objective_id).read();
            assert!(exists, "Objective does not exist");

            // Build name and description from target_wins
            let name: ByteArray = format!("Win {} games", target_wins);
            let description: ByteArray = format!("Win {} games of Tic Tac Toe", target_wins);

            // Build objectives array with target info
            let mut objectives = array![];
            objectives
                .append(GameObjective { name: "target_wins", value: format!("{}", target_wins) });

            GameObjectiveDetails { name, description, objectives: objectives.span() }
        }

        fn objective_settings_id(self: @ContractState, objective_id: u32) -> u32 {
            0
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

        fn objective_settings_id_batch(
            self: @ContractState, objective_ids: Span<u32>,
        ) -> Array<u32> {
            let mut results = array![];
            let mut i = 0;
            loop {
                if i >= objective_ids.len() {
                    break;
                }
                results.append(0);
                i += 1;
            }
            results
        }
    }

    // ======================================================================
    // ITicTacToe — Game logic
    // ======================================================================

    #[abi(embed_v0)]
    impl TicTacToeImpl of super::ITicTacToe<ContractState> {
        fn new_game(ref self: ContractState, token_id: felt252) {
            self.boards.entry(token_id).write(0);
            self.status.entry(token_id).write(STATUS_PLAYING);
        }

        fn make_move(ref self: ContractState, token_id: felt252, position: u8) {
            assert!(position < 9, "Position must be 0-8");
            assert!(self.status.entry(token_id).read() == STATUS_PLAYING, "Game is already over");

            let mut board = self.boards.entry(token_id).read();
            assert!(get_cell(board, position) == EMPTY, "Cell is already occupied");

            // Player move
            board = set_cell(board, position, PLAYER_X);

            // Check player win
            if check_winner(board, PLAYER_X) {
                self.boards.entry(token_id).write(board);
                self.status.entry(token_id).write(STATUS_PLAYER_WIN);
                let played = self.games_played.entry(token_id).read();
                self.games_played.entry(token_id).write(played + 1);
                let won = self.games_won.entry(token_id).read();
                self.games_won.entry(token_id).write(won + 1);
                let score = self.scores.entry(token_id).read();
                self.scores.entry(token_id).write(score + 1);
                return;
            }

            // Check draw after player move
            if board_full(board) {
                self.boards.entry(token_id).write(board);
                self.status.entry(token_id).write(STATUS_DRAW);
                let played = self.games_played.entry(token_id).read();
                self.games_played.entry(token_id).write(played + 1);
                let drawn = self.games_drawn.entry(token_id).read();
                self.games_drawn.entry(token_id).write(drawn + 1);
                return;
            }

            // AI move
            let ai_pos = ai_move(board);
            board = set_cell(board, ai_pos, AI_O);

            // Check AI win
            if check_winner(board, AI_O) {
                self.boards.entry(token_id).write(board);
                self.status.entry(token_id).write(STATUS_AI_WIN);
                let played = self.games_played.entry(token_id).read();
                self.games_played.entry(token_id).write(played + 1);
                return;
            }

            // Check draw after AI move
            if board_full(board) {
                self.boards.entry(token_id).write(board);
                self.status.entry(token_id).write(STATUS_DRAW);
                let played = self.games_played.entry(token_id).read();
                self.games_played.entry(token_id).write(played + 1);
                let drawn = self.games_drawn.entry(token_id).read();
                self.games_drawn.entry(token_id).write(drawn + 1);
                return;
            }

            // Game continues
            self.boards.entry(token_id).write(board);
        }

        fn board(self: @ContractState, token_id: felt252) -> u32 {
            self.boards.entry(token_id).read()
        }

        fn games_played(self: @ContractState, token_id: felt252) -> u32 {
            self.games_played.entry(token_id).read()
        }

        fn games_won(self: @ContractState, token_id: felt252) -> u32 {
            self.games_won.entry(token_id).read()
        }

        fn games_drawn(self: @ContractState, token_id: felt252) -> u32 {
            self.games_drawn.entry(token_id).read()
        }
    }

    // ======================================================================
    // Initializer
    // ======================================================================

    #[abi(embed_v0)]
    impl TicTacToeInitImpl of super::ITicTacToeInit<ContractState> {
        fn initializer(
            ref self: ContractState,
            game_creator: ContractAddress,
            game_name: ByteArray,
            game_description: ByteArray,
            game_developer: ByteArray,
            game_publisher: ByteArray,
            game_genre: ByteArray,
            game_image: ByteArray,
            game_color: Option<ByteArray>,
            client_url: Option<ByteArray>,
            renderer_address: Option<ContractAddress>,
            settings_address: Option<ContractAddress>,
            objectives_address: Option<ContractAddress>,
            minigame_token_address: ContractAddress,
            royalty_fraction: Option<u128>,
        ) {
            let settings_address = match settings_address {
                Option::Some(address) => {
                    self.settings.initializer();
                    Option::Some(address)
                },
                Option::None => {
                    self.settings.initializer();
                    Option::Some(get_contract_address())
                },
            };
            let objectives_address = match objectives_address {
                Option::Some(address) => {
                    self.objectives.initializer();
                    Option::Some(address)
                },
                Option::None => {
                    self.objectives.initializer();
                    Option::Some(get_contract_address())
                },
            };

            self
                .minigame
                .initializer(
                    game_creator,
                    game_name,
                    game_description,
                    game_developer,
                    game_publisher,
                    game_genre,
                    game_image,
                    game_color,
                    client_url,
                    renderer_address,
                    settings_address,
                    objectives_address,
                    minigame_token_address,
                    royalty_fraction,
                );

            // Create a default settings entry
            self.settings_data.entry(1).write(("Standard", "Standard AI opponent", true));
            self.settings_count.write(1);

            // Create a default objective: win 3 games
            self.objective_data.entry(1).write((3, true));
            self.objective_count.write(1);
            self
                .objectives
                .create_objective(
                    1,
                    0,
                    GameObjectiveDetails {
                        name: "Win 3 Games",
                        description: "Win 3 games against the AI",
                        objectives: array![GameObjective { name: "target_wins", value: "3" }]
                            .span(),
                    },
                    minigame_token_address,
                );

            // Create default settings in the component
            self
                .settings
                .create_settings(
                    get_contract_address(),
                    1,
                    GameSettingDetails {
                        name: "Standard",
                        description: "Standard AI opponent",
                        settings: array![GameSetting { name: "AI", value: "Standard" }].span(),
                    },
                    minigame_token_address,
                );
        }
    }
}
