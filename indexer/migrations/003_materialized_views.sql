-- ============================================================================
-- 003_materialized_views.sql
-- Materialized Views for Leaderboards and Statistics
--
-- Strategy:
-- 1. Use MATERIALIZED VIEWS for pre-computed aggregations
-- 2. Create UNIQUE indexes for CONCURRENTLY refresh support
-- 3. Provide refresh functions for scheduled updates
-- 4. Support both real-time table updates and periodic view refreshes
--
-- Refresh Strategy:
-- - game_leaderboards_mv: Every 30 seconds or on significant score changes
-- - game_stats_mv: Every 5 minutes
-- - player_stats_mv: Every 5 minutes
-- ============================================================================

-- ============================================================================
-- GAME LEADERBOARDS MATERIALIZED VIEW
-- Pre-computed rankings per game for fast leaderboard queries
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS game_leaderboards_mv CASCADE;

CREATE MATERIALIZED VIEW game_leaderboards_mv AS
SELECT
    t.game_id,
    t.token_id,
    t.owner_address,
    t.player_name,
    t.current_score AS score,
    t.completed_all_objectives,
    t.last_updated_at,
    DENSE_RANK() OVER (
        PARTITION BY t.game_id
        ORDER BY t.current_score DESC
    ) AS rank
FROM tokens t
WHERE t.game_over = TRUE
WITH DATA;

-- Unique index required for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_leaderboards_mv_game_token
    ON game_leaderboards_mv (game_id, token_id);

-- Query optimization indexes
CREATE INDEX idx_leaderboards_mv_game_rank
    ON game_leaderboards_mv (game_id, rank);

CREATE INDEX idx_leaderboards_mv_score
    ON game_leaderboards_mv (game_id, score DESC);

CREATE INDEX idx_leaderboards_mv_player
    ON game_leaderboards_mv (owner_address);

COMMENT ON MATERIALIZED VIEW game_leaderboards_mv IS
    'Pre-computed game leaderboards. Refresh every 30s or on score changes.';

-- ============================================================================
-- GAME STATISTICS MATERIALIZED VIEW
-- Aggregated statistics per game
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS game_stats_mv CASCADE;

CREATE MATERIALIZED VIEW game_stats_mv AS
SELECT
    t.game_id,
    COUNT(*) AS total_tokens,
    COUNT(*) FILTER (WHERE t.game_over = TRUE) AS completed_games,
    COUNT(*) FILTER (WHERE t.game_over = FALSE) AS active_games,
    ROUND(AVG(t.current_score) FILTER (WHERE t.game_over = TRUE), 2) AS avg_score,
    MAX(t.current_score) AS high_score,
    MIN(t.current_score) FILTER (WHERE t.game_over = TRUE AND t.current_score > 0) AS low_score,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY t.current_score)
        FILTER (WHERE t.game_over = TRUE) AS median_score,
    COUNT(DISTINCT t.owner_address) AS unique_players,
    MAX(t.last_updated_at) AS last_activity,
    MIN(t.minted_at) AS first_token_at,
    MAX(t.minted_at) AS last_token_at,
    NOW() AS computed_at
FROM tokens t
GROUP BY t.game_id
WITH DATA;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_game_stats_mv_game_id
    ON game_stats_mv (game_id);

COMMENT ON MATERIALIZED VIEW game_stats_mv IS
    'Aggregated game statistics. Refresh every 5 minutes.';

-- ============================================================================
-- PLAYER STATISTICS MATERIALIZED VIEW
-- Aggregated statistics per player address
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS player_stats_mv CASCADE;

