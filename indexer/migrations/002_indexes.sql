-- ============================================================================
-- 002_indexes.sql
-- Optimized Indexes for Denshokan Query Patterns
--
-- Index strategy based on common query patterns:
-- 1. Leaderboard queries: Top scores per game (ORDER BY current_score DESC WHERE game_over = TRUE)
-- 2. Active games lookup: Tokens not yet completed (WHERE game_over = FALSE)
-- 3. Player portfolio: All tokens owned by an address
-- 4. Player name search: Full-text search on player_name
-- 5. Token detail with history: Token + last N score updates
-- 6. Recent activity: Most recently updated tokens
--
-- Target Performance:
-- - Leaderboard query: < 50ms for top 100
-- - Player portfolio: < 50ms
-- - Token detail with score history: < 100ms
-- ============================================================================

-- ============================================================================
-- TOKENS TABLE INDEXES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Leaderboard Index (PARTIAL)
-- Query pattern: SELECT * FROM tokens WHERE game_id = $1 AND game_over = TRUE
--                ORDER BY current_score DESC LIMIT 100
--
-- Uses partial index to only include completed games, significantly reducing
-- index size and improving scan performance.
-- DESC ordering matches common leaderboard query pattern.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_leaderboard
    ON tokens (game_id, current_score DESC)
    WHERE game_over = TRUE;

-- -----------------------------------------------------------------------------
-- Active Games Index (PARTIAL)
-- Query pattern: SELECT * FROM tokens WHERE game_id = $1 AND game_over = FALSE
--
-- Partial index for games still in progress.
-- Useful for showing "currently playing" dashboards.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_active_games
    ON tokens (game_id, token_id)
    WHERE game_over = FALSE;

-- -----------------------------------------------------------------------------
-- Player Portfolio Index (COMPOSITE)
-- Query pattern: SELECT * FROM tokens WHERE owner_address = $1
--                [AND game_id = $2] ORDER BY last_updated_at DESC
--
-- Covers both "all tokens for player" and "player tokens for specific game".
-- Includes last_updated_at for efficient sorting.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_owner_portfolio
    ON tokens (owner_address, game_id, last_updated_at DESC);

-- -----------------------------------------------------------------------------
-- Player Name Trigram Index (GIN)
-- Query pattern: SELECT * FROM tokens WHERE player_name ILIKE '%search%'
--
-- Uses pg_trgm extension for efficient substring matching.
-- Only indexes rows where player_name is set.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_player_name_trgm
    ON tokens USING gin (player_name gin_trgm_ops)
    WHERE player_name IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Recent Activity Index (BRIN)
-- Query pattern: SELECT * FROM tokens ORDER BY last_updated_at DESC LIMIT N
--
-- BRIN index is highly efficient for append-mostly timestamp columns.
-- Much smaller than B-tree for large tables with time-based data.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_updated_brin
    ON tokens USING brin (last_updated_at)
    WITH (pages_per_range = 32);

-- B-tree fallback for precise ordering when BRIN is not efficient
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_updated_btree
    ON tokens (last_updated_at DESC)
    WHERE last_updated_at > NOW() - INTERVAL '7 days';

-- -----------------------------------------------------------------------------
-- Minted By Index
-- Query pattern: SELECT * FROM tokens WHERE minted_by = $1
--
-- For querying tokens by minter (metagame/tournament context).
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_minted_by
    ON tokens (minted_by);

-- -----------------------------------------------------------------------------
-- Settings Index (PARTIAL)
-- Query pattern: SELECT * FROM tokens WHERE settings_id = $1 AND game_id = $2
--
-- For querying tokens with specific game settings.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_settings
    ON tokens (game_id, settings_id)
    WHERE settings_id > 0;

-- -----------------------------------------------------------------------------
-- Sequence Number Index
-- Query pattern: Used for ordering and pagination
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_sequence
    ON tokens (sequence_number);

-- -----------------------------------------------------------------------------
-- Soulbound Tokens Index (PARTIAL)
-- Query pattern: SELECT * FROM tokens WHERE soulbound = TRUE AND owner_address = $1
--
-- For verifying non-transferable tokens per player.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_soulbound
    ON tokens (owner_address)
    WHERE soulbound = TRUE;

-- -----------------------------------------------------------------------------
-- Completed Objectives Index (PARTIAL)
-- Query pattern: SELECT * FROM tokens WHERE completed_all_objectives = TRUE AND game_id = $1
--
-- For achievement/completion tracking.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_completed_objectives
    ON tokens (game_id)
    WHERE completed_all_objectives = TRUE;

