use starknet::ContractAddress;

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

pub const EMPTY: u32 = 0;
pub const PLAYER_X: u32 = 1;
pub const AI_O: u32 = 2;

// Game status
pub const STATUS_PLAYING: u8 = 0;
pub const STATUS_PLAYER_WIN: u8 = 1;
pub const STATUS_AI_WIN: u8 = 2;
pub const STATUS_DRAW: u8 = 3;

// ==========================================================================
// DOJO MODELS
// ==========================================================================

/// The board state for a single game.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct Board {
    #[key]
    pub game_id: u64,
    /// Packed board: 2 bits per cell, 18 bits total.
    pub cells: u32,
    /// Game status: 0=playing, 1=player_win, 2=ai_win, 3=draw.
    pub status: u8,
}

/// Tracks a player's game history and stats.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct PlayerStats {
    #[key]
    pub player: ContractAddress,
    pub games_played: u32,
    pub games_won: u32,
    pub games_drawn: u32,
    pub games_lost: u32,
    pub current_game_id: u64,
}

/// Maps a game_id to the player who owns it.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct GameOwner {
    #[key]
    pub game_id: u64,
    pub player: ContractAddress,
}

/// Global counter for generating unique game IDs.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct GameCounter {
    #[key]
    pub id: u8, // always 0, singleton
    pub count: u64,
}

/// Per-token game state shared between game_setup and game_actions via the Dojo world.
/// game_actions writes this model; game_setup reads it for IMinigameTokenData/IMinigameDetails.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct TokenGameState {
    #[key]
    pub token_id: felt252,
    /// Packed board: 2 bits per cell, 18 bits total.
    pub board: u32,
    /// Game status: 0=playing, 1=player_win, 2=ai_win, 3=draw.
    pub status: u8,
    pub games_played: u32,
    pub games_won: u32,
    pub games_drawn: u32,
    /// Cumulative score (wins count).
    pub score: u64,
}

/// Game settings definition.
#[derive(Drop, Serde)]
#[dojo::model]
pub struct SettingsModel {
    #[key]
    pub settings_id: u32,
    pub name: ByteArray,
    pub description: ByteArray,
    pub exists: bool,
}

/// Game objective definition.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct ObjectiveModel {
    #[key]
    pub objective_id: u32,
    pub target_wins: u32,
    pub exists: bool,
}

/// Singleton config for settings/objectives counts.
#[derive(Copy, Drop, Serde)]
#[dojo::model]
pub struct GameConfig {
    #[key]
    pub id: u8, // always 0, singleton
    pub settings_count: u32,
    pub objectives_count: u32,
}

// ==========================================================================
// PURE BOARD LOGIC
// ==========================================================================

pub fn get_cell(board: u32, pos: u8) -> u32 {
    (board / pow2(pos * 2)) % 4
}

pub fn set_cell(board: u32, pos: u8, value: u32) -> u32 {
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
pub fn check_winner(board: u32, player: u32) -> bool {
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
pub fn board_full(board: u32) -> bool {
    let mut i: u8 = 0;
    loop {
        if i >= 9 {
            break true;
        }
        if get_cell(board, i) == EMPTY {
            break false;
        }
        i += 1;
    }
}

/// Simple AI: try to win, then block, then center, then corners, then edges.
pub fn ai_move(board: u32) -> u8 {
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
