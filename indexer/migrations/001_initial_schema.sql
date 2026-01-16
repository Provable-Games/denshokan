-- ============================================================================
-- 001_initial_schema.sql
-- Denshokan Indexer Core Tables
--
-- This migration creates the core tables for the Denshokan game indexer.
-- Tables are optimized for:
-- - Efficient indexer writes (minimal table updates per event)
-- - Fast client queries (denormalized for common access patterns)
-- - Real-time updates via PostgreSQL NOTIFY
--
-- Note: This file is a manual optimization of the Drizzle-generated schema.
-- Use this for production deployments instead of the auto-generated migration.
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For trigram-based text search

-- ============================================================================
-- TOKENS TABLE
-- Stores current state of each token with decoded packed ID fields
-- ============================================================================
CREATE TABLE IF NOT EXISTS tokens (
    -- Primary key using UUID for distributed systems compatibility
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Token ID - stored as BIGINT (sufficient for packed u64 token_id)
    -- UNIQUE constraint creates implicit B-tree index
    token_id BIGINT NOT NULL UNIQUE,

    -- Decoded from packed token_id (immutable fields)
    game_id INTEGER NOT NULL,
    minted_by BIGINT NOT NULL,
    settings_id INTEGER NOT NULL,
    minted_at TIMESTAMP WITH TIME ZONE NOT NULL,
    lifecycle_start INTEGER NOT NULL DEFAULT 0,
    lifecycle_end INTEGER NOT NULL DEFAULT 0,
    objectives_count SMALLINT NOT NULL DEFAULT 0,
    soulbound BOOLEAN NOT NULL DEFAULT FALSE,
    has_context BOOLEAN NOT NULL DEFAULT FALSE,
    sequence_number BIGINT NOT NULL,

    -- Mutable fields (updated from events)
    game_over BOOLEAN NOT NULL DEFAULT FALSE,
    completed_all_objectives BOOLEAN NOT NULL DEFAULT FALSE,

    -- From Transfer events and player actions
    owner_address TEXT NOT NULL,
    player_name TEXT,
    client_url TEXT,

    -- Current game state (denormalized for fast leaderboard queries)
    current_score BIGINT NOT NULL DEFAULT 0,

    -- Indexer metadata
    created_at_block BIGINT NOT NULL,
    last_updated_block BIGINT NOT NULL,
    last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add check constraints for data integrity
ALTER TABLE tokens ADD CONSTRAINT chk_objectives_count
    CHECK (objectives_count >= 0 AND objectives_count <= 255);
ALTER TABLE tokens ADD CONSTRAINT chk_lifecycle
    CHECK (lifecycle_end >= lifecycle_start OR lifecycle_end = 0);
ALTER TABLE tokens ADD CONSTRAINT chk_score_positive
    CHECK (current_score >= 0);

-- ============================================================================
-- SCORE_HISTORY TABLE
-- Historical score snapshots for analytics and charts
-- ============================================================================
CREATE TABLE IF NOT EXISTS score_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to tokens (not enforced for indexer performance)
    token_id BIGINT NOT NULL,

    score BIGINT NOT NULL,
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    transaction_hash TEXT NOT NULL,
    event_index INTEGER NOT NULL,

    -- Unique constraint for idempotent re-indexing
    CONSTRAINT uq_score_history_event UNIQUE (block_number, transaction_hash, event_index)
);

-- ============================================================================
-- TOKEN_EVENTS TABLE
-- Raw event log for debugging and audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS token_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    token_id BIGINT NOT NULL,
    event_type TEXT NOT NULL,  -- "score_update", "metadata_update", "player_name", "client_url", "game_over", "transfer"
    event_data JSONB NOT NULL,  -- Use JSONB for efficient querying
    block_number BIGINT NOT NULL,
    block_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    transaction_hash TEXT NOT NULL,
    event_index INTEGER NOT NULL,

    -- Unique constraint for idempotent re-indexing
    CONSTRAINT uq_token_events_event UNIQUE (block_number, transaction_hash, event_index)
);

-- ============================================================================
-- GAMES TABLE
-- Game metadata cache from registry
-- ============================================================================
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    game_id INTEGER NOT NULL UNIQUE,
    contract_address TEXT NOT NULL,
    name TEXT,
    description TEXT,
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- MINTERS TABLE
-- Minter registry cache
-- ============================================================================
CREATE TABLE IF NOT EXISTS minters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    minter_id BIGINT NOT NULL UNIQUE,
    contract_address TEXT NOT NULL,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    block_number BIGINT NOT NULL
);

-- ============================================================================
-- GAME_LEADERBOARDS TABLE
-- Pre-computed leaderboard data (updated by triggers/functions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_leaderboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    game_id INTEGER NOT NULL,
    token_id BIGINT NOT NULL,
    owner_address TEXT NOT NULL,
    player_name TEXT,
    score BIGINT NOT NULL,
    rank INTEGER NOT NULL,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Each game+rank combination is unique
    CONSTRAINT uq_leaderboard_game_rank UNIQUE (game_id, rank)
);

-- ============================================================================
-- GAME_STATS TABLE
-- Aggregated statistics per game
-- ============================================================================
CREATE TABLE IF NOT EXISTS game_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    game_id INTEGER NOT NULL UNIQUE,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    completed_games INTEGER NOT NULL DEFAULT 0,
    active_games INTEGER NOT NULL DEFAULT 0,
    avg_score NUMERIC(20, 2),
    high_score BIGINT,
    unique_players INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXER_STATE TABLE
-- Cursor persistence for indexer restart handling
-- ============================================================================
CREATE TABLE IF NOT EXISTS indexer_state (
    id INTEGER PRIMARY KEY DEFAULT 1,
    cursor_data BYTEA,
    last_block BIGINT,
    last_block_timestamp TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure single row
    CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default indexer state row
INSERT INTO indexer_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE tokens IS 'Current state of each game token with decoded packed ID fields';
COMMENT ON COLUMN tokens.token_id IS 'Unique token ID (packed u64 containing game_id, minted_by, etc.)';
COMMENT ON COLUMN tokens.current_score IS 'Denormalized current score for fast leaderboard queries';

COMMENT ON TABLE score_history IS 'Historical score snapshots for analytics and charts';
COMMENT ON TABLE token_events IS 'Raw event log for debugging and audit trail';
COMMENT ON TABLE games IS 'Game metadata cache from on-chain registry';
COMMENT ON TABLE minters IS 'Minter registry cache';
COMMENT ON TABLE game_leaderboards IS 'Pre-computed leaderboard data for fast queries';
COMMENT ON TABLE game_stats IS 'Aggregated statistics per game';
COMMENT ON TABLE indexer_state IS 'Cursor persistence for indexer restart handling';
