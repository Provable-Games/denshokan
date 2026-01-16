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
 * 5. indexer_state - cursor persistence for restart handling
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
  smallint,
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

    // Token ID - stored as numeric for u64 precision
    tokenId: bigint("token_id", { mode: "bigint" }).notNull().unique(),

    // Decoded from packed token_id (immutable)
    gameId: integer("game_id").notNull(),
    mintedBy: bigint("minted_by", { mode: "bigint" }).notNull(),
    settingsId: integer("settings_id").notNull(),
    mintedAt: timestamp("minted_at").notNull(),
    lifecycleStart: integer("lifecycle_start").notNull().default(0),
    lifecycleEnd: integer("lifecycle_end").notNull().default(0),
    objectivesCount: smallint("objectives_count").notNull().default(0),
    soulbound: boolean("soulbound").notNull().default(false),
    hasContext: boolean("has_context").notNull().default(false),
    sequenceNumber: bigint("sequence_number", { mode: "bigint" }).notNull(),

    // Mutable fields (from events)
    gameOver: boolean("game_over").notNull().default(false),
    completedAllObjectives: boolean("completed_all_objectives").notNull().default(false),

    // From Transfer events and player actions
    ownerAddress: text("owner_address").notNull(),
    playerName: text("player_name"),
    clientUrl: text("client_url"),

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
    // Sequence number for ordering
    index("tokens_sequence_idx").on(table.sequenceNumber),
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
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
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
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at").defaultNow(),
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
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
    eventType: text("event_type").notNull(), // "score_update", "metadata_update", "player_name", "client_url"
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
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
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
    avgScore: numeric("avg_score", { precision: 20, scale: 2 }),
    highScore: bigint("high_score", { mode: "bigint" }),
    uniquePlayers: integer("unique_players").notNull().default(0),
    lastUpdated: timestamp("last_updated").defaultNow(),
  }
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
};
