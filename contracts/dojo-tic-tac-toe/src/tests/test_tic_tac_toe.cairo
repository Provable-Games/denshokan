use dojo::model::ModelStorage;
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    ContractDefTrait, NamespaceDef, TestResource, WorldStorageTestTrait, spawn_test_world,
};
use dojo_tic_tac_toe::events;
use dojo_tic_tac_toe::models::{
    AI_O, Board, GameCounter, GameOwner, PLAYER_X, PlayerStats, STATUS_AI_WIN, STATUS_PLAYING,
    board_full, check_winner, get_cell, m_Board, m_GameCounter, m_GameOwner, m_PlayerStats,
    set_cell,
};
use dojo_tic_tac_toe::systems::game_actions::{
    IGameActionsDispatcher, IGameActionsDispatcherTrait, game_actions,
};
use starknet::{ContractAddress, testing};

// ==========================================================================
// TEST SETUP
// ==========================================================================

fn PLAYER1() -> ContractAddress {
    0x111.try_into().unwrap()
}

fn PLAYER2() -> ContractAddress {
    0x222.try_into().unwrap()
}

fn namespace_def() -> NamespaceDef {
    NamespaceDef {
        namespace: "tic_tac_toe",
        resources: [
            TestResource::Model(m_Board::TEST_CLASS_HASH),
            TestResource::Model(m_PlayerStats::TEST_CLASS_HASH),
            TestResource::Model(m_GameOwner::TEST_CLASS_HASH),
            TestResource::Model(m_GameCounter::TEST_CLASS_HASH),
            TestResource::Event(events::e_GameStarted::TEST_CLASS_HASH),
            TestResource::Event(events::e_MoveMade::TEST_CLASS_HASH),
            TestResource::Event(events::e_GameEnded::TEST_CLASS_HASH),
            TestResource::Contract(game_actions::TEST_CLASS_HASH),
        ]
            .span(),
    }
}

fn contract_defs() -> Span<dojo_cairo_test::ContractDef> {
    [
        ContractDefTrait::new(@"tic_tac_toe", @"game_actions")
            .with_writer_of([dojo::utils::bytearray_hash(@"tic_tac_toe")].span()),
    ]
        .span()
}

