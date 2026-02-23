# Denshokan

Game token contracts and indexer for Starknet. Denshokan (伝承館) means "Hall of Legends" - a place where game achievements are preserved.

## Project Structure

```
denshokan/
├── contracts/              # Cairo smart contracts (Scarb workspace)
│   ├── Scarb.toml          # Workspace config (Cairo 2.15.0, Scarb 2.15.0)
│   ├── snfoundry.toml      # sncast profiles only
│   ├── packages/
│   │   ├── interfaces/     # denshokan_interfaces - Filter traits & structs
│   │   ├── token/          # denshokan_token - Main ERC721 token contract
│   │   ├── viewer/         # denshokan_viewer - Filter/query API contract
│   │   ├── registry/       # denshokan_registry - Game registration contract
│   │   ├── games/          # denshokan_games - Number guess & tic-tac-toe
│   │   └── testing/        # denshokan_testing - Shared test helpers
│   ├── scripts/            # Deployment scripts
│   └── deployments/        # Deployment artifacts
├── indexer/                # Apibara event indexer (TypeScript)
├── api/                    # Hono REST API + WebSocket server
├── client/                 # React frontend (MUI 7, Cartridge Controller)
├── docker-compose.yml      # PostgreSQL, indexer, API services
├── package.json            # npm workspaces root (indexer, api)
├── railway.toml            # Railway deployment config
└── render.yaml             # Render deployment config
```

## Quick Commands

Commands can be run from the root via workspace scripts or from each package directory.

### Root (workspace scripts)

```bash
npm run build                   # Build contracts + indexer + API
npm run test                    # Run contract tests
npm run fmt                     # Format Cairo code
npm run dev:api                 # Start API dev server
npm run dev:indexer              # Start indexer dev mode
npm run dev:client               # Start client dev server
npm run db:migrate               # Run database migrations
npm run db:generate              # Generate migrations from schema
```

### Contracts

```bash
cd contracts
scarb build                          # Compile all packages
snforge test                         # Run all tests (all packages)
snforge test -p denshokan_token      # Run token package tests
snforge test -p denshokan_viewer     # Run viewer package tests
snforge test -p denshokan_registry   # Run registry package tests
snforge test -p denshokan_games      # Run games package tests
snforge test test_name               # Run specific test
snforge test -x                      # Stop on first failure
scarb fmt --check --workspace        # Check formatting (all packages)
scarb fmt -w                         # Format code
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

### Docker

```bash
docker-compose up -d postgres   # Start PostgreSQL only
docker-compose up -d            # Start all services (postgres, indexer, API)
```

### Environment Sync

```bash
./scripts/sync-env.sh            # Sync contract addresses to client + indexer .env files
./scripts/sync-env.sh --dry-run  # Preview changes
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

**Workspace Packages:**
- `packages/interfaces/` - `denshokan_interfaces` - Filter traits, structs (IDenshokanFilter, IDenshokanSettingsObjectives)
- `packages/token/` - `denshokan_token` - Main ERC721 token contract (denshokan.cairo)
- `packages/viewer/` - `denshokan_viewer` - Filter/query API contract (denshokan_viewer.cairo)
- `packages/registry/` - `denshokan_registry` - Game registration contract (minigame_registry.cairo)
- `packages/games/` - `denshokan_games` - Minigames (number_guess.cairo, tic_tac_toe.cairo)
- `packages/testing/` - `denshokan_testing` - Shared test helpers (constants, deploy utilities)

**Deployment Scripts (`scripts/`):**
- `deploy_denshokan.sh` - Deploy Denshokan token + registry + viewer
- `deploy_number_guess.sh` - Deploy number guess minigame
- `deploy_tic_tac_toe.sh` - Deploy tic-tac-toe minigame
- `deploy_template_games.sh` - Deploy template games

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
- `game_stats` - Aggregated per-game statistics
- `objectives`, `settings` - Game configuration

