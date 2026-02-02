/**
 * Denshokan Indexer Database Schema
 *
 * Tables optimized for:
 * - Efficient indexer writes (minimal table updates per event)
 * - Fast client queries (denormalized for common access patterns)
 * - Real-time updates via PostgreSQL NOTIFY
 *
 * Tables:
 * 1. tokens - current state of each token with decoded packed ID data
 * 2. score_history - historical score snapshots for charts/analytics
 * 3. games - game registry cache
 * 4. minters - minter registry cache
 * 5. token_events - raw event audit log
 * 6. game_leaderboards - pre-computed leaderboard data
 * 7. game_stats - aggregated per-game statistics
 * 8. objectives - game objective definitions
 * 9. settings - game settings definitions
 */

import {
  pgTable,
  uuid,
  text,
  bigint,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  numeric,
} from "drizzle-orm/pg-core";

/**
 * Tokens table - stores token state with decoded packed ID fields
 *
 * The packed token ID embeds immutable data (game_id, minted_by, settings_id, etc.)
 * directly in the token_id felt252. These fields are decoded and stored for
 * efficient querying without needing to decode on every read.
 *
 * Mutable fields (game_over, completed_all_objectives) are updated from events.
 */
export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Token ID - stored as numeric for felt252 precision (251 bits)
    tokenId: numeric("token_id").notNull().unique(),

    // Decoded from packed token_id (immutable)
    gameId: integer("game_id").notNull(),
    mintedBy: bigint("minted_by", { mode: "bigint" }).notNull(),
    settingsId: integer("settings_id").notNull(),
    mintedAt: timestamp("minted_at").notNull(),
    startDelay: integer("start_delay").notNull().default(0),
    endDelay: integer("end_delay").notNull().default(0),
    objectiveId: integer("objective_id").notNull().default(0),
    soulbound: boolean("soulbound").notNull().default(false),
    hasContext: boolean("has_context").notNull().default(false),
    paymaster: boolean("paymaster").notNull().default(false),
    txHash: integer("tx_hash").notNull().default(0),
    salt: integer("salt").notNull().default(0),
    metadata: integer("metadata").notNull().default(0),

    // Mutable fields (from events)
    gameOver: boolean("game_over").notNull().default(false),
    completedAllObjectives: boolean("completed_all_objectives").notNull().default(false),

    // From Transfer events and player actions
    ownerAddress: text("owner_address").notNull(),
    playerName: text("player_name"),
    clientUrl: text("client_url"),

    // From TokenContextUpdate
    contextData: text("context_data"),
    // From TokenRendererUpdate
    rendererAddress: text("renderer_address"),

    // Current game state
    currentScore: bigint("current_score", { mode: "bigint" }).notNull().$default(() => 0n),

    // Indexer metadata
    createdAtBlock: bigint("created_at_block", { mode: "bigint" }).notNull(),
    lastUpdatedBlock: bigint("last_updated_block", { mode: "bigint" }).notNull(),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  },
  (table) => [
    // Leaderboard queries: top scores per game
    index("tokens_game_score_idx").on(table.gameId, table.currentScore),
    // Active games lookup
    index("tokens_game_active_idx").on(table.gameId, table.gameOver),
    // Player portfolio queries
    index("tokens_owner_idx").on(table.ownerAddress),
    index("tokens_owner_game_idx").on(table.ownerAddress, table.gameId),
    // Recent activity
    index("tokens_updated_idx").on(table.lastUpdatedAt),
    // Objective queries
    index("tokens_objective_idx").on(table.objectiveId),
    // Minter queries
    index("tokens_minted_by_idx").on(table.mintedBy),
    // Settings queries
    index("tokens_settings_idx").on(table.settingsId),
  ]
);

/**
 * Score History table - historical score snapshots
 *
 * Tracks score changes over time for analytics and charts.
 * Each ScoreUpdate event creates a new record.
 */
export const scoreHistory = pgTable(
  "score_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: numeric("token_id").notNull(),
    score: bigint("score", { mode: "bigint" }).notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockTimestamp: timestamp("block_timestamp").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
  },
  (table) => [
    // Unique constraint for idempotent re-indexing
    uniqueIndex("score_history_block_tx_event_idx").on(
      table.blockNumber,
      table.transactionHash,
      table.eventIndex
    ),
    // Token score history query
    index("score_history_token_block_idx").on(table.tokenId, table.blockNumber),
    // Time-based queries
    index("score_history_token_time_idx").on(table.tokenId, table.blockTimestamp),
  ]
);

/**
 * Games table - game metadata cache
 *
 * Caches game information from the game registry.
 * Updated from registry events or manual sync.
 */
