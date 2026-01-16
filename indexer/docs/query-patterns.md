# Query Patterns for Denshokan Indexer

This document describes the common query patterns for the Denshokan game indexer database and their optimized implementations.

## Table of Contents

1. [Leaderboard Queries](#1-leaderboard-queries)
2. [Player Portfolio](#2-player-portfolio)
3. [Token Detail](#3-token-detail)
4. [Player Name Search](#4-player-name-search)
5. [Recent Activity](#5-recent-activity)
6. [Game Statistics](#6-game-statistics)
7. [Real-time Subscriptions](#7-real-time-subscriptions)

---

## 1. Leaderboard Queries

### Use Case
Display top scores for a specific game, ordered by score descending.

### Target Performance
- < 50ms for top 100 results
- < 100ms for top 1000 results

### Recommended Query

Use the materialized view for best performance:

```sql
-- Using materialized view (fastest)
SELECT rank, token_id, owner_address, player_name, score
FROM game_leaderboards_mv
WHERE game_id = $1
ORDER BY rank
LIMIT 100
OFFSET 0;
```

Or use the helper function:

```sql
SELECT * FROM get_leaderboard(1, 100, 0);  -- game_id, limit, offset
```

### Index Used
```sql
idx_leaderboards_mv_game_rank ON game_leaderboards_mv (game_id, rank)
```

### Notes
- The materialized view `game_leaderboards_mv` pre-computes rankings
- Refresh every 30 seconds: `SELECT refresh_leaderboards();`
- For real-time accuracy, use the base table with partial index:
  ```sql
  SELECT token_id, owner_address, player_name, current_score
  FROM tokens
  WHERE game_id = $1 AND game_over = TRUE
  ORDER BY current_score DESC
  LIMIT 100;
  ```

---

## 2. Player Portfolio

### Use Case
Show all tokens owned by a specific address, optionally filtered by game or completion status.

### Target Performance
- < 50ms for typical player (< 100 tokens)
- < 200ms for power users (1000+ tokens)

### Recommended Query

Use the helper function:

```sql
-- All tokens for a player
SELECT * FROM get_player_portfolio('0x1234...', NULL, 'all');

-- Tokens for specific game
SELECT * FROM get_player_portfolio('0x1234...', 1, 'all');

-- Only active games
SELECT * FROM get_player_portfolio('0x1234...', NULL, 'active');

-- Only completed games
SELECT * FROM get_player_portfolio('0x1234...', NULL, 'completed');
```

Or direct query:

```sql
SELECT
    t.token_id,
    t.game_id,
    g.name AS game_name,
    t.player_name,
    t.current_score,
    t.game_over,
    lb.rank,
    t.last_updated_at
FROM tokens t
LEFT JOIN games g ON t.game_id = g.game_id
LEFT JOIN game_leaderboards_mv lb ON t.token_id = lb.token_id
WHERE t.owner_address = $1
ORDER BY t.last_updated_at DESC;
```

### Index Used
```sql
idx_tokens_owner_portfolio ON tokens (owner_address, game_id, last_updated_at DESC)
```

---

## 3. Token Detail

### Use Case
Display complete token information including game metadata, minter info, and score history.

### Target Performance
- < 100ms including 100 score history entries

### Recommended Query

Use the helper function:

```sql
SELECT * FROM get_token_detail(12345, 100);  -- token_id, history_limit
```

This returns:
- Token metadata
- Game name
- Minter name
- Current rank (from leaderboard)
- Score history as JSONB array

### Direct Query Pattern

```sql
SELECT
    t.*,
    g.name AS game_name,
    m.name AS minter_name,
    lb.rank,
    (SELECT jsonb_agg(
        jsonb_build_object(
            'score', sh.score,
            'block_number', sh.block_number,
            'timestamp', sh.block_timestamp
        ) ORDER BY sh.block_timestamp DESC
    )
    FROM score_history sh
    WHERE sh.token_id = t.token_id
    LIMIT 100) AS score_history
FROM tokens t
LEFT JOIN games g ON t.game_id = g.game_id
LEFT JOIN minters m ON t.minted_by = m.minter_id
LEFT JOIN game_leaderboards_mv lb ON t.token_id = lb.token_id
WHERE t.token_id = $1;
```

### Indexes Used
- Primary key lookup on `tokens.token_id` (unique constraint)
- `idx_score_history_token_time` for score history

---

## 4. Player Name Search

### Use Case
Find tokens/players by partial name match (fuzzy search).

### Target Performance
- < 100ms for typical searches

### Recommended Query

Use the helper function:

```sql
SELECT * FROM search_players('alice', 20);  -- search_term, limit
```

Or direct query with trigram similarity:

```sql
SELECT
    t.token_id,
    t.game_id,
    t.player_name,
    t.current_score,
    similarity(t.player_name, 'alice') AS match_score
FROM tokens t
WHERE t.player_name % 'alice'  -- Trigram match
ORDER BY similarity(t.player_name, 'alice') DESC
LIMIT 20;
```

### ILIKE Pattern (slower but more flexible)

```sql
SELECT token_id, player_name, current_score
FROM tokens
WHERE player_name ILIKE '%alice%'
ORDER BY current_score DESC
LIMIT 20;
```

### Index Used
```sql
idx_tokens_player_name_trgm ON tokens USING gin (player_name gin_trgm_ops)
    WHERE player_name IS NOT NULL
```

### Prerequisites
Requires `pg_trgm` extension:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

---

## 5. Recent Activity

### Use Case
Show the most recently updated tokens across all games.

### Target Performance
- < 50ms for last 100 entries

### Recommended Query

Use the view:

```sql
SELECT * FROM recent_activity_v;  -- Returns last 100
```

Or with custom limit:

```sql
SELECT
    t.token_id,
    t.game_id,
    g.name AS game_name,
    t.owner_address,
    t.player_name,
    t.current_score,
    t.game_over,
    t.last_updated_at
FROM tokens t
LEFT JOIN games g ON t.game_id = g.game_id
ORDER BY t.last_updated_at DESC
LIMIT 50;
```

### For Recent Activity in Last 7 Days

```sql
SELECT *
FROM tokens
WHERE last_updated_at > NOW() - INTERVAL '7 days'
ORDER BY last_updated_at DESC
LIMIT 100;
```

### Index Used
```sql
-- BRIN for large time-range scans
idx_tokens_updated_brin ON tokens USING brin (last_updated_at)

-- B-tree for recent data (partial index)
idx_tokens_updated_btree ON tokens (last_updated_at DESC)
    WHERE last_updated_at > NOW() - INTERVAL '7 days'
```

---

## 6. Game Statistics

### Use Case
Display aggregate statistics for a game (total players, average score, etc.).

### Target Performance
- < 20ms (materialized view lookup)

### Recommended Query

Use the helper function:

```sql
SELECT * FROM get_game_stats(1);  -- game_id
```

Or query the materialized view directly:

```sql
SELECT
    gs.*,
    g.name AS game_name,
    g.description
FROM game_stats_mv gs
LEFT JOIN games g ON gs.game_id = g.game_id
WHERE gs.game_id = $1;
```

### All Games Statistics

```sql
SELECT
    gs.*,
    g.name AS game_name
FROM game_stats_mv gs
LEFT JOIN games g ON gs.game_id = g.game_id
ORDER BY gs.total_tokens DESC;
```

### Refresh Statistics

```sql
SELECT refresh_statistics();  -- Every 5 minutes recommended
```

---

## 7. Real-time Subscriptions

### Use Case
Push updates to clients when scores change or games complete.

### Available Channels

| Channel | Description | Payload |
|---------|-------------|---------|
| `token_updates` | All token changes | Full token state |
| `score_updates` | Score changes only | token_id, old_score, new_score, delta |
| `game_over_events` | Game completions | token_id, final_score |
| `leaderboard_changes` | Rank changes | token_id, old_rank, new_rank |
| `new_tokens` | New mints | Full token state |
| `player_activity` | All events (filter by address) | Full token state |

### Subscription Example (Node.js)

```javascript
const { Client } = require('pg');

async function subscribeToScores() {
    const client = new Client(process.env.DATABASE_URL);
    await client.connect();

    client.on('notification', (msg) => {
        const payload = JSON.parse(msg.payload);

        switch (msg.channel) {
            case 'score_updates':
                console.log(`Score update: Token ${payload.token_id}`);
                console.log(`  ${payload.old_score} -> ${payload.new_score}`);
                break;

            case 'leaderboard_changes':
                console.log(`Rank change: Token ${payload.token_id}`);
                console.log(`  Rank ${payload.old_rank} -> ${payload.new_rank}`);
                break;

            case 'game_over_events':
                console.log(`Game over: Token ${payload.token_id}`);
                console.log(`  Final score: ${payload.final_score}`);
                break;
        }
    });

    // Subscribe to channels
    await client.query('LISTEN score_updates');
    await client.query('LISTEN leaderboard_changes');
    await client.query('LISTEN game_over_events');

    console.log('Subscribed to real-time updates');
}
```

### Player-Specific Filtering

```javascript
const targetAddress = '0x1234...';

client.on('notification', (msg) => {
    if (msg.channel === 'player_activity') {
        const payload = JSON.parse(msg.payload);
        if (payload.owner_address === targetAddress) {
            // Handle this player's activity
            handlePlayerUpdate(payload);
        }
    }
});

await client.query('LISTEN player_activity');
```

### Leaderboard with Notifications

To get rank change notifications, use the special refresh function:

```sql
-- Instead of regular refresh
SELECT refresh_leaderboard_with_notifications();
```

This:
1. Refreshes the materialized view
2. Detects rank changes
3. Sends notifications for each change
4. Updates the rank cache

---

## Performance Tips

### 1. Use Materialized Views

For read-heavy workloads, prefer materialized views over base tables:

```sql
-- Good: Uses pre-computed view
SELECT * FROM game_leaderboards_mv WHERE game_id = 1;

-- Slower: Computes on each query
SELECT *, RANK() OVER (...) FROM tokens WHERE game_id = 1;
```

### 2. Limit History Queries

Always limit score history fetches:

```sql
-- Good: Limits subquery
SELECT * FROM get_token_detail(123, 100);

-- Bad: Fetches all history
SELECT * FROM score_history WHERE token_id = 123;
```

### 3. Use Partial Indexes

Queries on subsets benefit from partial indexes:

```sql
-- Uses partial index (game_over = TRUE)
SELECT * FROM tokens WHERE game_id = 1 AND game_over = TRUE;

-- May not use optimal index
SELECT * FROM tokens WHERE game_id = 1;
```

### 4. Batch Pagination

For large result sets, use keyset pagination:

```sql
-- Better: Keyset pagination
SELECT * FROM tokens
WHERE (last_updated_at, token_id) < ($last_time, $last_id)
ORDER BY last_updated_at DESC, token_id DESC
LIMIT 100;

-- Slower at high offsets
SELECT * FROM tokens
ORDER BY last_updated_at DESC
LIMIT 100 OFFSET 10000;
```

### 5. Connection Pooling

Use connection pooling for real-time subscriptions:
- Main pool: Regular queries
- Dedicated connections: LISTEN/NOTIFY (long-lived)
