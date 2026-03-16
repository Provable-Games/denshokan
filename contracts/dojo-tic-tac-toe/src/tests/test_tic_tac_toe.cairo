use dojo_tic_tac_toe::models::{AI_O, PLAYER_X, board_full, check_winner, get_cell, set_cell};

// ==========================================================================
// Unit tests for pure board logic.
// Integration tests (with real Denshokan token) require game_components_test_common
// and should be run in an environment with sufficient memory.
// Deployment initialization order is configured in dojo_dev.toml / dojo_release.toml.
// ==========================================================================

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
fn test_check_winner_columns() {
    let mut board: u32 = 0;
    board = set_cell(board, 0, AI_O);
    board = set_cell(board, 3, AI_O);
    board = set_cell(board, 6, AI_O);
    assert!(check_winner(board, AI_O), "AI should win column 0");
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
fn test_check_winner_anti_diagonal() {
    let mut board: u32 = 0;
    board = set_cell(board, 2, PLAYER_X);
    board = set_cell(board, 4, PLAYER_X);
    board = set_cell(board, 6, PLAYER_X);
    assert!(check_winner(board, PLAYER_X), "Player should win anti-diagonal");
}

#[test]
fn test_no_winner() {
    let mut board: u32 = 0;
    board = set_cell(board, 0, PLAYER_X);
    board = set_cell(board, 1, AI_O);
    assert!(!check_winner(board, PLAYER_X), "No winner yet");
    assert!(!check_winner(board, AI_O), "No winner yet");
}

#[test]
fn test_board_full() {
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
    assert!(!board_full(0), "Empty board should not be full");
}

#[test]
fn test_board_not_full_with_one_empty() {
    let mut board: u32 = 0;
    board = set_cell(board, 0, PLAYER_X);
    board = set_cell(board, 1, AI_O);
    board = set_cell(board, 2, PLAYER_X);
    board = set_cell(board, 3, AI_O);
    board = set_cell(board, 4, PLAYER_X);
    board = set_cell(board, 5, AI_O);
    board = set_cell(board, 6, AI_O);
    board = set_cell(board, 7, PLAYER_X);
    // cell 8 empty
    assert!(!board_full(board), "Board should not be full with one empty cell");
}

#[test]
fn test_cell_overwrite() {
    let board: u32 = 0;
    let board = set_cell(board, 4, PLAYER_X);
    assert!(get_cell(board, 4) == PLAYER_X, "Should be player");
    let board = set_cell(board, 4, AI_O);
    assert!(get_cell(board, 4) == AI_O, "Should be overwritten to AI");
}