export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: integer("game_id").notNull().unique(),
    contractAddress: text("contract_address").notNull(),
    name: text("name"),
    description: text("description"),
    image: text("image"),
    developer: text("developer"),
    publisher: text("publisher"),
    genre: text("genre"),
    color: text("color"),
    clientUrl: text("client_url"),
    rendererAddress: text("renderer_address"),
    royaltyFraction: numeric("royalty_fraction"),
    createdAt: timestamp("created_at").defaultNow(),
    lastUpdatedBlock: bigint("last_updated_block", { mode: "bigint" }),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  },
  (table) => [
    index("games_contract_idx").on(table.contractAddress),
  ]
);

/**
 * Minters table - minter registry cache
 *
 * Caches minter information from minter registration events.
 */
export const minters = pgTable(
  "minters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minterId: bigint("minter_id", { mode: "bigint" }).notNull().unique(),
    contractAddress: text("contract_address").notNull(),
    name: text("name"),
    createdAt: timestamp("created_at").defaultNow(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
  },
  (table) => [
    index("minters_contract_idx").on(table.contractAddress),
  ]
);

/**
 * Token Events table - raw event log for debugging and audit
 *
 * Stores all processed events with decoded data.
 * Useful for debugging and historical analysis.
 */
export const tokenEvents = pgTable(
  "token_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: numeric("token_id").notNull(),
    eventType: text("event_type").notNull(),
    eventData: text("event_data").notNull(), // JSON encoded event data
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    blockTimestamp: timestamp("block_timestamp").notNull(),
    transactionHash: text("transaction_hash").notNull(),
    eventIndex: integer("event_index").notNull(),
  },
  (table) => [
    // Unique constraint for idempotent re-indexing
    uniqueIndex("token_events_block_tx_event_idx").on(
      table.blockNumber,
      table.transactionHash,
      table.eventIndex
    ),
    // Token event history
    index("token_events_token_idx").on(table.tokenId),
    index("token_events_token_time_idx").on(table.tokenId, table.blockTimestamp),
    // Event type filtering
    index("token_events_type_idx").on(table.eventType),
    // Recent events
    index("token_events_time_idx").on(table.blockTimestamp),
  ]
);

/**
 * Game Leaderboards materialized view support table
 *
 * Pre-computed leaderboard data that can be refreshed periodically.
 * More efficient than computing ranks on every query.
 */
export const gameLeaderboards = pgTable(
  "game_leaderboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: integer("game_id").notNull(),
    tokenId: numeric("token_id").notNull(),
    ownerAddress: text("owner_address").notNull(),
    playerName: text("player_name"),
    score: bigint("score", { mode: "bigint" }).notNull(),
    rank: integer("rank").notNull(),
    lastUpdated: timestamp("last_updated").defaultNow(),
  },
  (table) => [
    // Unique constraint on game + rank
    uniqueIndex("game_leaderboards_game_rank_idx").on(table.gameId, table.rank),
    // Token lookup
    index("game_leaderboards_token_idx").on(table.tokenId),
    // Game leaderboard query
    index("game_leaderboards_game_score_idx").on(table.gameId, table.score),
  ]
);

/**
 * Game Statistics table
 *
 * Aggregated statistics per game, refreshed periodically.
 */
export const gameStats = pgTable(
  "game_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: integer("game_id").notNull().unique(),
    totalTokens: integer("total_tokens").notNull().default(0),
    completedGames: integer("completed_games").notNull().default(0),
    activeGames: integer("active_games").notNull().default(0),
    uniquePlayers: integer("unique_players").notNull().default(0),
    lastUpdated: timestamp("last_updated").defaultNow(),
  }
);

/**
 * Objectives table - game objective definitions
 *
 * Stores objective definitions created via ObjectiveCreated events.
 */
export const objectives = pgTable(
  "objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameAddress: text("game_address").notNull(),
    objectiveId: integer("objective_id").notNull(),
    creatorAddress: text("creator_address").notNull(),
    objectiveData: text("objective_data"),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("objectives_game_objective_idx").on(table.gameAddress, table.objectiveId),
  ]
);

/**
 * Settings table - game settings definitions
 *
 * Stores settings definitions created via SettingsCreated events.
 */
export const settings = pgTable(
  "settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameAddress: text("game_address").notNull(),
    settingsId: integer("settings_id").notNull(),
    creatorAddress: text("creator_address").notNull(),
    settingsData: text("settings_data"),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("settings_game_settings_idx").on(table.gameAddress, table.settingsId),
  ]
);

// Export all schema tables for Drizzle
export const schema = {
  tokens,
  scoreHistory,
  games,
  minters,
  tokenEvents,
  gameLeaderboards,
  gameStats,
  objectives,
  settings,
};
