# Real-Time Subscription Guide

This guide covers implementing real-time subscriptions for the Game Components Indexer API using PostgreSQL LISTEN/NOTIFY and various client protocols.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Apibara        │     │   PostgreSQL     │     │   API Server    │
│  Indexer        │────>│   LISTEN/NOTIFY  │────>│  (gRPC/WS/SSE)  │
│                 │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │    Clients      │
                        │  (Subscribe)    │
                        └─────────────────┘
```

The real-time pipeline works as follows:

1. **Apibara Indexer** processes Starknet events and writes to PostgreSQL
2. **PostgreSQL Triggers** emit NOTIFY events on data changes
3. **API Server** listens for NOTIFY events and broadcasts to subscribers
4. **Clients** receive updates via their chosen protocol (WebSocket, gRPC streams, SSE)

## PostgreSQL NOTIFY Setup

### 1. Create Notification Functions

```sql
-- migrations/005_notifications.sql

-- Generic notification helper
CREATE OR REPLACE FUNCTION notify_change(
    channel TEXT,
    payload JSONB
) RETURNS void AS $$
BEGIN
    PERFORM pg_notify(channel, payload::text);
END;
$$ LANGUAGE plpgsql;

-- Token score update notification
CREATE OR REPLACE FUNCTION notify_score_update()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    payload := jsonb_build_object(
        'event_type', 'score_update',
        'token_id', NEW.token_id::text,
        'game_id', NEW.game_id,
        'previous_score', OLD.current_score,
        'new_score', NEW.current_score,
        'owner', NEW.owner_address,
        'player_name', NEW.player_name,
        'timestamp', NOW()
    );

    -- Notify on multiple channels for different subscription patterns
    PERFORM pg_notify('token_updates', payload::text);
    PERFORM pg_notify('game_' || NEW.game_id || '_updates', payload::text);
    PERFORM pg_notify('player_' || MD5(NEW.owner_address), payload::text);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Game over notification
