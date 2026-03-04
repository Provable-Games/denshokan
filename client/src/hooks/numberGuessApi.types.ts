/** Matches game_sessions table from number-guess indexer */
export interface ApiGameSession {
  id: string;
  tokenId: string;
  settingsId: number;
  rangeMin: number;
  rangeMax: number;
  maxAttempts: number;
  status: "playing" | "won" | "lost";
  guessCount: number;
  score: string | null;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  lastUpdatedBlock: string;
  lastUpdatedAt: string | null;
}

/** Matches guesses table from number-guess indexer */
export interface ApiGuess {
  id: string;
  tokenId: string;
  guessValue: number;
  result: "correct" | "too_low" | "too_high";
  guessNumber: number;
  rangeMinAfter: number;
  rangeMaxAfter: number;
  blockNumber: string;
  blockTimestamp: string;
  transactionHash: string;
  eventIndex: number;
}

/** Aggregate game stats from GET /stats */
export interface ApiGameStats {
  totalSessions: number;
  wins: number;
  losses: number;
  avgGuesses: string | null;
  perfectGames: number;
}

/** Player data from GET /players/:tokenId */
export interface ApiPlayerData {
  tokenId: string;
  stats: {
    total_games: string;
    wins: string;
    losses: string;
    active: string;
    avg_guesses: string | null;
    best_guess_count: string | null;
  };
  sessions: ApiGameSession[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
}

export type WsChannel = "new_game" | "guess" | "game_won" | "game_lost";

/** WebSocket message format broadcast by the API */
export interface WsMessage<T = unknown> {
  channel: WsChannel;
  data: T;
  _timing: { serverTs: number };
}

/** Payload for "guess" channel notifications */
export interface WsGuessPayload {
  tokenId: string;
  guessValue: number;
  result: "correct" | "too_low" | "too_high";
  guessNumber: number;
  rangeMinAfter: number;
  rangeMaxAfter: number;
}

/** Payload for "game_won" / "game_lost" channel notifications */
export interface WsGameEndPayload {
  tokenId: string;
  guessCount: number;
}

/** Payload for "new_game" channel notifications */
export interface WsNewGamePayload {
  tokenId: string;
  settingsId: number;
  rangeMin: number;
  rangeMax: number;
  maxAttempts: number;
  status: "playing";
}
