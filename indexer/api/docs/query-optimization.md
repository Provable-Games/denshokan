# Query Optimization Guide

This guide covers performance optimization strategies for the Game Components Indexer API, ensuring sub-50ms response times for common query patterns.

## Performance Targets

| Query Type | Target Latency | 95th Percentile |
|------------|----------------|-----------------|
| Single token lookup | < 10ms | < 20ms |
| Leaderboard (top 100) | < 30ms | < 50ms |
| Player tokens | < 30ms | < 50ms |
| Game statistics | < 10ms | < 20ms |
| Full-text search | < 50ms | < 100ms |

## Database Index Strategy

### Primary Indexes

These indexes are created during initial schema migration:

```sql
-- Primary key indexes (automatic)
-- tokens(token_id), games(game_id), minters(minter_id)

-- Leaderboard queries: top scores per game
CREATE INDEX idx_tokens_game_score ON tokens (game_id, current_score DESC)
    WHERE game_over = TRUE;

-- Active games lookup
CREATE INDEX idx_tokens_active ON tokens (game_id, token_id)
    WHERE game_over = FALSE;

-- Player portfolio queries
CREATE INDEX idx_tokens_owner ON tokens (owner_address, game_id);

-- Recent activity
CREATE INDEX idx_tokens_updated ON tokens (last_updated_at DESC);
```

### Secondary Indexes (Query-Specific)

```sql
-- Player name search (requires pg_trgm extension)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_tokens_player_name_trgm ON tokens
    USING gin (player_name gin_trgm_ops)
    WHERE player_name IS NOT NULL;

-- Score history lookups
CREATE INDEX idx_score_history_token_time ON score_history
    (token_id, block_timestamp DESC);

-- Composite index for filtered leaderboard queries
CREATE INDEX idx_tokens_leaderboard_composite ON tokens
    (game_id, game_over, current_score DESC, token_id)
    INCLUDE (owner_address, player_name);

-- Time-based queries
CREATE INDEX idx_tokens_minted_at ON tokens (minted_at DESC);
CREATE INDEX idx_tokens_game_minted ON tokens (game_id, minted_at DESC);
```

### Partial Indexes

Partial indexes dramatically improve performance for filtered queries:

```sql
-- Only index completed games for leaderboard
CREATE INDEX idx_completed_games ON tokens (game_id, current_score DESC)
    WHERE game_over = TRUE;

-- Only index active games
CREATE INDEX idx_active_games ON tokens (game_id, minted_at DESC)
    WHERE game_over = FALSE;

-- Soulbound tokens only
CREATE INDEX idx_soulbound_tokens ON tokens (game_id, owner_address)
    WHERE soulbound = TRUE;

-- High score tokens (top performers)
CREATE INDEX idx_high_score_tokens ON tokens (game_id, current_score DESC)
    WHERE current_score > 1000 AND game_over = TRUE;
```

## Materialized Views

### Leaderboard View

```sql
CREATE MATERIALIZED VIEW game_leaderboards AS
SELECT
    game_id,
    token_id,
    owner_address,
    player_name,
    current_score AS score,
    RANK() OVER (PARTITION BY game_id ORDER BY current_score DESC) as rank,
    last_updated_at
FROM tokens
WHERE game_over = TRUE
WITH DATA;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX idx_leaderboard_game_token ON game_leaderboards (game_id, token_id);
CREATE INDEX idx_leaderboard_game_rank ON game_leaderboards (game_id, rank);
CREATE INDEX idx_leaderboard_token ON game_leaderboards (token_id);
```

### Game Statistics View

```sql
CREATE MATERIALIZED VIEW game_stats AS
SELECT
    game_id,
    COUNT(*) as total_tokens,
    COUNT(*) FILTER (WHERE game_over = TRUE) as completed_games,
    COUNT(*) FILTER (WHERE game_over = FALSE) as active_games,
    ROUND(AVG(current_score) FILTER (WHERE game_over = TRUE), 2) as avg_score,
    MAX(current_score) as high_score,
    COUNT(DISTINCT owner_address) as unique_players,
    NOW() as computed_at
FROM tokens
GROUP BY game_id
WITH DATA;

CREATE UNIQUE INDEX idx_game_stats_id ON game_stats (game_id);
```

### Player Statistics View

```sql
CREATE MATERIALIZED VIEW player_stats AS
SELECT
    owner_address as address,
    COUNT(*) as total_tokens,
    COUNT(DISTINCT game_id) as games_played,
    COUNT(*) FILTER (WHERE game_over = TRUE) as completed_games,
    COUNT(*) FILTER (WHERE game_over = FALSE) as active_games,
    SUM(current_score) FILTER (WHERE game_over = TRUE) as total_score,
    NOW() as computed_at
FROM tokens
GROUP BY owner_address
WITH DATA;

CREATE UNIQUE INDEX idx_player_stats_address ON player_stats (address);
```

