-- ============================================================================
-- 004_functions.sql
-- PostgreSQL Functions and Triggers for Real-time Notifications
--
-- Features:
-- 1. LISTEN/NOTIFY for real-time subscriptions
-- 2. Triggers for automatic notifications on data changes
-- 3. Helper functions for common queries
-- 4. Leaderboard rank tracking with change detection
-- ============================================================================

-- ============================================================================
-- NOTIFICATION CHANNELS
-- ============================================================================
/*
Available channels for LISTEN/NOTIFY:

- token_updates      : All token state changes
- score_updates      : Score changes specifically
- game_over_events   : Game completion events
- leaderboard_changes: Rank changes in leaderboards
- new_tokens         : New token mints
- player_activity    : Events for specific players (filtered by payload)
*/

-- ============================================================================
-- TOKEN UPDATE TRIGGER
-- Notifies on any token state change
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_token_update()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    channel TEXT;
BEGIN
    -- Build the notification payload
    payload := jsonb_build_object(
        'token_id', NEW.token_id,
        'game_id', NEW.game_id,
        'owner_address', NEW.owner_address,
        'player_name', NEW.player_name,
        'current_score', NEW.current_score,
        'game_over', NEW.game_over,
        'completed_all_objectives', NEW.completed_all_objectives,
        'last_updated_at', NEW.last_updated_at,
        'event_type', CASE
            WHEN TG_OP = 'INSERT' THEN 'insert'
            WHEN OLD.current_score IS DISTINCT FROM NEW.current_score THEN 'score_update'
            WHEN OLD.game_over IS DISTINCT FROM NEW.game_over THEN 'game_over'
            WHEN OLD.owner_address IS DISTINCT FROM NEW.owner_address THEN 'transfer'
            WHEN OLD.player_name IS DISTINCT FROM NEW.player_name THEN 'player_name_update'
            ELSE 'update'
        END
    );

    -- Notify on general token updates channel
    PERFORM pg_notify('token_updates', payload::TEXT);

    -- Notify on specific channels based on event type
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_notify('new_tokens', payload::TEXT);
    END IF;

    IF OLD.current_score IS DISTINCT FROM NEW.current_score THEN
        payload := payload || jsonb_build_object(
            'old_score', OLD.current_score,
            'score_delta', NEW.current_score - OLD.current_score
        );
        PERFORM pg_notify('score_updates', payload::TEXT);
    END IF;

    IF OLD.game_over IS DISTINCT FROM NEW.game_over AND NEW.game_over = TRUE THEN
        payload := payload || jsonb_build_object(
            'final_score', NEW.current_score
        );
        PERFORM pg_notify('game_over_events', payload::TEXT);
    END IF;

    -- Player-specific activity channel (clients filter by address)
    PERFORM pg_notify('player_activity', payload::TEXT);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for token updates
DROP TRIGGER IF EXISTS token_update_notify ON tokens;
CREATE TRIGGER token_update_notify
    AFTER INSERT OR UPDATE ON tokens
    FOR EACH ROW
    EXECUTE FUNCTION notify_token_update();

-- ============================================================================
-- SCORE UPDATE TRIGGER (Optimized)
-- Only fires on score changes, not other updates
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_score_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    -- Only notify if score actually changed
    IF OLD.current_score IS DISTINCT FROM NEW.current_score THEN
        payload := jsonb_build_object(
            'token_id', NEW.token_id,
            'game_id', NEW.game_id,
            'owner_address', NEW.owner_address,
            'player_name', NEW.player_name,
            'old_score', OLD.current_score,
            'new_score', NEW.current_score,
            'score_delta', NEW.current_score - OLD.current_score,
            'timestamp', NOW()
        );

        PERFORM pg_notify('score_updates', payload::TEXT);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create optimized trigger for score updates only
DROP TRIGGER IF EXISTS score_change_notify ON tokens;
CREATE TRIGGER score_change_notify
    AFTER UPDATE OF current_score ON tokens
    FOR EACH ROW
    WHEN (OLD.current_score IS DISTINCT FROM NEW.current_score)
    EXECUTE FUNCTION notify_score_change();

-- ============================================================================
-- LEADERBOARD CHANGE DETECTION
-- Tracks and notifies on rank changes
-- ============================================================================

