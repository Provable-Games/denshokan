# Denshokan

Game token contracts and indexer for Starknet. Denshokan (伝承館) means "Hall of Legends" - a place where game achievements are preserved.

## Architecture

```
denshokan/
├── contracts/           # Cairo smart contracts (imports game-components)
│   ├── Scarb.toml           # Package config with game-components deps
│   └── src/
│       ├── lib.cairo        # Module exports
│       └── denshokan.cairo  # Main token contract
├── indexer/             # Apibara indexer (TypeScript)
│   ├── indexers/            # Indexer definitions
│   ├── src/lib/             # Schema and decoders
│   ├── migrations/          # PostgreSQL migrations
│   └── api/                 # API specifications
├── scripts/             # Deployment and utility scripts
└── docs/                # Documentation
```

## Dependencies

The contracts import from the [game-components](https://github.com/Provable-Games/game-components) library:
- `game_components_token` - ERC721 token with modular components
- `game_components_metagame` - High-level game management
- `game_components_minigame` - Game logic interfaces
- `game_components_utils` - Shared utilities (renderer, etc.)

## Token ID Packing

Denshokan uses a gas-optimized packed token ID that embeds immutable metadata directly in the token_id (felt252):

| Bits      | Field            | Size     | Max Value                |
|-----------|------------------|----------|--------------------------|
| 0-29      | game_id          | 30 bits  | ~1 billion games         |
| 30-69     | minted_by        | 40 bits  | ~1 trillion minters      |
| 70-101    | settings_id      | 32 bits  | ~4 billion settings      |
| 102-136   | minted_at        | 35 bits  | Unix timestamp (~1000yr) |
| 137-162   | lifecycle_start  | 26 bits  | Relative timestamp       |
| 163-188   | lifecycle_end    | 26 bits  | Relative timestamp       |
| 189-196   | objectives_count | 8 bits   | 255 objectives           |
| 197       | soulbound        | 1 bit    | bool                     |
| 198       | has_context      | 1 bit    | bool                     |
| 199-238   | sequence_number  | 40 bits  | ~1 trillion tokens       |

**Total: 239 bits** (fits in felt252's ~252 bits)

This eliminates storage reads for immutable metadata - just decode from the token_id!

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
