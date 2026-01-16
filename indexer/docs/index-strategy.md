# Index Strategy for Denshokan

## Overview

This document describes the indexing strategy for the Denshokan game token database. The strategy is designed to optimize for common query patterns while minimizing storage overhead and write amplification.

## Index Types Used

### 1. B-Tree Indexes (Default)
Standard indexes for equality and range queries. Used for:
- Primary key lookups
- Foreign key relationships
- Sorted results with ORDER BY

### 2. Partial Indexes
Indexes that only include rows matching a predicate. Reduces index size and improves performance for filtered queries.

**Examples:**
```sql
-- Only index completed games for leaderboards
CREATE INDEX idx_tokens_leaderboard ON tokens (game_id, current_score DESC)
    WHERE game_over = TRUE;

-- Only index active games
CREATE INDEX idx_tokens_active_games ON tokens (game_id, token_id)
    WHERE game_over = FALSE;
```

**Benefits:**
- Smaller index size (often 30-50% reduction)
- Faster scans for filtered queries
- Less write overhead (only updates when predicate matches)

### 3. GIN (Generalized Inverted Index)
Used for full-text search and trigram matching.

**Example:**
```sql
-- Enable trigram matching for player name search
CREATE INDEX idx_tokens_player_name_trgm ON tokens
    USING gin (player_name gin_trgm_ops)
    WHERE player_name IS NOT NULL;
```

**Use Cases:**
- `ILIKE '%search%'` queries
- Fuzzy matching
- Auto-complete suggestions

### 4. BRIN (Block Range INdex)
Efficient for append-mostly data with natural ordering (timestamps).

**Example:**
```sql
-- Very small index for time-ordered data
CREATE INDEX idx_tokens_updated_brin ON tokens
    USING brin (last_updated_at)
    WITH (pages_per_range = 32);
```

**Benefits:**
- 1000x smaller than B-tree for large tables
- Perfect for timestamp columns
- Low maintenance overhead

## Query Pattern Analysis

### Leaderboard Queries

**Pattern:**
```sql
SELECT * FROM tokens
WHERE game_id = $1 AND game_over = TRUE
ORDER BY current_score DESC
LIMIT 100;
```

**Index:**
```sql
CREATE INDEX idx_tokens_leaderboard ON tokens (game_id, current_score DESC)
    WHERE game_over = TRUE;
```

**Expected Performance:** < 50ms

### Player Portfolio

**Pattern:**
```sql
SELECT * FROM tokens
WHERE owner_address = $1
ORDER BY last_updated_at DESC;
```

**Index:**
```sql
CREATE INDEX idx_tokens_owner_portfolio ON tokens
    (owner_address, game_id, last_updated_at DESC);
```

**Expected Performance:** < 50ms

### Token Detail with Score History

**Pattern:**
```sql
SELECT t.*,
       (SELECT json_agg(row_to_json(sh.*) ORDER BY sh.block_timestamp DESC)
        FROM score_history sh
        WHERE sh.token_id = t.token_id
        LIMIT 100) as score_history
FROM tokens t
WHERE t.token_id = $1;
```

**Indexes:**
```sql
CREATE INDEX idx_score_history_token_block ON score_history
    (token_id, block_number DESC);
CREATE INDEX idx_score_history_token_time ON score_history
    (token_id, block_timestamp DESC);
```

**Expected Performance:** < 100ms

### Player Name Search

**Pattern:**
```sql
SELECT * FROM tokens
WHERE player_name ILIKE '%search%'
LIMIT 20;
```

**Index:**
```sql
-- Requires pg_trgm extension
CREATE INDEX idx_tokens_player_name_trgm ON tokens
    USING gin (player_name gin_trgm_ops)
    WHERE player_name IS NOT NULL;
```

**Expected Performance:** < 100ms for short searches

## Index Maintenance

### Monitoring

Check index usage:
```sql
SELECT
    schemaname,
    relname AS table_name,
    indexrelname AS index_name,
    idx_scan AS times_used,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

Find unused indexes:
```sql
SELECT
    indexrelname AS index_name,
    relname AS table_name,
    idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan < 50
ORDER BY idx_scan;
```

### Bloat Detection

Monitor index bloat:
```sql
SELECT
    nspname AS schema_name,
    relname AS table_name,
    indexrelname AS index_name,
    round(100 * pg_relation_size(indexrelid) /
          nullif(pg_relation_size(indexrelid) + pg_relation_size(relid), 0), 2) AS index_ratio
FROM pg_stat_user_indexes
ORDER BY index_ratio DESC;
```

### Reindexing

For heavily updated tables, periodically reindex:
```sql
-- Concurrent reindex (PostgreSQL 12+)
REINDEX INDEX CONCURRENTLY idx_tokens_leaderboard;

-- Or rebuild all indexes on a table
REINDEX TABLE CONCURRENTLY tokens;
```

## Write Performance Considerations

### Index Count Impact
Each index adds overhead to INSERT/UPDATE operations:
- B-tree: ~10-20% overhead per index
- GIN: ~30-50% overhead (batch updates recommended)
- BRIN: ~1-5% overhead (very low)

### Current Index Count
- `tokens` table: 10 indexes
- `score_history` table: 3 indexes
- `token_events` table: 5 indexes

### Optimization Tips
1. Use partial indexes to reduce write amplification
2. Batch GIN updates with `gin_pending_list_limit`
3. Use BRIN for timestamp columns in append-only scenarios
4. Drop unused indexes (check `pg_stat_user_indexes`)

## Materialized Views vs Indexes

For expensive aggregations (leaderboards, stats), we use materialized views instead of complex indexes:

**Materialized Views:**
```sql
CREATE MATERIALIZED VIEW game_leaderboards AS
SELECT
    game_id,
    token_id,
    owner_address,
    player_name,
    current_score,
    RANK() OVER (PARTITION BY game_id ORDER BY current_score DESC) as rank
FROM tokens
WHERE game_over = TRUE;
```

**Refresh Strategy:**
- Refresh concurrently every 5-15 minutes
- Or trigger refresh on significant score changes
- Use `CONCURRENTLY` to avoid blocking reads

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY game_leaderboards;
```

## Real-Time Updates with NOTIFY

For real-time subscriptions, use PostgreSQL LISTEN/NOTIFY instead of polling:

```sql
-- Trigger on score changes
CREATE OR REPLACE FUNCTION notify_score_update()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('score_updates', json_build_object(
        'token_id', NEW.token_id,
        'game_id', NEW.game_id,
        'score', NEW.current_score
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This avoids index overhead for real-time queries.

## Summary

| Query Type | Index Strategy | Expected Latency |
|------------|---------------|------------------|
| Leaderboard | Partial B-tree | < 50ms |
| Player Portfolio | Composite B-tree | < 50ms |
| Player Name Search | GIN (trigram) | < 100ms |
| Recent Activity | BRIN + Partial B-tree | < 50ms |
| Token + History | Composite B-tree | < 100ms |

All indexes use `CONCURRENTLY` for online creation without blocking writes.