fn setup() -> (dojo::world::WorldStorage, IGameActionsDispatcher) {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH.try_into().unwrap(), [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (contract_address, _) = world.dns(@"game_actions").unwrap();
    let actions = IGameActionsDispatcher { contract_address };

    (world, actions)
}

// ==========================================================================
// TESTS
// ==========================================================================

#[test]
fn test_new_game() {
    let (mut world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();
    assert!(game_id == 1, "First game should have id 1");

    let board: Board = world.read_model(game_id);
    assert!(board.cells == 0, "Board should be empty");
    assert!(board.status == STATUS_PLAYING, "Status should be playing");

    let owner: GameOwner = world.read_model(game_id);
    assert!(owner.player == PLAYER1(), "Owner should be player1");

    let counter: GameCounter = world.read_model(0_u8);
    assert!(counter.count == 1, "Counter should be 1");
}

#[test]
fn test_multiple_games_increment_counter() {
    let (mut world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let id1 = actions.new_game();
    let id2 = actions.new_game();
    let id3 = actions.new_game();

    assert!(id1 == 1, "First game id");
    assert!(id2 == 2, "Second game id");
    assert!(id3 == 3, "Third game id");

    let counter: GameCounter = world.read_model(0_u8);
    assert!(counter.count == 3, "Counter should be 3");
}

#[test]
fn test_make_move() {
    let (mut world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();

    actions.make_move(game_id, 0);

    let board: Board = world.read_model(game_id);
    assert!(board.cells != 0, "Board should not be empty after move");
}

#[test]
fn test_game_ends() {
    let (mut world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();

    // Move 1: Player=0, AI takes center (4)
    actions.make_move(game_id, 0);
    // Move 2: Player=2, AI blocks at 1 (player had 0,2 threatening top row)
    actions.make_move(game_id, 2);
    // Move 3: Player=3, AI has 1,4 -> wins at 7 (column 1,4,7)
    actions.make_move(game_id, 3);

    let board: Board = world.read_model(game_id);
    assert!(board.status == STATUS_AI_WIN, "AI should have won");

    let stats: PlayerStats = world.read_model(PLAYER1());
    assert!(stats.games_played == 1, "Should have 1 game played");
    assert!(stats.games_lost == 1, "Should have 1 loss");
}

#[test]
fn test_get_board_and_status() {
    let (_world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();

    assert!(actions.get_board(game_id) == 0, "Board should be empty");
    assert!(actions.get_status(game_id) == STATUS_PLAYING, "Should be playing");

    actions.make_move(game_id, 0);
    assert!(actions.get_board(game_id) != 0, "Board should have moves");
}

#[test]
fn test_get_player_stats() {
    let (_world, actions) = setup();

    testing::set_contract_address(PLAYER1());

    let (played, won, drawn, lost) = actions.get_player_stats(PLAYER1());
    assert!(played == 0, "No games played initially");
    assert!(won == 0, "No wins initially");
    assert!(drawn == 0, "No draws initially");
    assert!(lost == 0, "No losses initially");
}

#[test]
fn test_two_players_independent() {
    let (mut world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id_1 = actions.new_game();

    testing::set_contract_address(PLAYER2());
    let game_id_2 = actions.new_game();

    assert!(game_id_1 != game_id_2, "Games should have different IDs");

    let owner1: GameOwner = world.read_model(game_id_1);
    let owner2: GameOwner = world.read_model(game_id_2);
    assert!(owner1.player == PLAYER1(), "Game 1 owned by player 1");
    assert!(owner2.player == PLAYER2(), "Game 2 owned by player 2");
}

#[test]
#[should_panic(expected: ("Not your game", 'ENTRYPOINT_FAILED'))]
fn test_cannot_move_on_others_game() {
    let (_world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();

    testing::set_contract_address(PLAYER2());
    actions.make_move(game_id, 0);
}

#[test]
#[should_panic(expected: ("Position must be 0-8", 'ENTRYPOINT_FAILED'))]
fn test_invalid_position() {
    let (_world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();

    actions.make_move(game_id, 9);
}

#[test]
#[should_panic(expected: ("Cell is already occupied", 'ENTRYPOINT_FAILED'))]
fn test_occupied_cell() {
    let (_world, actions) = setup();

    testing::set_contract_address(PLAYER1());
    let game_id = actions.new_game();

    actions.make_move(game_id, 0);
    actions.make_move(game_id, 0);
}

#[test]
fn test_board_logic_get_set_cell() {
    let board: u32 = 0;
    assert!(get_cell(board, 0) == 0, "Empty cell");

    let board = set_cell(board, 0, PLAYER_X);
    assert!(get_cell(board, 0) == PLAYER_X, "Player at 0");

    let board = set_cell(board, 4, AI_O);
    assert!(get_cell(board, 4) == AI_O, "AI at 4");
    assert!(get_cell(board, 0) == PLAYER_X, "Player still at 0");
}

#[test]
fn test_check_winner_rows() {
    let mut board: u32 = 0;
    board = set_cell(board, 0, PLAYER_X);
    board = set_cell(board, 1, PLAYER_X);
    board = set_cell(board, 2, PLAYER_X);
    assert!(check_winner(board, PLAYER_X), "Player should win row 0");
}

#[test]
fn test_check_winner_diagonal() {
    let mut board: u32 = 0;
    board = set_cell(board, 0, AI_O);
    board = set_cell(board, 4, AI_O);
    board = set_cell(board, 8, AI_O);
    assert!(check_winner(board, AI_O), "AI should win diagonal");
}

#[test]
fn test_board_full() {
    // Fill all 9 cells
    let mut board: u32 = 0;
    board = set_cell(board, 0, PLAYER_X);
    board = set_cell(board, 1, AI_O);
    board = set_cell(board, 2, PLAYER_X);
    board = set_cell(board, 3, AI_O);
    board = set_cell(board, 4, PLAYER_X);
    board = set_cell(board, 5, AI_O);
    board = set_cell(board, 6, AI_O);
    board = set_cell(board, 7, PLAYER_X);
    board = set_cell(board, 8, AI_O);
    assert!(board_full(board), "Board should be full");

    // Empty board
    assert!(!board_full(0), "Empty board should not be full");
}