-- ============================================================================
-- SCORE_HISTORY TABLE INDEXES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Token Score History Index
-- Query pattern: SELECT * FROM score_history WHERE token_id = $1
--                ORDER BY block_timestamp DESC LIMIT N
--
-- Covers the most common pattern: getting score history for a specific token.
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_score_history_token_time
    ON score_history (token_id, block_timestamp DESC);

-- -----------------------------------------------------------------------------
-- Block-based History Index
-- Query pattern: For replaying/auditing specific block ranges
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_score_history_block
    ON score_history (block_number, token_id);

-- -----------------------------------------------------------------------------
-- Recent Score Updates Index (BRIN)
-- Query pattern: Recent global score activity
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_score_history_time_brin
    ON score_history USING brin (block_timestamp)
    WITH (pages_per_range = 32);

-- ============================================================================
-- TOKEN_EVENTS TABLE INDEXES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Token Events Index
-- Query pattern: SELECT * FROM token_events WHERE token_id = $1
--                ORDER BY block_timestamp DESC
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_events_token
    ON token_events (token_id, block_timestamp DESC);

-- -----------------------------------------------------------------------------
-- Event Type Index (PARTIAL indexes for common types)
-- Query pattern: SELECT * FROM token_events WHERE event_type = $1
--                AND block_timestamp > $2
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_events_score_updates
    ON token_events (block_timestamp DESC)
    WHERE event_type = 'score_update';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_events_game_over
    ON token_events (block_timestamp DESC)
    WHERE event_type = 'game_over';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_events_transfers
    ON token_events (block_timestamp DESC)
    WHERE event_type = 'transfer';

-- -----------------------------------------------------------------------------
-- JSONB Data Index (GIN)
-- Query pattern: SELECT * FROM token_events WHERE event_data @> '{"key": "value"}'
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_token_events_data_gin
    ON token_events USING gin (event_data);

-- ============================================================================
-- GAMES TABLE INDEXES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Contract Address Index
-- Query pattern: SELECT * FROM games WHERE contract_address = $1
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_games_contract
    ON games (contract_address);

-- ============================================================================
-- MINTERS TABLE INDEXES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Contract Address Index
-- Query pattern: SELECT * FROM minters WHERE contract_address = $1
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_minters_contract
    ON minters (contract_address);

-- ============================================================================
-- GAME_LEADERBOARDS TABLE INDEXES
-- ============================================================================

-- -----------------------------------------------------------------------------
-- Leaderboard Query Index
-- Query pattern: SELECT * FROM game_leaderboards WHERE game_id = $1
--                ORDER BY rank LIMIT 100
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboards_game_rank
    ON game_leaderboards (game_id, rank);

-- -----------------------------------------------------------------------------
-- Token Lookup Index
-- Query pattern: SELECT * FROM game_leaderboards WHERE token_id = $1
-- -----------------------------------------------------------------------------
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaderboards_token
    ON game_leaderboards (token_id);

-- ============================================================================
-- STATISTICS & MAINTENANCE
-- ============================================================================

-- Update table statistics for query planner
ANALYZE tokens;
ANALYZE score_history;
ANALYZE token_events;
ANALYZE games;
ANALYZE minters;
ANALYZE game_leaderboards;
ANALYZE game_stats;

-- ============================================================================
-- INDEX MAINTENANCE NOTES
-- ============================================================================
/*
Index Maintenance Best Practices:

1. REGULAR REINDEXING
   Schedule weekly reindexing during low-traffic periods:
   REINDEX INDEX CONCURRENTLY idx_tokens_leaderboard;

2. BLOAT MONITORING
   Check index bloat:
   SELECT schemaname, tablename, indexname,
          pg_size_pretty(pg_relation_size(indexrelid)) as index_size
   FROM pg_stat_user_indexes
   WHERE schemaname = 'public'
   ORDER BY pg_relation_size(indexrelid) DESC;

3. UNUSED INDEX DETECTION
   Identify unused indexes:
   SELECT schemaname, relname, indexrelname, idx_scan, idx_tup_read
   FROM pg_stat_user_indexes
   WHERE idx_scan = 0
   AND schemaname = 'public';

4. PARTIAL INDEX COVERAGE
   Monitor partial index hit rates to ensure they cover intended queries.

5. STATISTICS UPDATES
   Run ANALYZE after large batch inserts:
   ANALYZE tokens;
*/
