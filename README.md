# Denshokan

Game token contracts and indexer for Starknet. Denshokan (伝承館) means "Hall of Legends" - a place where game achievements are preserved.

## Architecture

```
denshokan/
├── contracts/               # Cairo smart contracts (imports game-components)
│   ├── Scarb.toml               # Package config with game-components deps
│   ├── snfoundry.toml           # Starknet Foundry config (profiles, fork testing)
│   ├── deploy_denshokan.sh      # Deployment script using sncast
│   └── src/
│       ├── lib.cairo            # Module exports
│       ├── denshokan.cairo      # Main token contract
│       └── minigame_registry.cairo  # Game registry contract
├── indexer/                 # Apibara indexer (TypeScript)
│   ├── indexers/                # Indexer definitions
│   ├── src/lib/                 # Schema and decoders
│   ├── migrations/              # PostgreSQL migrations
│   └── api/                     # API specifications
└── docs/                    # Documentation
```

## Dependencies

The contracts import from the [game-components](https://github.com/Provable-Games/game-components) library:
- `game_components_token` - ERC721 token with modular components
- `game_components_metagame` - High-level game management
- `game_components_minigame` - Game logic interfaces
- `game_components_utils` - Shared utilities (renderer, etc.)

## Prerequisites

- [Scarb](https://docs.swmansion.com/scarb/) 2.13.1+
- [Starknet Foundry](https://foundry-rs.github.io/starknet-foundry/) 0.53.0+
- Node.js 20+
- PostgreSQL 15+

## Quick Start

### Contracts

```bash
# Build contracts
cd contracts && scarb build

# Run tests
snforge test

# Run tests with coverage
snforge test --coverage

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

# Configure your account in snfoundry.toml (add account name to the profile)
# See: https://foundry-rs.github.io/starknet-foundry/starknet/account.html

# Run deployment
./deploy_denshokan.sh
```

The script will:
1. Build contracts with `scarb build`
2. Declare and deploy MinigameRegistry (unless `GAME_REGISTRY_ADDRESS` is set)
3. Declare and deploy Denshokan token contract
4. Save deployment info to `contracts/deployments/`

### Indexer

```bash
# Install dependencies
cd indexer && npm install

# Start local PostgreSQL
docker-compose up -d

# Run migrations
npm run db:migrate

# Start indexer (development)
npm run dev
```

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

## License

MIT