### Refresh Strategy

```sql
-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS TABLE(view_name TEXT, duration_ms NUMERIC) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
BEGIN
    -- Refresh leaderboards (most critical)
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_leaderboards;
    end_time := clock_timestamp();
    view_name := 'game_leaderboards';
    duration_ms := EXTRACT(MILLISECONDS FROM end_time - start_time);
    RETURN NEXT;

    -- Refresh game stats
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_stats;
    end_time := clock_timestamp();
    view_name := 'game_stats';
    duration_ms := EXTRACT(MILLISECONDS FROM end_time - start_time);
    RETURN NEXT;

    -- Refresh player stats
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY player_stats;
    end_time := clock_timestamp();
    view_name := 'player_stats';
    duration_ms := EXTRACT(MILLISECONDS FROM end_time - start_time);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh (via pg_cron or application scheduler)
-- Recommended: Every 30 seconds for leaderboards, 5 minutes for stats
```

## Optimized Query Patterns

### Token Detail Query

```sql
-- Optimized single token lookup with all related data
SELECT
    t.token_id,
    t.game_id,
    t.minted_by,
    t.settings_id,
    t.minted_at,
    t.lifecycle_start,
    t.lifecycle_end,
    t.objectives_count,
    t.soulbound,
    t.has_context,
    t.sequence_number,
    t.game_over,
    t.completed_all_objectives,
    t.owner_address,
    t.player_name,
    t.current_score,
    t.last_updated_at,
    g.name as game_name,
    g.contract_address as game_contract,
    m.name as minter_name,
    m.contract_address as minter_contract,
    lb.rank
FROM tokens t
LEFT JOIN games g ON t.game_id = g.game_id
LEFT JOIN minters m ON t.minted_by = m.minter_id
LEFT JOIN game_leaderboards lb ON t.token_id = lb.token_id AND t.game_id = lb.game_id
WHERE t.token_id = $1;

-- Expected: < 5ms with proper indexes
```

### Leaderboard Query

```sql
-- Use materialized view for best performance
SELECT
    rank,
    token_id,
    owner_address,
    player_name,
    score
FROM game_leaderboards
WHERE game_id = $1
ORDER BY rank
LIMIT $2 OFFSET $3;

-- Expected: < 10ms
```

### Player Tokens Query

```sql
-- Optimized player portfolio with game info
SELECT
    t.token_id,
    t.game_id,
    g.name as game_name,
    t.owner_address,
    t.player_name,
    t.current_score,
    t.game_over,
    t.soulbound,
    t.minted_at,
    t.last_updated_at
FROM tokens t
JOIN games g ON t.game_id = g.game_id
WHERE t.owner_address = $1
    AND ($2::integer IS NULL OR t.game_id = $2)
    AND ($3::boolean IS NULL OR t.game_over = $3)
ORDER BY t.last_updated_at DESC
LIMIT $4 OFFSET $5;

-- Expected: < 20ms with index on owner_address
```

### Score History Query

```sql
-- Efficient score history with limit
SELECT
    score,
    block_number,
    block_timestamp
FROM score_history
WHERE token_id = $1
ORDER BY block_timestamp DESC
LIMIT $2;

-- Expected: < 5ms with composite index
```

### Game Statistics Query

```sql
-- Use materialized view
SELECT
    game_id,
    total_tokens,
    completed_games,
    active_games,
    avg_score,
    high_score,
    unique_players
FROM game_stats
WHERE game_id = $1;

-- Expected: < 2ms
```

## Caching Strategy

### Application-Level Cache

```typescript
// cache-config.ts
interface CacheConfig {
  // Token data - medium TTL, invalidate on updates
  token: {
    ttl: 30, // seconds
    invalidateOn: ['score_update', 'game_over', 'transfer']
  },

  // Leaderboard - short TTL, frequent updates
  leaderboard: {
    ttl: 10, // seconds
    maxEntries: 1000
  },

  // Game stats - longer TTL, from materialized view
  gameStats: {
    ttl: 60, // seconds
  },

  // Player stats - medium TTL
  playerStats: {
    ttl: 30, // seconds
  }
}
```

### Cache Invalidation

```typescript
// Invalidate on PostgreSQL NOTIFY
subscriptionManager.on('token_updates', (payload) => {
  const { token_id, event_type } = payload;

  // Invalidate token cache
  cache.delete(`token:${token_id}`);

  // Invalidate related leaderboard
  cache.delete(`leaderboard:${payload.game_id}`);

  // Invalidate player cache
  cache.delete(`player:${payload.owner}`);
});
```