-- Table to store previous ranks for change detection
CREATE TABLE IF NOT EXISTS leaderboard_rank_cache (
    game_id INTEGER NOT NULL,
    token_id BIGINT NOT NULL,
    previous_rank INTEGER NOT NULL,
    previous_score BIGINT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (game_id, token_id)
);

CREATE OR REPLACE FUNCTION detect_leaderboard_changes()
RETURNS TABLE (
    game_id INTEGER,
    token_id BIGINT,
    owner_address TEXT,
    player_name TEXT,
    old_rank INTEGER,
    new_rank INTEGER,
    old_score BIGINT,
    new_score BIGINT,
    rank_change INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH current_ranks AS (
        SELECT
            lb.game_id,
            lb.token_id,
            lb.owner_address,
            lb.player_name,
            lb.rank AS new_rank,
            lb.score AS new_score
        FROM game_leaderboards_mv lb
        WHERE lb.rank <= 100  -- Only track top 100
    ),
    changes AS (
        SELECT
            cr.game_id,
            cr.token_id,
            cr.owner_address,
            cr.player_name,
            COALESCE(rc.previous_rank, 0) AS old_rank,
            cr.new_rank,
            COALESCE(rc.previous_score, 0) AS old_score,
            cr.new_score,
            COALESCE(rc.previous_rank, 0) - cr.new_rank AS rank_change
        FROM current_ranks cr
        LEFT JOIN leaderboard_rank_cache rc
            ON cr.game_id = rc.game_id AND cr.token_id = rc.token_id
        WHERE rc.previous_rank IS NULL
           OR rc.previous_rank != cr.new_rank
           OR rc.previous_score != cr.new_score
    )
    SELECT * FROM changes;
END;
$$ LANGUAGE plpgsql;

-- Function to update rank cache and notify changes
CREATE OR REPLACE FUNCTION refresh_leaderboard_with_notifications()
RETURNS void AS $$
DECLARE
    change_record RECORD;
    payload JSONB;
BEGIN
    -- First refresh the materialized view
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_leaderboards_mv;

    -- Detect and notify changes
    FOR change_record IN SELECT * FROM detect_leaderboard_changes() LOOP
        payload := jsonb_build_object(
            'game_id', change_record.game_id,
            'token_id', change_record.token_id,
            'owner_address', change_record.owner_address,
            'player_name', change_record.player_name,
            'old_rank', change_record.old_rank,
            'new_rank', change_record.new_rank,
            'old_score', change_record.old_score,
            'new_score', change_record.new_score,
            'rank_change', change_record.rank_change,
            'timestamp', NOW()
        );

        PERFORM pg_notify('leaderboard_changes', payload::TEXT);
    END LOOP;

    -- Update the rank cache
    INSERT INTO leaderboard_rank_cache (game_id, token_id, previous_rank, previous_score, updated_at)
    SELECT game_id, token_id, rank, score, NOW()
    FROM game_leaderboards_mv
    WHERE rank <= 100
    ON CONFLICT (game_id, token_id) DO UPDATE SET
        previous_rank = EXCLUDED.previous_rank,
        previous_score = EXCLUDED.previous_score,
        updated_at = NOW();

    -- Clean up entries no longer in top 100
    DELETE FROM leaderboard_rank_cache rc
    WHERE NOT EXISTS (
        SELECT 1 FROM game_leaderboards_mv lb
        WHERE lb.game_id = rc.game_id
          AND lb.token_id = rc.token_id
          AND lb.rank <= 100
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTIONS FOR COMMON QUERIES
-- ============================================================================

-- Get leaderboard for a game with pagination
CREATE OR REPLACE FUNCTION get_leaderboard(
    p_game_id INTEGER,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    rank INTEGER,
    token_id BIGINT,
    owner_address TEXT,
    player_name TEXT,
    score BIGINT,
    completed_all_objectives BOOLEAN,
    last_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lb.rank,
        lb.token_id,
        lb.owner_address,
        lb.player_name,
        lb.score,
        lb.completed_all_objectives,
        lb.last_updated_at
    FROM game_leaderboards_mv lb
    WHERE lb.game_id = p_game_id
    ORDER BY lb.rank
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get player portfolio (all tokens for an address)
CREATE OR REPLACE FUNCTION get_player_portfolio(
    p_owner_address TEXT,
    p_game_id INTEGER DEFAULT NULL,
    p_status TEXT DEFAULT 'all'  -- 'all', 'active', 'completed'
)
RETURNS TABLE (
    token_id BIGINT,
    game_id INTEGER,
    game_name TEXT,
    player_name TEXT,
    current_score BIGINT,
    game_over BOOLEAN,
    completed_all_objectives BOOLEAN,
    rank INTEGER,
    minted_at TIMESTAMP WITH TIME ZONE,
    last_updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.token_id,
        t.game_id,
        g.name AS game_name,
        t.player_name,
        t.current_score,
        t.game_over,
        t.completed_all_objectives,
        lb.rank,
        t.minted_at,
        t.last_updated_at
    FROM tokens t
    LEFT JOIN games g ON t.game_id = g.game_id
    LEFT JOIN game_leaderboards_mv lb ON t.token_id = lb.token_id
    WHERE t.owner_address = p_owner_address
      AND (p_game_id IS NULL OR t.game_id = p_game_id)
      AND (
          p_status = 'all'
          OR (p_status = 'active' AND t.game_over = FALSE)
          OR (p_status = 'completed' AND t.game_over = TRUE)
      )
    ORDER BY t.last_updated_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get token detail with score history
CREATE OR REPLACE FUNCTION get_token_detail(
    p_token_id BIGINT,
    p_history_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    token_id BIGINT,
    game_id INTEGER,
    game_name TEXT,
    minter_id BIGINT,
    minter_name TEXT,
    settings_id INTEGER,
    owner_address TEXT,
    player_name TEXT,
    current_score BIGINT,
    rank INTEGER,
    game_over BOOLEAN,
    completed_all_objectives BOOLEAN,
    soulbound BOOLEAN,
    objectives_count SMALLINT,
    minted_at TIMESTAMP WITH TIME ZONE,
    last_updated_at TIMESTAMP WITH TIME ZONE,
    score_history JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.token_id,
        t.game_id,
        g.name AS game_name,
        t.minted_by AS minter_id,
        m.name AS minter_name,
        t.settings_id,
        t.owner_address,
        t.player_name,
        t.current_score,
        lb.rank,
        t.game_over,
        t.completed_all_objectives,
        t.soulbound,
        t.objectives_count,
        t.minted_at,
        t.last_updated_at,
        COALESCE(
            (SELECT jsonb_agg(
                jsonb_build_object(
                    'score', sh.score,
                    'block_number', sh.block_number,
                    'timestamp', sh.block_timestamp
                ) ORDER BY sh.block_timestamp DESC
            )
            FROM score_history sh
            WHERE sh.token_id = t.token_id
            LIMIT p_history_limit),
            '[]'::JSONB
        ) AS score_history
    FROM tokens t
    LEFT JOIN games g ON t.game_id = g.game_id
    LEFT JOIN minters m ON t.minted_by = m.minter_id
    LEFT JOIN game_leaderboards_mv lb ON t.token_id = lb.token_id
    WHERE t.token_id = p_token_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Search players by name (fuzzy search)
CREATE OR REPLACE FUNCTION search_players(
    p_search_term TEXT,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    token_id BIGINT,
    game_id INTEGER,
    game_name TEXT,
    owner_address TEXT,
    player_name TEXT,
    current_score BIGINT,
    rank INTEGER,
    similarity_score REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.token_id,
        t.game_id,
        g.name AS game_name,
        t.owner_address,
        t.player_name,
        t.current_score,
        lb.rank,
        similarity(t.player_name, p_search_term) AS similarity_score
    FROM tokens t
    LEFT JOIN games g ON t.game_id = g.game_id
    LEFT JOIN game_leaderboards_mv lb ON t.token_id = lb.token_id
    WHERE t.player_name IS NOT NULL
      AND t.player_name % p_search_term  -- Trigram similarity match
    ORDER BY similarity(t.player_name, p_search_term) DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get game statistics
CREATE OR REPLACE FUNCTION get_game_stats(p_game_id INTEGER)
RETURNS TABLE (
    game_id INTEGER,
    game_name TEXT,
    total_tokens INTEGER,
    completed_games INTEGER,
    active_games INTEGER,
    avg_score NUMERIC,
    high_score BIGINT,
    median_score NUMERIC,
    unique_players INTEGER,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gs.game_id,
        g.name AS game_name,
        gs.total_tokens::INTEGER,
        gs.completed_games::INTEGER,
        gs.active_games::INTEGER,
        gs.avg_score,
        gs.high_score,
        gs.median_score,
        gs.unique_players::INTEGER,
        gs.last_activity
    FROM game_stats_mv gs
    LEFT JOIN games g ON gs.game_id = g.game_id
    WHERE gs.game_id = p_game_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- CLEANUP / MAINTENANCE FUNCTIONS
-- ============================================================================

-- Clean up old score history (keep last N per token)
CREATE OR REPLACE FUNCTION cleanup_score_history(
    p_keep_count INTEGER DEFAULT 1000
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY token_id
                   ORDER BY block_timestamp DESC
               ) AS rn
        FROM score_history
    ),
    to_delete AS (
        SELECT id FROM ranked WHERE rn > p_keep_count
    )
    DELETE FROM score_history
    WHERE id IN (SELECT id FROM to_delete);

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean up old token events (keep last N days)
CREATE OR REPLACE FUNCTION cleanup_token_events(
    p_keep_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM token_events
    WHERE block_timestamp < NOW() - (p_keep_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PERFORMANCE MONITORING
-- ============================================================================

-- Get slow queries from pg_stat_statements (if enabled)
CREATE OR REPLACE FUNCTION get_slow_queries(p_min_ms NUMERIC DEFAULT 100)
RETURNS TABLE (
    query TEXT,
    calls BIGINT,
    total_time_ms NUMERIC,
    mean_time_ms NUMERIC,
    max_time_ms NUMERIC
) AS $$
BEGIN
    -- This requires pg_stat_statements extension
    IF EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
    ) THEN
        RETURN QUERY
        SELECT
            pss.query,
            pss.calls,
            ROUND(pss.total_exec_time::NUMERIC, 2) AS total_time_ms,
            ROUND(pss.mean_exec_time::NUMERIC, 2) AS mean_time_ms,
            ROUND(pss.max_exec_time::NUMERIC, 2) AS max_time_ms
        FROM pg_stat_statements pss
        WHERE pss.mean_exec_time > p_min_ms
        ORDER BY pss.mean_exec_time DESC
        LIMIT 20;
    ELSE
        RAISE NOTICE 'pg_stat_statements extension not installed';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
/*
Real-time Subscription Example (Node.js):

const { Client } = require('pg');
const client = new Client(connectionString);
await client.connect();

// Subscribe to score updates
client.on('notification', (msg) => {
    if (msg.channel === 'score_updates') {
        const payload = JSON.parse(msg.payload);
        console.log('Score update:', payload);
        // Update UI, broadcast to WebSocket clients, etc.
    }
});

await client.query('LISTEN score_updates');
await client.query('LISTEN leaderboard_changes');
await client.query('LISTEN game_over_events');

// For player-specific filtering:
client.on('notification', (msg) => {
    if (msg.channel === 'player_activity') {
        const payload = JSON.parse(msg.payload);
        if (payload.owner_address === targetAddress) {
            // Handle player's activity
        }
    }
});

await client.query('LISTEN player_activity');


Scheduled Tasks:

-- Refresh leaderboards with notifications every 30 seconds
SELECT cron.schedule('refresh-leaderboards', '*/30 * * * * *',
    'SELECT refresh_leaderboard_with_notifications()');

-- Cleanup old data weekly
SELECT cron.schedule('cleanup-history', '0 3 * * 0',
    'SELECT cleanup_score_history(1000); SELECT cleanup_token_events(30);');


Query Examples:

-- Get leaderboard
SELECT * FROM get_leaderboard(1, 100, 0);

-- Get player portfolio
SELECT * FROM get_player_portfolio('0x123...', NULL, 'all');

-- Get token detail with history
SELECT * FROM get_token_detail(12345, 50);

-- Search players
SELECT * FROM search_players('alice', 10);

-- Get game stats
SELECT * FROM get_game_stats(1);
*/