**Configuration:** Set via `apibara.config.ts`:
- `contractAddress` - Denshokan token contract
- `registryAddress` - MinigameRegistry contract
- `streamUrl` - Apibara DNA stream URL
- `startingBlock` - Block to start indexing from

### API (`api/`)

Hono-based REST API with WebSocket support. Supports optional TLS (auto-detects certs).

**Routes:**
- `GET /tokens` - List tokens with filtering and pagination
- `GET /tokens/:id` - Token details
- `GET /games` - List registered games with pagination
- `GET /games/:id` - Game details with stats
- `GET /players/:address` - Player portfolio
- `GET /activity/*` - Recent activity and stats
- `GET /minters` - List registered minters
- `GET /health` - Health check (includes DB status)
- `WS /ws` - Real-time event subscriptions

**Middleware:** CORS, rate limiting (100 req/window default, 30 for `/activity/stats`)

**Stack:** Hono, Drizzle ORM, PostgreSQL, Node WebSocket

### Client (`client/`)

React frontend with Cartridge Controller integration:

**Stack:**
- React 18 with TypeScript
- MUI 7 (`@mui/material` + `@mui/icons-material`) for components
- Framer Motion for animations
- `@starknet-react/core` + `@cartridge/controller` for wallet
- `@provable-games/denshokan-sdk` for contract interactions
- notistack for notifications
- Vite with WASM + top-level await + mkcert plugins

**Pages (routes):**
- `/` - Home page
- `/games` - Game browser
- `/games/:gameId` - Game detail
- `/mint` - Mint new token
- `/tokens/:tokenId` - Token detail
- `/tokens/:tokenId/play` - Number guess play page
- `/portfolio` - Player's token collection

**Key Patterns:**
- `contexts/` - StarknetProvider, ControllerContext
- `hooks/` - useGameList, useGameDetail, useTokenDetail, usePlayerPortfolio, useMint, useNumberGuess, useNumberGuessConfig, useWebSocket
- `components/` - Organized by feature (games/, tokens/, mint/, leaderboard/, numberguess/, common/)
- `pages/` - Route components
- `abi/` - Contract ABIs (denshokan.json, numberGuess.json)
- `utils/` - packed-token-id decoder, starknet helpers

## Dependencies

### game-components Library