### CDN Caching

For public endpoints, use CDN caching with appropriate headers:

```typescript
// Response headers for cacheable endpoints
const cacheHeaders = {
  // Leaderboard - cache briefly, stale-while-revalidate
  'GET /games/:gameId/leaderboard': {
    'Cache-Control': 'public, max-age=10, stale-while-revalidate=30',
    'Vary': 'Accept-Encoding'
  },

  // Game stats - cache longer
  'GET /games/:gameId/stats': {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=120'
  },

  // Token detail - short cache, may change frequently
  'GET /tokens/:tokenId': {
    'Cache-Control': 'public, max-age=5, stale-while-revalidate=10'
  },

  // Player tokens - private, user-specific
  'GET /players/:address/tokens': {
    'Cache-Control': 'private, max-age=10'
  }
};
```

## Query Plan Analysis

### Using EXPLAIN ANALYZE

```sql
-- Always analyze slow queries
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM tokens
WHERE game_id = 1 AND game_over = TRUE
ORDER BY current_score DESC
LIMIT 100;

-- Look for:
-- - Index Scan vs Seq Scan
-- - Buffer hits vs reads
-- - Actual vs estimated rows
```

### Common Issues and Solutions

| Issue | Symptom | Solution |
|-------|---------|----------|
| Sequential scan | High buffer reads | Add appropriate index |
| Index not used | Seq Scan despite index | Check index selectivity, update statistics |
| Sort operation | High execution time | Add sorted index |
| Nested loop | Exponential time | Add join indexes |
| Memory spill | Temp files used | Increase work_mem, optimize query |

## Connection Pooling

### PgBouncer Configuration

```ini
[databases]
gamecomponents = host=localhost port=5432 dbname=gamecomponents

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = md5
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 50
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
server_lifetime = 3600
server_idle_timeout = 600
```

### Application Pool Settings

```typescript
// drizzle pool configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum connections
  min: 5,  // Minimum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10 second query timeout
});
```

## Monitoring Queries

### Slow Query Log

```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 100; -- Log queries > 100ms
SELECT pg_reload_conf();
```

### Query Statistics

```sql
-- Top 10 slowest queries
SELECT
    substring(query, 1, 100) as query_preview,
    calls,
    round(total_time::numeric, 2) as total_ms,
    round(mean_time::numeric, 2) as mean_ms,
    round(max_time::numeric, 2) as max_ms
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;

-- Most called queries
SELECT
    substring(query, 1, 100) as query_preview,
    calls,
    round(total_time::numeric, 2) as total_ms,
    round((total_time / calls)::numeric, 2) as avg_ms
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 10;
```

### Index Usage

```sql
-- Unused indexes
SELECT
    schemaname || '.' || relname as table,
    indexrelname as index,
    pg_size_pretty(pg_relation_size(i.indexrelid)) as size,
    idx_scan as scans
FROM pg_stat_user_indexes ui
JOIN pg_index i ON ui.indexrelid = i.indexrelid
WHERE idx_scan < 50
AND schemaname NOT LIKE 'pg_%'
ORDER BY pg_relation_size(i.indexrelid) DESC;

-- Missing indexes (tables with seq scans)
SELECT
    schemaname || '.' || relname as table,
    seq_scan,
    seq_tup_read,
    idx_scan,
    n_live_tup as rows
FROM pg_stat_user_tables
WHERE seq_scan > idx_scan
AND n_live_tup > 10000
ORDER BY seq_tup_read DESC;
```

## Load Testing

### Benchmark Queries

```bash
# Using pgbench
pgbench -c 50 -j 4 -T 60 -f leaderboard_query.sql gamecomponents

# leaderboard_query.sql
\set game_id random(1, 10)
SELECT rank, token_id, score, player_name
FROM game_leaderboards
WHERE game_id = :game_id
ORDER BY rank
LIMIT 100;
```

### Expected Throughput

| Query Type | Target QPS | Connections |
|------------|-----------|-------------|
| Token lookup | 5000 | 50 |
| Leaderboard | 2000 | 50 |
| Player tokens | 1000 | 50 |
| Statistics | 3000 | 20 |

## Recommendations Summary

1. **Use materialized views** for leaderboards and statistics
2. **Create partial indexes** for common filter combinations
3. **Implement connection pooling** with PgBouncer
4. **Cache aggressively** at application and CDN level
5. **Monitor query performance** with pg_stat_statements
6. **Refresh materialized views** based on update frequency
7. **Use EXPLAIN ANALYZE** to verify query plans
8. **Set appropriate timeouts** to prevent runaway queries