CREATE MATERIALIZED VIEW player_stats_mv AS
SELECT
    t.owner_address,
    COUNT(*) AS total_tokens,
    COUNT(DISTINCT t.game_id) AS games_played,
    COUNT(*) FILTER (WHERE t.game_over = TRUE) AS completed_games,
    COUNT(*) FILTER (WHERE t.game_over = FALSE) AS active_games,
    COUNT(*) FILTER (WHERE t.completed_all_objectives = TRUE) AS perfect_games,
    SUM(t.current_score) FILTER (WHERE t.game_over = TRUE) AS total_score,
    MAX(t.current_score) AS personal_best,
    ROUND(AVG(t.current_score) FILTER (WHERE t.game_over = TRUE), 2) AS avg_score,
    MAX(t.last_updated_at) AS last_activity,
    MIN(t.minted_at) AS first_game_at,
    NOW() AS computed_at
FROM tokens t
GROUP BY t.owner_address
WITH DATA;

-- Unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_player_stats_mv_address
    ON player_stats_mv (owner_address);

-- Query optimization indexes
CREATE INDEX idx_player_stats_mv_total_score
    ON player_stats_mv (total_score DESC);

CREATE INDEX idx_player_stats_mv_games_played
    ON player_stats_mv (games_played DESC);

COMMENT ON MATERIALIZED VIEW player_stats_mv IS
    'Aggregated player statistics across all games. Refresh every 5 minutes.';

-- ============================================================================
-- RECENT ACTIVITY VIEW (Regular View - Always Fresh)
-- For real-time recent activity without materialization delay
-- ============================================================================

CREATE OR REPLACE VIEW recent_activity_v AS
SELECT
    t.token_id,
    t.game_id,
    g.name AS game_name,
    t.owner_address,
    t.player_name,
    t.current_score,
    t.game_over,
    t.last_updated_at,
    CASE
        WHEN t.game_over THEN 'completed'
        ELSE 'playing'
    END AS status
FROM tokens t
LEFT JOIN games g ON t.game_id = g.game_id
ORDER BY t.last_updated_at DESC
LIMIT 100;

COMMENT ON VIEW recent_activity_v IS
    'Real-time view of 100 most recently updated tokens.';

-- ============================================================================
-- TOP PLAYERS PER GAME VIEW
-- Combines leaderboard with player info for display
-- ============================================================================

CREATE OR REPLACE VIEW top_players_v AS
SELECT
    lb.game_id,
    g.name AS game_name,
    lb.rank,
    lb.token_id,
    lb.owner_address,
    lb.player_name,
    lb.score,
    lb.completed_all_objectives,
    ps.total_tokens AS player_total_tokens,
    ps.games_played AS player_games_played
FROM game_leaderboards_mv lb
LEFT JOIN games g ON lb.game_id = g.game_id
LEFT JOIN player_stats_mv ps ON lb.owner_address = ps.owner_address
WHERE lb.rank <= 100;

COMMENT ON VIEW top_players_v IS
    'Combined leaderboard with player statistics for display.';

-- ============================================================================
-- REFRESH FUNCTIONS
-- ============================================================================

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
    -- Refresh leaderboards (most critical for real-time)
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_leaderboards_mv;

    -- Refresh statistics
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_stats_mv;
    REFRESH MATERIALIZED VIEW CONCURRENTLY player_stats_mv;

    -- Log refresh time
    RAISE NOTICE 'Materialized views refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to refresh only leaderboards (for frequent updates)
CREATE OR REPLACE FUNCTION refresh_leaderboards()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_leaderboards_mv;
END;
$$ LANGUAGE plpgsql;

-- Function to refresh only statistics (for less frequent updates)
CREATE OR REPLACE FUNCTION refresh_statistics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_stats_mv;
    REFRESH MATERIALIZED VIEW CONCURRENTLY player_stats_mv;
END;
$$ LANGUAGE plpgsql;