CREATE OR REPLACE FUNCTION notify_game_over()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    -- Only notify on transition from active to game_over
    IF NEW.game_over = TRUE AND OLD.game_over = FALSE THEN
        payload := jsonb_build_object(
            'event_type', 'game_over',
            'token_id', NEW.token_id::text,
            'game_id', NEW.game_id,
            'final_score', NEW.current_score,
            'completed_all_objectives', NEW.completed_all_objectives,
            'owner', NEW.owner_address,
            'player_name', NEW.player_name,
            'timestamp', NOW()
        );

        PERFORM pg_notify('token_updates', payload::text);
        PERFORM pg_notify('game_' || NEW.game_id || '_updates', payload::text);
        PERFORM pg_notify('game_over_events', payload::text);
        PERFORM pg_notify('player_' || MD5(NEW.owner_address), payload::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Token mint notification
CREATE OR REPLACE FUNCTION notify_token_minted()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    payload := jsonb_build_object(
        'event_type', 'mint',
        'token_id', NEW.token_id::text,
        'game_id', NEW.game_id,
        'owner', NEW.owner_address,
        'minted_by', NEW.minted_by,
        'settings_id', NEW.settings_id,
        'soulbound', NEW.soulbound,
        'timestamp', NOW()
    );

    PERFORM pg_notify('token_mints', payload::text);
    PERFORM pg_notify('game_' || NEW.game_id || '_mints', payload::text);
    PERFORM pg_notify('player_' || MD5(NEW.owner_address), payload::text);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Leaderboard change notification
CREATE OR REPLACE FUNCTION notify_leaderboard_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
    old_rank INTEGER;
    new_rank INTEGER;
    change_type TEXT;
BEGIN
    old_rank := OLD.rank;
    new_rank := NEW.rank;

    IF OLD.rank IS NULL AND NEW.rank IS NOT NULL THEN
        change_type := 'ENTERED';
    ELSIF OLD.rank IS NOT NULL AND NEW.rank IS NULL THEN
        change_type := 'REMOVED';
    ELSIF NEW.rank < OLD.rank THEN
        change_type := 'MOVED_UP';
    ELSIF NEW.rank > OLD.rank THEN
        change_type := 'MOVED_DOWN';
    ELSE
        change_type := 'SCORE_ONLY';
    END IF;

    payload := jsonb_build_object(
        'event_type', 'leaderboard_change',
        'game_id', NEW.game_id,
        'token_id', NEW.token_id::text,
        'change_type', change_type,
        'old_rank', old_rank,
        'new_rank', new_rank,
        'score', NEW.score,
        'owner', NEW.owner_address,
        'player_name', NEW.player_name,
        'timestamp', NOW()
    );

    PERFORM pg_notify('leaderboard_' || NEW.game_id, payload::text);

    -- Special notification for top 10 changes
    IF COALESCE(new_rank, 11) <= 10 OR COALESCE(old_rank, 11) <= 10 THEN
        PERFORM pg_notify('leaderboard_' || NEW.game_id || '_top10', payload::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Owner transfer notification
CREATE OR REPLACE FUNCTION notify_owner_change()
RETURNS TRIGGER AS $$
DECLARE
    payload JSONB;
BEGIN
    IF NEW.owner_address IS DISTINCT FROM OLD.owner_address THEN
        payload := jsonb_build_object(
            'event_type', 'transfer',
            'token_id', NEW.token_id::text,
            'game_id', NEW.game_id,
            'from_address', OLD.owner_address,
            'to_address', NEW.owner_address,
            'timestamp', NOW()
        );

        PERFORM pg_notify('token_updates', payload::text);
        -- Notify both old and new owner
        PERFORM pg_notify('player_' || MD5(OLD.owner_address), payload::text);
        PERFORM pg_notify('player_' || MD5(NEW.owner_address), payload::text);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2. Create Triggers

```sql
-- Score update trigger
CREATE TRIGGER score_update_notify
AFTER UPDATE OF current_score ON tokens
FOR EACH ROW
WHEN (OLD.current_score IS DISTINCT FROM NEW.current_score)
EXECUTE FUNCTION notify_score_update();

-- Game over trigger
CREATE TRIGGER game_over_notify
AFTER UPDATE OF game_over ON tokens
FOR EACH ROW
EXECUTE FUNCTION notify_game_over();

-- Mint trigger
CREATE TRIGGER token_minted_notify
AFTER INSERT ON tokens
FOR EACH ROW
EXECUTE FUNCTION notify_token_minted();

-- Owner transfer trigger
CREATE TRIGGER owner_change_notify
AFTER UPDATE OF owner_address ON tokens
FOR EACH ROW
EXECUTE FUNCTION notify_owner_change();

-- Leaderboard change trigger (on materialized view refresh)
CREATE TRIGGER leaderboard_change_notify
AFTER INSERT OR UPDATE ON game_leaderboards
FOR EACH ROW
EXECUTE FUNCTION notify_leaderboard_change();
```

### 3. Notification Channels

| Channel Pattern | Description | Use Case |
|-----------------|-------------|----------|
| `token_updates` | All token updates | Global token monitoring |
| `game_{id}_updates` | Updates for a specific game | Game-specific dashboards |
| `game_{id}_mints` | New mints for a game | Game analytics |
| `player_{hash}` | Updates for a specific player | Player dashboards |
| `leaderboard_{id}` | Leaderboard changes | Leaderboard UI |
| `leaderboard_{id}_top10` | Top 10 changes only | Compact leaderboard |
| `token_mints` | All new mints | Global mint feed |
| `game_over_events` | All game completions | Analytics |

## Server-Side Implementation

### Node.js with pg-listen

```typescript
// src/subscriptions/postgres-listener.ts
import createSubscriber from 'pg-listen';
import { EventEmitter } from 'events';

interface NotificationPayload {
  event_type: string;
  token_id: string;
  game_id: number;
  [key: string]: any;
}

export class PostgresSubscriptionManager extends EventEmitter {
  private subscriber: ReturnType<typeof createSubscriber>;
  private activeChannels: Set<string> = new Set();

  constructor(databaseUrl: string) {
    super();
    this.subscriber = createSubscriber({ connectionString: databaseUrl });

    this.subscriber.notifications.on('*', (channel, payload) => {
      this.emit(channel, JSON.parse(payload as string));
    });

    this.subscriber.events.on('error', (error) => {
      console.error('PostgreSQL subscription error:', error);
      this.emit('error', error);
    });

    this.subscriber.events.on('reconnect', () => {
      console.log('PostgreSQL subscription reconnected');
      // Re-subscribe to all active channels
      this.resubscribeAll();
    });
  }

  async connect(): Promise<void> {
    await this.subscriber.connect();
    console.log('PostgreSQL subscription manager connected');
  }

  async subscribeToChannel(channel: string): Promise<void> {
    if (!this.activeChannels.has(channel)) {
      await this.subscriber.listenTo(channel);
      this.activeChannels.add(channel);
      console.log(`Subscribed to channel: ${channel}`);
    }
  }

  async unsubscribeFromChannel(channel: string): Promise<void> {
    if (this.activeChannels.has(channel)) {
      await this.subscriber.unlisten(channel);
      this.activeChannels.delete(channel);
      console.log(`Unsubscribed from channel: ${channel}`);
    }
  }

  private async resubscribeAll(): Promise<void> {
    for (const channel of this.activeChannels) {
      await this.subscriber.listenTo(channel);
    }
  }

  // Helper methods for common subscription patterns
  async subscribeToToken(tokenId: string): Promise<void> {
    await this.subscribeToChannel('token_updates');
  }

  async subscribeToGame(gameId: number): Promise<void> {
    await this.subscribeToChannel(`game_${gameId}_updates`);
  }

  async subscribeToLeaderboard(gameId: number, topOnly = false): Promise<void> {
    const channel = topOnly
      ? `leaderboard_${gameId}_top10`
      : `leaderboard_${gameId}`;
    await this.subscribeToChannel(channel);
  }

  async subscribeToPlayer(address: string): Promise<void> {
    const hash = crypto.createHash('md5').update(address).digest('hex');
    await this.subscribeToChannel(`player_${hash}`);
  }

  async close(): Promise<void> {
    await this.subscriber.close();
  }
}
```

### Subscription Router

```typescript
// src/subscriptions/subscription-router.ts
import { PostgresSubscriptionManager } from './postgres-listener';

interface Subscriber {
  id: string;
  filters: SubscriptionFilters;
  send: (event: any) => void;
}

interface SubscriptionFilters {
  tokenIds?: string[];
  gameIds?: number[];
  playerAddress?: string;
  eventTypes?: string[];
}

export class SubscriptionRouter {
  private manager: PostgresSubscriptionManager;
  private subscribers: Map<string, Subscriber> = new Map();
  private channelSubscribers: Map<string, Set<string>> = new Map();

  constructor(databaseUrl: string) {
    this.manager = new PostgresSubscriptionManager(databaseUrl);
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Route token updates to appropriate subscribers
    this.manager.on('token_updates', (payload) => {
      this.routeToSubscribers('token_updates', payload);
    });

    // Route game-specific updates
    this.manager.on('*', (channel, payload) => {
      if (channel.startsWith('game_') || channel.startsWith('leaderboard_')) {
        this.routeToSubscribers(channel, payload);
      }
    });
  }

  private routeToSubscribers(channel: string, payload: any): void {
    const subscriberIds = this.channelSubscribers.get(channel);
    if (!subscriberIds) return;

    for (const subscriberId of subscriberIds) {
      const subscriber = this.subscribers.get(subscriberId);
      if (subscriber && this.matchesFilters(payload, subscriber.filters)) {
        subscriber.send(payload);
      }
    }
  }

  private matchesFilters(payload: any, filters: SubscriptionFilters): boolean {
    // Check token ID filter
    if (filters.tokenIds && filters.tokenIds.length > 0) {
      if (!filters.tokenIds.includes(payload.token_id)) return false;
    }

    // Check game ID filter
    if (filters.gameIds && filters.gameIds.length > 0) {
      if (!filters.gameIds.includes(payload.game_id)) return false;
    }

    // Check event type filter
    if (filters.eventTypes && filters.eventTypes.length > 0) {
      if (!filters.eventTypes.includes(payload.event_type)) return false;
    }

    return true;
  }

  async addSubscriber(
    subscriber: Subscriber,
    channels: string[]
  ): Promise<void> {
    this.subscribers.set(subscriber.id, subscriber);

    for (const channel of channels) {
      // Add to channel subscriber list
      if (!this.channelSubscribers.has(channel)) {
        this.channelSubscribers.set(channel, new Set());
        // Subscribe to channel on first subscriber
        await this.manager.subscribeToChannel(channel);
      }
      this.channelSubscribers.get(channel)!.add(subscriber.id);
    }
  }

  async removeSubscriber(subscriberId: string): Promise<void> {
    this.subscribers.delete(subscriberId);

    // Clean up channel subscriptions
    for (const [channel, subscribers] of this.channelSubscribers) {
      subscribers.delete(subscriberId);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channel);
        await this.manager.unsubscribeFromChannel(channel);
      }
    }
  }
}
```

## Client Implementations

### WebSocket (Browser)

```typescript
// client/websocket-client.ts
interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe';
  subscription: {
    tokenIds?: string[];
    gameIds?: number[];
    playerAddress?: string;
    eventTypes?: string[];
  };
}

class GameComponentsWebSocket {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions: SubscriptionMessage['subscription'][] = [];

  constructor(
    private url: string,
    private onEvent: (event: any) => void
  ) {
    this.connect();
  }

  private connect(): void {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      // Re-subscribe after reconnect
      this.resubscribe();
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.onEvent(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect(), delay);
    }
  }

  private resubscribe(): void {
    for (const subscription of this.subscriptions) {
      this.send({ type: 'subscribe', subscription });
    }
  }

  private send(message: SubscriptionMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  subscribeToToken(tokenId: string): void {
    const subscription = { tokenIds: [tokenId] };
    this.subscriptions.push(subscription);
    this.send({ type: 'subscribe', subscription });
  }

  subscribeToGame(gameId: number): void {
    const subscription = { gameIds: [gameId] };
    this.subscriptions.push(subscription);
    this.send({ type: 'subscribe', subscription });
  }

  subscribeToLeaderboard(gameId: number): void {
    const subscription = {
      gameIds: [gameId],
      eventTypes: ['leaderboard_change']
    };
    this.subscriptions.push(subscription);
    this.send({ type: 'subscribe', subscription });
  }

  subscribeToPlayer(address: string): void {
    const subscription = { playerAddress: address };
    this.subscriptions.push(subscription);
    this.send({ type: 'subscribe', subscription });
  }

  close(): void {
    this.ws.close();
  }
}

// Usage
const client = new GameComponentsWebSocket(
  'wss://api.gamecomponents.io/ws',
  (event) => {
    console.log('Received event:', event);
    // Update UI based on event type
    switch (event.event_type) {
      case 'score_update':
        updateScoreDisplay(event.token_id, event.new_score);
        break;
      case 'leaderboard_change':
        updateLeaderboard(event.game_id);
        break;
      // ... handle other event types
    }
  }
);

// Subscribe to updates
client.subscribeToToken('123456...');
client.subscribeToLeaderboard(1);
```

### gRPC Streaming (Node.js)

```typescript
// client/grpc-client.ts
import * as grpc from '@grpc/grpc-js';
import { GameServiceClient } from './generated/game_service_grpc_pb';
import { TokenSubscription, LeaderboardSubscription } from './generated/game_service_pb';

class GrpcSubscriptionClient {
  private client: GameServiceClient;

  constructor(address: string) {
    this.client = new GameServiceClient(
      address,
      grpc.credentials.createInsecure()
    );
  }

  subscribeToTokenUpdates(
    tokenIds: string[],
    onUpdate: (event: any) => void,
    onError: (error: Error) => void
  ): () => void {
    const request = new TokenSubscription();
    request.setTokenIdsList(tokenIds);
    request.setIncludeInitialState(true);

    const stream = this.client.subscribeTokenUpdates(request);

    stream.on('data', (response) => {
      onUpdate(response.toObject());
    });

    stream.on('error', (error) => {
      onError(error);
    });

    stream.on('end', () => {
      console.log('Token updates stream ended');
    });

    // Return cancel function
    return () => stream.cancel();
  }

  subscribeToLeaderboard(
    gameId: number,
    topN: number,
    onUpdate: (event: any) => void,
    onError: (error: Error) => void
  ): () => void {
    const request = new LeaderboardSubscription();
    request.setGameId(gameId);
    request.setTopN(topN);
    request.setIncludeInitialState(true);

    const stream = this.client.subscribeLeaderboard(request);

    stream.on('data', (response) => {
      onUpdate(response.toObject());
    });

    stream.on('error', (error) => {
      onError(error);
    });

    // Return cancel function
    return () => stream.cancel();
  }
}

// Usage
const client = new GrpcSubscriptionClient('api.gamecomponents.io:50051');

const cancelToken = client.subscribeToTokenUpdates(
  ['123456...', '789012...'],
  (event) => console.log('Token update:', event),
  (error) => console.error('Error:', error)
);

const cancelLeaderboard = client.subscribeToLeaderboard(
  1, // gameId
  100, // top 100
  (event) => console.log('Leaderboard update:', event),
  (error) => console.error('Error:', error)
);

// Cleanup
// cancelToken();
// cancelLeaderboard();
```

### GraphQL Subscriptions

```typescript
// client/graphql-client.ts
import { createClient, Client, SubscribePayload } from 'graphql-ws';

class GraphQLSubscriptionClient {
  private client: Client;

  constructor(url: string) {
    this.client = createClient({
      url,
      connectionParams: {
        // Optional: auth token
        // authToken: 'your-token'
      },
      retryAttempts: 5,
      retryWait: async (retries) => {
        // Exponential backoff
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retries)));
      }
    });
  }

  subscribeToToken(
    tokenId: string,
    onData: (data: any) => void
  ): () => void {
    return this.client.subscribe(
      {
        query: `
          subscription TokenUpdates($tokenId: TokenID!) {
            tokenUpdated(tokenId: $tokenId) {
              tokenId
              eventType
              timestamp
              token {
                currentScore
                rank
                gameOver
              }
              payload {
                ... on ScoreUpdatePayload {
                  previousScore
                  newScore
                  newRank
                }
                ... on GameOverPayload {
                  finalScore
                  completedAllObjectives
                }
              }
            }
          }
        `,
        variables: { tokenId }
      },
      {
        next: (data) => onData(data.data),
        error: (error) => console.error('Subscription error:', error),
        complete: () => console.log('Subscription completed')
      }
    );
  }

  subscribeToLeaderboard(
    gameId: number,
    topN: number,
    onData: (data: any) => void
  ): () => void {
    return this.client.subscribe(
      {
        query: `
          subscription LeaderboardChanges($gameId: Int!, $topN: Int) {
            leaderboardChanged(gameId: $gameId, topN: $topN) {
              gameId
              timestamp
              changes {
                tokenId
                changeType
                oldRank
                newRank
                score
                playerName
              }
              newLeader {
                rank
                tokenId
                score
                playerName
              }
            }
          }
        `,
        variables: { gameId, topN }
      },
      {
        next: (data) => onData(data.data),
        error: (error) => console.error('Subscription error:', error),
        complete: () => console.log('Subscription completed')
      }
    );
  }

  subscribeToPlayerActivity(
    address: string,
    onData: (data: any) => void
  ): () => void {
    return this.client.subscribe(
      {
        query: `
          subscription PlayerActivity($address: Address!) {
            playerActivity(address: $address) {
              tokenId
              gameId
              eventType
              timestamp
              data {
                ... on MintActivityData {
                  settingsId
                  soulbound
                }
                ... on ScoreActivityData {
                  previousScore
                  newScore
                }
                ... on GameOverActivityData {
                  finalScore
                  completedAllObjectives
                }
              }
            }
          }
        `,
        variables: { address }
      },
      {
        next: (data) => onData(data.data),
        error: (error) => console.error('Subscription error:', error),
        complete: () => console.log('Subscription completed')
      }
    );
  }

  dispose(): void {
    this.client.dispose();
  }
}

// Usage
const client = new GraphQLSubscriptionClient('wss://api.gamecomponents.io/graphql');

const unsubscribe = client.subscribeToLeaderboard(
  1,
  10,
  (data) => {
    const { leaderboardChanged } = data;
    console.log('Leaderboard changes:', leaderboardChanged.changes);
    if (leaderboardChanged.newLeader) {
      console.log('New leader:', leaderboardChanged.newLeader);
    }
  }
);

// Cleanup
// unsubscribe();
// client.dispose();
```

## Best Practices

### 1. Connection Management

- Always implement reconnection logic with exponential backoff
- Re-subscribe to all active subscriptions after reconnecting
- Use connection heartbeats to detect stale connections

### 2. Filter Optimization

- Subscribe to the most specific channel possible (game-specific vs global)
- Use client-side filtering only for additional refinement
- Unsubscribe when components unmount to reduce server load

### 3. State Management

- Request initial state when subscribing (`include_initial_state: true`)
- Handle out-of-order messages gracefully
- Use sequence numbers or timestamps to detect missed events

### 4. Error Handling

- Distinguish between recoverable and non-recoverable errors
- Log errors with enough context for debugging
- Notify users of connection issues appropriately

### 5. Performance

- Batch multiple subscriptions into single connections
- Debounce UI updates for high-frequency events
- Use pagination for initial state loads

## Monitoring

### PostgreSQL Metrics

```sql
-- Check active listeners
SELECT * FROM pg_stat_activity
WHERE state = 'active'
AND query LIKE '%LISTEN%';

-- Check notification queue
SELECT * FROM pg_notification;

-- Monitor notification rate (requires pg_stat_statements)
SELECT
    substring(query, 1, 50) as query_prefix,
    calls,
    total_time,
    mean_time
FROM pg_stat_statements
WHERE query LIKE '%pg_notify%'
ORDER BY calls DESC;
```

### Application Metrics

Track these metrics for monitoring subscription health:

| Metric | Description |
|--------|-------------|
| `subscription_active_count` | Number of active subscriptions |
| `subscription_messages_sent_total` | Total messages sent to subscribers |
| `subscription_connect_total` | Total connection attempts |
| `subscription_disconnect_total` | Total disconnections |
| `subscription_error_total` | Total subscription errors |
| `postgres_notify_latency_ms` | Time from NOTIFY to client delivery |
