# Denshokan

Game token contracts and indexer for Starknet. Denshokan (伝承館) means "Hall of Legends" - a place where game achievements are preserved.

## Project Structure

```
denshokan/
├── contracts/         # Cairo smart contracts (Scarb 2.15.0)
├── indexer/           # Apibara event indexer (TypeScript)
├── api/               # Hono REST API + WebSocket server
└── client/            # React frontend (MUI 7, Cartridge Controller)
```

## Quick Commands

### Contracts

```bash
cd contracts
scarb build                     # Compile contracts
snforge test                    # Run all tests
snforge test test_name          # Run specific test
snforge test -x                 # Stop on first failure
scarb fmt -w                    # Format code
```

### Indexer

```bash
cd indexer
npm run dev                     # Start indexer (dev mode)
npm run db:generate             # Generate migrations from schema
npm run db:migrate              # Run migrations
npm run db:studio               # Open Drizzle Studio
```

### API

```bash
cd api
npm run dev                     # Start API server (watch mode)
npm run build                   # Compile TypeScript
```

### Client

```bash
cd client
npm run dev                     # Start Vite dev server
npm run build                   # Production build
```

## Architecture

### Contracts (`contracts/`)

The token contract uses the **game-components** library for modular composition:

- **CoreTokenComponent** - Base ERC721 with game lifecycle (mint, score, game over)
- **MinterComponent** - Minter registration and authorization
- **ObjectivesComponent** - Game objective tracking
- **SettingsComponent** - Per-game settings definitions
- **ContextComponent** - Mutable token context data
- **RendererComponent** - Custom token URI rendering

**Key Files:**
- `src/denshokan.cairo` - Main token contract (ERC721 + game components)
- `src/minigame_registry.cairo` - Game registration contract
- `src/tic_tac_toe.cairo`, `src/number_guess.cairo` - Example minigames

**Packed Token ID:**
Token IDs are felt252 values with immutable data packed into the ID itself:
- game_id, minted_by, settings_id, minted_at
- start_delay, end_delay, objective_id
- soulbound, has_context, paymaster flags
- tx_hash, salt, metadata

This allows efficient storage and querying without additional lookups.

### Indexer (`indexer/`)

Apibara-based indexer using `@apibara/indexer` with Drizzle ORM:

**Events Indexed:**
- `Transfer` - Token mints and transfers
- `ScoreUpdate` - Score changes
- `GameOver` - Game completion
- `TokenPlayerNameUpdate`, `TokenClientUrlUpdate`
- `MinterRegistryUpdate`, `GameRegistryUpdate`
- `ObjectiveCreated`, `SettingsCreated`

**Database Schema (`src/lib/schema.ts`):**
- `tokens` - Current token state with decoded packed ID fields
- `score_history` - Historical score snapshots
- `games` - Game registry cache
- `minters` - Minter registry cache
- `token_events` - Audit log of all events
- `game_leaderboards` - Pre-computed rankings
- `objectives`, `settings` - Game configuration

**Configuration:** Set via `apibara.config.ts`:
- `contractAddress` - Denshokan token contract
- `registryAddress` - MinigameRegistry contract
- `streamUrl` - Apibara DNA stream URL
- `startingBlock` - Block to start indexing from

### API (`api/`)

Hono-based REST API with WebSocket support:

**Routes:**
- `GET /tokens` - List tokens with filtering
- `GET /tokens/:id` - Token details
- `GET /games` - List registered games
- `GET /games/:id` - Game details with stats
- `GET /players/:address` - Player portfolio
- `GET /activity/*` - Recent activity and stats
- `GET /minters` - List registered minters
- `WS /ws` - Real-time event subscriptions

**Stack:** Hono, Drizzle ORM, PostgreSQL, Node WebSocket

### Client (`client/`)

React frontend with Cartridge Controller integration:

**Stack:**
- React 18 with TypeScript
- MUI 7 for components
- Framer Motion for animations
- `@starknet-react/core` + `@cartridge/controller` for wallet
- `@provable-games/denshokan-sdk` for contract interactions

**Key Patterns:**
- `contexts/` - StarknetProvider, ControllerContext
- `hooks/` - useGameList, useTokenDetail, useLeaderboard, etc.
- `components/` - Organized by feature (games/, tokens/, mint/, etc.)
- `pages/` - Route components

## Dependencies

### game-components Library

The contracts depend on [game-components](https://github.com/Provable-Games/game-components):

```toml
game_components_token = { git = "...", branch = "next" }
game_components_metagame = { git = "...", branch = "next" }
game_components_minigame = { git = "...", branch = "next" }
game_components_registry = { git = "...", branch = "next" }
```

Use Context7 MCP to query current documentation when working with these.

### OpenZeppelin Cairo

```toml
openzeppelin_token = { git = "...", tag = "v3.0.0" }
openzeppelin_introspection = { git = "...", tag = "v3.0.0" }
```

## Testing

### Unit Tests (`contracts/tests/unit/`)

Test individual contract functions in isolation:

```bash
snforge test unit::              # Run all unit tests
snforge test test_mint           # Run specific test
```

### Integration Tests (`contracts/tests/integration/`)

Test contract interactions, often using fork testing:

```bash
snforge test integration::       # Run integration tests
```

### Fork Testing

Configured in `snfoundry.toml`:

```toml
[[tool.snforge.fork]]
name = "MAINNET_LATEST"
url = "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10"
block_id.tag = "latest"
```

Use `#[fork("MAINNET_LATEST")]` attribute on tests.

## Deployment

### Contract Deployment

```bash
cd contracts
cp .env.example .env
# Edit .env: PROFILE=sepolia, ROYALTY_RECEIVER=0x...
./scripts/deploy_denshokan.sh
```

Deployments saved to `contracts/deployments/`.

### Indexer Deployment

Configure environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `DENSHOKAN_CONTRACT_ADDRESS` - Token contract address
- `DENSHOKAN_REGISTRY_ADDRESS` - Registry contract address
- `APIBARA_STREAM_URL` - DNA stream URL
- `STARTING_BLOCK` - Block number to start from

## RPC Endpoints

Use Cartridge's RPC:
- Mainnet: `https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10`
- Sepolia: `https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10`

## Key Patterns

### Adding a New Event

1. Add event selector to `indexer/src/lib/decoder.ts`
2. Create decoder function for the event
3. Handle event in `indexer/indexers/denshokan.indexer.ts`
4. Update schema if new data needs persistence
5. Run `npm run db:generate` and `npm run db:migrate`

### Adding an API Endpoint

1. Create or modify route in `api/src/routes/`
2. Use Drizzle queries against shared schema
3. Add rate limiting if needed in `api/src/index.ts`

### Adding a Client Feature

1. Create hook in `client/src/hooks/` for data fetching
2. Create components in `client/src/components/`
3. Wire up in page component under `client/src/pages/`

## Environment Files

Each package has `.env.example` templates:
- `contracts/.env.example` - Deployment config
- `indexer/.env` - Database and stream config
- `api/.env` - Port and TLS config
- `client/.env.example` - API URL and contract addresses

## Agent Usage

For Cairo contract development tasks (`contracts/`), prefer using the `cairo-dev` agent:
- Contract modifications and new features
- Testing with snforge
- Gas optimization
- Component integration

The `cairo-dev` agent has specialized knowledge of Cairo 2.13.1+, Scarb, OpenZeppelin Cairo contracts, and Starknet patterns.