-- Function to check if materialized views need refresh
CREATE OR REPLACE FUNCTION check_mv_staleness()
RETURNS TABLE (
    view_name TEXT,
    last_refresh TIMESTAMP WITH TIME ZONE,
    is_stale BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        'game_leaderboards_mv'::TEXT,
        (SELECT MAX(last_updated_at) FROM game_leaderboards_mv),
        (SELECT MAX(last_updated_at) FROM tokens WHERE game_over = TRUE) >
            COALESCE((SELECT MAX(last_updated_at) FROM game_leaderboards_mv), '1970-01-01'::TIMESTAMP)
    UNION ALL
    SELECT
        'game_stats_mv'::TEXT,
        (SELECT computed_at FROM game_stats_mv LIMIT 1),
        NOW() - COALESCE((SELECT computed_at FROM game_stats_mv LIMIT 1), '1970-01-01'::TIMESTAMP) > INTERVAL '5 minutes'
    UNION ALL
    SELECT
        'player_stats_mv'::TEXT,
        (SELECT computed_at FROM player_stats_mv LIMIT 1),
        NOW() - COALESCE((SELECT computed_at FROM player_stats_mv LIMIT 1), '1970-01-01'::TIMESTAMP) > INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SYNC FUNCTION: Update game_leaderboards table from materialized view
-- For maintaining the table that the indexer originally created
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_leaderboards_table()
RETURNS void AS $$
BEGIN
    -- Clear existing data
    DELETE FROM game_leaderboards;

    -- Insert from materialized view (top 1000 per game)
    INSERT INTO game_leaderboards (game_id, token_id, owner_address, player_name, score, rank, last_updated)
    SELECT game_id, token_id, owner_address, player_name, score, rank, last_updated_at
    FROM game_leaderboards_mv
    WHERE rank <= 1000;
END;
$$ LANGUAGE plpgsql;

-- Sync function for game_stats table
CREATE OR REPLACE FUNCTION sync_game_stats_table()
RETURNS void AS $$
BEGIN
    -- Upsert from materialized view
    INSERT INTO game_stats (game_id, total_tokens, completed_games, active_games, avg_score, high_score, unique_players, last_updated)
    SELECT
        game_id,
        total_tokens,
        completed_games,
        active_games,
        avg_score,
        high_score,
        unique_players,
        NOW()
    FROM game_stats_mv
    ON CONFLICT (game_id) DO UPDATE SET
        total_tokens = EXCLUDED.total_tokens,
        completed_games = EXCLUDED.completed_games,
        active_games = EXCLUDED.active_games,
        avg_score = EXCLUDED.avg_score,
        high_score = EXCLUDED.high_score,
        unique_players = EXCLUDED.unique_players,
        last_updated = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA POPULATION
-- ============================================================================

-- Refresh views immediately to populate with existing data
-- (Only run if tokens table has data)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM tokens LIMIT 1) THEN
        PERFORM refresh_all_materialized_views();
        PERFORM sync_leaderboards_table();
        PERFORM sync_game_stats_table();
    END IF;
END $$;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
/*
Scheduled Refresh Configuration:

1. Using pg_cron (recommended):
   -- Refresh leaderboards every 30 seconds
   SELECT cron.schedule('refresh-leaderboards', '*/30 * * * * *', 'SELECT refresh_leaderboards()');

   -- Refresh statistics every 5 minutes
   SELECT cron.schedule('refresh-stats', '*/5 * * * *', 'SELECT refresh_statistics()');

2. Using external scheduler (cron, systemd timer, etc.):
   -- Every 30 seconds for leaderboards
   psql -c "SELECT refresh_leaderboards();"

   -- Every 5 minutes for statistics
   psql -c "SELECT refresh_statistics();"

3. Check staleness before refresh:
   SELECT * FROM check_mv_staleness();

Query Examples:

-- Top 10 leaderboard for game 1
SELECT * FROM game_leaderboards_mv WHERE game_id = 1 AND rank <= 10;

-- Game statistics
SELECT * FROM game_stats_mv WHERE game_id = 1;

-- Player statistics
SELECT * FROM player_stats_mv WHERE owner_address = '0x...';

-- Recent activity
SELECT * FROM recent_activity_v;

-- Top players with full info
SELECT * FROM top_players_v WHERE game_id = 1;
*/
