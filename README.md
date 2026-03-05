# Denshokan

<!-- Version badges - keep in sync with Scarb.toml and package.json -->

[![Scarb](https://img.shields.io/badge/Scarb-2.15.0-blue)](https://github.com/software-mansion/scarb)
[![Starknet Foundry](https://img.shields.io/badge/snforge-0.55.0-purple)](https://foundry-rs.github.io/starknet-foundry/)
[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red.svg)](LICENSE)
[![Docs](https://img.shields.io/badge/Docs-Embeddable%20Game%20Standard-blue)](https://docs.provable.games/embeddable-game-standard)
[![codecov](https://codecov.io/gh/Provable-Games/denshokan/branch/main/graph/badge.svg)](https://codecov.io/gh/Provable-Games/denshokan)

Game token contracts and indexer for Starknet. Denshokan (伝承館) means "Hall of Legends" - a place where game achievements are preserved.

## Architecture

```
denshokan/
├── contracts/               # Cairo smart contracts (Scarb 2.15.0, Cairo 2.15.0)
│   ├── src/
│   │   ├── denshokan.cairo          # Main ERC721 token contract
│   │   ├── denshokan_viewer.cairo   # Filter/query API contract
│   │   ├── filter.cairo             # Token filtering utilities
│   │   ├── minigame_registry.cairo  # Game registry contract
│   │   ├── number_guess.cairo       # Number guessing minigame
│   │   └── tic_tac_toe.cairo        # Tic-tac-toe minigame
│   ├── tests/                       # Unit and integration tests
│   └── scripts/                     # Deployment scripts (sncast)
├── indexer/                 # Apibara indexer (TypeScript)
│   ├── indexers/                # Indexer definitions
│   ├── src/lib/                 # Schema and decoders
│   ├── migrations/              # PostgreSQL migrations
│   └── api/                     # API specifications (OpenAPI, GraphQL, gRPC)
├── api/                     # Hono REST API + WebSocket server
│   └── src/
│       ├── routes/              # tokens, games, activity, players, minters
│       ├── ws/                  # WebSocket subscriptions
│       ├── middleware/          # Rate limiting
│       └── db/                  # Database client
├── client/                  # React frontend (MUI 7, Cartridge Controller)
│   └── src/
│       ├── pages/               # Route components
│       ├── components/          # Feature-organized components
│       ├── hooks/               # Data fetching and game logic
│       ├── contexts/            # Starknet and Controller providers
│       └── abi/                 # Contract ABIs
└── docker-compose.yml       # PostgreSQL, indexer, API services
```

## Dependencies

The contracts import from the [game-components](https://github.com/Provable-Games/game-components) library:
- `game_components_token` - ERC721 token with modular components
- `game_components_metagame` - High-level game management
- `game_components_minigame` - Game logic interfaces
- `game_components_registry` - Game registry
- `game_components_utils` - Shared utilities (renderer, etc.)

OpenZeppelin Cairo v3.0.0 for token standards, access control, and upgrades.

## Prerequisites

- [Scarb](https://docs.swmansion.com/scarb/) 2.15.0+
- [Starknet Foundry](https://foundry-rs.github.io/starknet-foundry/) 0.55.0+
- Node.js 20+
- PostgreSQL 16+ (or Docker)

## Quick Start

### Local Development

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Install dependencies
npm install

# Run database migrations
npm run db:migrate

# Start API server (watch mode)
npm run dev:api

# Start client dev server (separate terminal)
npm run dev:client
```

### Contracts

```bash
# Build contracts
cd contracts && scarb build

# Run tests
snforge test

# Run specific test category
snforge test unit::
snforge test integration::

# Format code
scarb fmt -w
```

### Deployment

Deploy contracts using `sncast` (Starknet Foundry):

```bash
cd contracts

# Copy and configure .env from template
cp .env.example .env
# Edit .env with your values:
#   PROFILE=sepolia           # Profile from snfoundry.toml (default, sepolia, mainnet)
#   ROYALTY_RECEIVER=0x123... # Required: address to receive royalties

# Deploy Denshokan token + registry + viewer
./scripts/deploy_denshokan.sh

# Deploy minigames
./scripts/deploy_number_guess.sh
./scripts/deploy_tic_tac_toe.sh
```

The script will:
1. Build contracts with `scarb build`
2. Declare and deploy MinigameRegistry (unless `GAME_REGISTRY_ADDRESS` is set)
3. Declare and deploy Denshokan token contract
4. Declare and deploy DenshokanViewer contract
5. Save deployment info to `contracts/deployments/`

### Indexer

```bash
cd indexer

# Configure environment
# Set DATABASE_URL, DENSHOKAN_ADDRESS, REGISTRY_ADDRESS,
# STREAM_URL, STARTING_BLOCK in .env

# Run migrations
npm run db:migrate

# Start indexer (development)
npm run dev
```

## API

Hono-based REST API with WebSocket support:

| Endpoint | Description |
|----------|-------------|
| `GET /tokens` | List tokens with filtering and pagination |
| `GET /tokens/:id` | Token details |
| `GET /games` | List registered games |
| `GET /games/:id` | Game details with stats |
| `GET /players/:address` | Player portfolio |
| `GET /activity/*` | Recent activity and stats |
| `GET /minters` | List registered minters |
| `GET /health` | Health check |
| `WS /ws` | Real-time event subscriptions |

## API Specifications

- **REST**: `indexer/api/openapi.yaml`
- **gRPC**: `indexer/api/proto/game_service.proto`
- **GraphQL**: `indexer/api/schema.graphql`

## Native Events

Denshokan emits optimized native Starknet events for efficient indexing:

- `TokenMinted` - New token creation
- `ScoreUpdate` - Score changes (with game_id key for filtering)
- `GameOver` - Game completion
- `TokenStateUpdate` - Mutable state changes
- `PlayerNameUpdate` - Player name changes
- `MetadataUpdate` - ERC-4906 standard refresh

## Metagame Callbacks

Metagame contracts can implement `IMetagameCallback` to receive automatic notifications:

```cairo
#[starknet::interface]
pub trait IMetagameCallback<TState> {
    fn on_score_update(ref self: TState, token_id: felt252, score: u32);
    fn on_game_over(ref self: TState, token_id: felt252, final_score: u32);
    fn on_objectives_completed(ref self: TState, token_id: felt252);
}
```

Callbacks are SRC5-gated - only invoked if the minter contract explicitly supports the interface.

## Environment Configuration

### Contracts (`contracts/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `PROFILE` | Yes | snfoundry.toml profile (default, sepolia, mainnet) |
| `ROYALTY_RECEIVER` | Yes | Address to receive royalties |
| `ROYALTY_FRACTION` | No | Basis points, default 250 (2.5%) |
| `TOKEN_NAME` | No | Token name (default: Denshokan) |
| `TOKEN_SYMBOL` | No | Token symbol (default: DNSH) |
| `GAME_REGISTRY_ADDRESS` | No | Skip registry deployment |
| `SKIP_CONFIRMATION` | No | Skip deployment prompts |

### API (`api/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Server port (default: 3001) |
| `CORS_ORIGIN` | No | Allowed CORS origin |

### Client (`client/.env.example`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_NETWORK` | Yes | `mainnet` or `sepolia` |
| `VITE_API_URL` | Yes | API server URL |
| `VITE_WS_URL` | Yes | WebSocket server URL |
| `VITE_DENSHOKAN_ADDRESS` | Yes | Token contract address |
| `VITE_REGISTRY_ADDRESS` | Yes | Registry contract address |
| `VITE_VIEWER_ADDRESS` | Yes | Viewer contract address |
| `VITE_RPC_URL` | No | RPC URL (defaults to Cartridge) |

## License

© 2026 Provable Games. All rights reserved.
