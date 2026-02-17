#!/bin/bash

# Deploy Number Guess Game to Sepolia
# Declares the NumberGuess contract, deploys it, and initializes it
# with the existing Sepolia registry + Denshokan token.
#
# Prerequisites:
#   - sncast account configured in snfoundry.toml [sncast.sepolia]
#   - Funded Sepolia account
#   - DENSHOKAN_ADDRESS and GAME_REGISTRY_ADDRESS set in .env
#
# Usage:
#   ./contracts/scripts/deploy_number_guess.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."

# Load .env if it exists
if [ -f "$CONTRACTS_DIR/.env" ]; then
    set -a
    source "$CONTRACTS_DIR/.env"
    set +a
    echo "Loaded environment variables from $CONTRACTS_DIR/.env"
fi

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

PROFILE="${PROFILE:-sepolia}"

# ============================
# VALIDATE DEPLOYMENT ADDRESSES
# ============================

if [ -z "${GAME_REGISTRY_ADDRESS:-}" ]; then
    print_error "GAME_REGISTRY_ADDRESS not set. Add it to .env or export it."
    exit 1
fi

if [ -z "${DENSHOKAN_ADDRESS:-}" ]; then
    print_error "DENSHOKAN_ADDRESS not set. Add it to .env or export it."
    exit 1
fi

print_info "Registry address:  $GAME_REGISTRY_ADDRESS"
print_info "Denshokan address: $DENSHOKAN_ADDRESS"

GAME_CREATOR="${GAME_CREATOR:-0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec}"

# ============================
# BUILD CONTRACTS
# ============================

print_info "Building contracts..."
cd "$CONTRACTS_DIR"
scarb build

ARTIFACT="$CONTRACTS_DIR/target/dev/denshokan_games_NumberGuess.contract_class.json"
if [ ! -f "$ARTIFACT" ]; then
    print_error "NumberGuess contract artifact not found at $ARTIFACT"
    echo "Available artifacts:"
    ls -1 "$CONTRACTS_DIR"/target/dev/*.contract_class.json 2>/dev/null || echo "  (none)"
    exit 1
fi

print_info "Using artifact: $(basename "$ARTIFACT")"

# ============================
# DECLARE
# ============================

print_info "Declaring NumberGuess contract..."

DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name NumberGuess \
    --package denshokan_games 2>&1) || {
    if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
        print_warning "Contract already declared"
        CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare contract"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${CLASS_HASH:-}" ]; then
    CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
                 echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)
fi

if [ -z "${CLASS_HASH:-}" ]; then
    print_error "Failed to extract class hash"
    echo "$DECLARE_OUTPUT"
    exit 1
fi

print_info "NumberGuess class hash: $CLASS_HASH"

# ============================
# DEPLOY
# ============================

print_info "Deploying NumberGuess contract..."

DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$CLASS_HASH" 2>&1) || {
    print_error "Failed to deploy contract"
    echo "$DEPLOY_OUTPUT"
    exit 1
}

GAME_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
               echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

if [ -z "$GAME_ADDRESS" ]; then
    print_error "Failed to extract deployed address"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

print_info "NumberGuess deployed at: $GAME_ADDRESS"

# ============================
# INITIALIZE
# ============================

print_info "Initializing NumberGuess..."

# Calldata uses raw felt serialization:
#   ContractAddress = felt
#   ByteArray = num_31byte_chunks [chunks...] pending_word pending_len
#   Option::Some(x) = 0 x
#   Option::None = 1
#
# initializer(
#   game_creator, game_name, game_description, game_developer, game_publisher,
#   game_genre, game_image, game_color, client_url, renderer_address,
#   settings_address, objectives_address, minigame_token_address, royalty_fraction
# )
#
# ByteArray encodings:
#   "Number Guess" (12 bytes) = 0 0x4e756d626572204775657373 12
#   "On-chain Number Guessing Game" (29 bytes) = 0 0x4f6e2d636861696e204e756d626572204775657373696e672047616d65 29
#   "Provable Games" (14 bytes) = 0 0x50726f7661626c652047616d6573 14
#   "Puzzle" (6 bytes) = 0 0x50757a7a6c65 6
#   "https://denshokan.dev/games/numberguess.png" (43 bytes) = 1 chunk + pending
#     = 1 0x68747470733a2f2f64656e73686f6b616e2e6465762f67616d65732f6e756d 0x62657267756573732e706e67 12
sncast --profile "$PROFILE" --wait \
    invoke \
    --contract-address "$GAME_ADDRESS" \
    --function "initializer" \
    --calldata \
        $GAME_CREATOR \
        0 0x4e756d626572204775657373 12 \
        0 0x4f6e2d636861696e204e756d626572204775657373696e672047616d65 29 \
        0 0x50726f7661626c652047616d6573 14 \
        0 0x50726f7661626c652047616d6573 14 \
        0 0x50757a7a6c65 6 \
        1 0x68747470733a2f2f64656e73686f6b616e2e6465762f67616d65732f6e756d 0x62657267756573732e706e67 12 \
        1 \
        1 \
        1 \
        1 \
        1 \
        $DENSHOKAN_ADDRESS \
        0 500 || {
    print_error "Failed to initialize NumberGuess"
    exit 1
}

print_info "NumberGuess initialized!"

# ============================
# SAVE DEPLOYMENT INFO
# ============================

GAMES_FILE="$CONTRACTS_DIR/deployments/sepolia_number_guess.json"
mkdir -p "$CONTRACTS_DIR/deployments"

cat > "$GAMES_FILE" << EOFINNER
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "registry_address": "$GAME_REGISTRY_ADDRESS",
  "denshokan_address": "$DENSHOKAN_ADDRESS",
  "number_guess": {
    "class_hash": "$CLASS_HASH",
    "address": "$GAME_ADDRESS",
    "name": "Number Guess",
    "genre": "Puzzle",
    "royalty_bps": 500
  }
}
EOFINNER

print_info "Deployment info saved to: $GAMES_FILE"

# ============================
# SUMMARY
# ============================

echo
print_info "=== NUMBER GUESS DEPLOYED ==="
echo
echo "Registry:    $GAME_REGISTRY_ADDRESS"
echo "Denshokan:   $DENSHOKAN_ADDRESS"
echo "NumberGuess: $GAME_ADDRESS (class: $CLASS_HASH)"
echo
echo "Saved to: $GAMES_FILE"