The contracts depend on [game-components](https://github.com/Provable-Games/game-components):

```toml
game_components_token = { git = "...", branch = "next" }
game_components_metagame = { git = "...", branch = "next" }
game_components_minigame = { git = "...", branch = "next" }
game_components_registry = { git = "...", branch = "next" }
game_components_utils = { git = "...", branch = "next" }
game_components_test_common = { git = "...", branch = "next" }  # dev
```

Use Context7 MCP to query current documentation when working with these.

### OpenZeppelin Cairo (v3.0.0)

```toml
openzeppelin_token = { git = "...", tag = "v3.0.0" }
openzeppelin_introspection = { git = "...", tag = "v3.0.0" }
openzeppelin_interfaces = { git = "...", tag = "v3.0.0" }
openzeppelin_access = { git = "...", tag = "v3.0.0" }
openzeppelin_upgrades = { git = "...", tag = "v3.0.0" }
```

### Starknet Foundry

- `snforge_std` v0.55.0 (dev dependency)
- Fuzzer runs: 256
- Fork configs: `MAINNET_LATEST`, `SEPOLIA_LATEST`

## Testing

Tests are co-located with each package under `packages/<name>/src/tests/`.

### Per-Package Testing

```bash
cd contracts
snforge test -p denshokan_token      # Token: test_denshokan, test_erc721_hooks, test_royalties, test_token_uri, test_full_workflow
snforge test -p denshokan_viewer     # Viewer: test_filter
snforge test -p denshokan_registry   # Registry: test_minigame_registry
snforge test -p denshokan_games      # Games: test_number_guess, test_tic_tac_toe
```

### Shared Test Helpers (`denshokan_testing`)

The `denshokan_testing` package provides shared constants and deploy utilities used by all test packages. It does NOT depend on any `denshokan_*` contract package (uses string-based `declare()` calls).

- `helpers::constants` - OWNER, ALICE, BOB, CHARLIE, GAME_CREATOR, royalty constants
- `helpers::setup` - TestContracts, deploy_minigame_registry, deploy_mock_game, deploy_denshokan, setup_with_registry

### Fork Testing

Configured in workspace `Scarb.toml`:

```toml
[[workspace.tool.snforge.fork]]
name = "MAINNET_LATEST"
url = "https://api.cartridge.gg/x/starknet/mainnet/rpc/v0_10"
block_id.tag = "latest"

[[workspace.tool.snforge.fork]]
name = "SEPOLIA_LATEST"
url = "https://api.cartridge.gg/x/starknet/sepolia/rpc/v0_10"
block_id.tag = "latest"
```

Use `#[fork("MAINNET_LATEST")]` or `#[fork("SEPOLIA_LATEST")]` attribute on tests.

## Deployment

### Contract Deployment

```bash
cd contracts
cp .env.example .env
# Edit .env: PROFILE=sepolia, ROYALTY_RECEIVER=0x...
./scripts/deploy_denshokan.sh
```

Deployments saved to `contracts/deployments/`.

Additional deployment scripts:
- `./scripts/deploy_number_guess.sh`
- `./scripts/deploy_tic_tac_toe.sh`
- `./scripts/deploy_template_games.sh`

### Syncing Environment Variables

After deploying contracts, sync addresses to all `.env` files:

```bash
./scripts/sync-env.sh            # Apply updates
./scripts/sync-env.sh --dry-run  # Preview changes without writing
```

Source of truth is `contracts/.env`. The script updates:
- `client/.env` — `VITE_DENSHOKAN_ADDRESS`, `VITE_REGISTRY_ADDRESS`, `VITE_VIEWER_ADDRESS`
- `indexer/.env` — `CONTRACT_ADDRESS`, `REGISTRY_CONTRACT_ADDRESS`

### Indexer Deployment

Configure environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `DENSHOKAN_CONTRACT_ADDRESS` - Token contract address
- `DENSHOKAN_REGISTRY_ADDRESS` - Registry contract address
- `APIBARA_STREAM_URL` - DNA stream URL
- `STARTING_BLOCK` - Block number to start from

### API Deployment

Configure environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Allowed CORS origin
- `TLS_CERT`, `TLS_KEY` - Optional TLS certificate paths

### Client Deployment

Configure environment variables:
- `VITE_NETWORK` - `mainnet` or `sepolia`
- `VITE_API_URL` - API server URL
- `VITE_WS_URL` - WebSocket server URL
- `VITE_DENSHOKAN_ADDRESS` - Denshokan token contract address
- `VITE_REGISTRY_ADDRESS` - MinigameRegistry contract address
- `VITE_VIEWER_ADDRESS` - DenshokanViewer contract address
- `VITE_RPC_URL` - Optional RPC URL (defaults to Cartridge)

## RPC Endpoints

Use Cartridge's RPC:
- Mainnet: `https://api.cartridge.gg/x/starknet/mainnet`
- Sepolia: `https://api.cartridge.gg/x/starknet/sepolia`

## Workflow Rules

### Cairo Contract Changes

After any modifications to Cairo contract files (`contracts/`), always run `cd contracts && scarb fmt -w` before committing. CI enforces `scarb fmt --check --workspace` and will fail if formatting is off.

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
4. Add route in `client/src/App.tsx`

## Environment Files

Each package has `.env.example` templates:
- `contracts/.env.example` - Deployment config (profile, royalty receiver, token params)
- `api/.env.example` - Database URL, port, CORS origin
- `client/.env.example` - Network, API URL, contract addresses

## Agent Usage

For Cairo contract development tasks (`contracts/`), prefer using the `cairo-dev` agent:
- Contract modifications and new features
- Testing with snforge
- Gas optimization
- Component integration

The `cairo-dev` agent has specialized knowledge of Cairo 2.15.0, Scarb, OpenZeppelin Cairo contracts, and Starknet patterns.
