#!/bin/bash

# Deploy Template Games to Sepolia
# Declares the mock game contract, deploys 3 template game instances,
# and initializes each with the existing Sepolia registry + Denshokan token.
#
# Prerequisites:
#   - sncast account configured in snfoundry.toml [sncast.sepolia]
#   - Funded Sepolia account (set STARKNET_ACCOUNT env var or configure in snfoundry.toml)
#   - DENSHOKAN_ADDRESS and GAME_REGISTRY_ADDRESS set in .env
#
# Usage:
#   ./deploy_template_games.sh
#   DEPLOYMENT_FILE=deployments/custom.json ./deploy_template_games.sh

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

# ============================
# GAME CREATOR ADDRESS
# ============================

# Use the deployer account address as game_creator
GAME_CREATOR="${GAME_CREATOR:-0x127fd5f1fe78a71f8bcd1fec63e3fe2f0486b6ecd5c86a0466c3a21fa5cfcec}"

# ============================
# BUILD CONTRACTS
# ============================

print_info "Building contracts..."
cd "$CONTRACTS_DIR"
scarb build

ARTIFACT="$CONTRACTS_DIR/target/dev/denshokan_testing_minigame_starknet_mock.contract_class.json"
if [ ! -f "$ARTIFACT" ]; then
    # Try alternative prefix in case naming differs
    ARTIFACT="$CONTRACTS_DIR/target/dev/denshokan_minigame_starknet_mock.contract_class.json"
fi

if [ ! -f "$ARTIFACT" ]; then
    print_error "Mock game contract artifact not found"
    echo "Available contract artifacts:"
    ls -1 "$CONTRACTS_DIR"/target/dev/*.contract_class.json 2>/dev/null || echo "  (none)"
    exit 1
fi

print_info "Using artifact: $(basename "$ARTIFACT")"

# ============================
# DECLARE MOCK GAME CLASS
# ============================

print_info "Declaring minigame_starknet_mock..."

DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name minigame_starknet_mock 2>&1) || {
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

print_info "Mock game class hash: $CLASS_HASH"

# ============================
# DEPLOY & INITIALIZE 3 GAMES
# ============================

# Game definitions: name|description|developer|publisher|genre|image|color|royalty_bps
GAMES=(
    "Loot Survivor|A roguelike adventure on Starknet|Provable Games|Provable Games|Roguelike|https://lootsurvivor.io/image.png|4CAF50|500"
    "Dark Shuffle|A strategic deck-building card game|Provable Games|Provable Games|Card Game|https://darkshuffle.io/image.png|9C27B0|300"
    "Pixel Pong|A retro arcade game on-chain|Provable Games|Provable Games|Arcade|https://pixelpong.io/image.png|FF9800|250"
)

GAME_ADDRESSES=()

deploy_game() {
    local idx=$1
    local game_def=$2

    IFS='|' read -r name description developer publisher genre image color royalty_bps <<< "$game_def"

    print_info "[$idx/3] Deploying: $name"

    # Deploy with empty constructor (salt for unique address)
    local DEPLOY_OUTPUT
    DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
        deploy \
        --class-hash "$CLASS_HASH" \
        --salt "$idx" 2>&1) || {
        print_error "Failed to deploy game $idx ($name)"
        echo "$DEPLOY_OUTPUT"
        exit 1
    }

    local GAME_ADDRESS
    GAME_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || \
                   echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

    if [ -z "$GAME_ADDRESS" ]; then
        print_error "Failed to extract address for game $idx"
        echo "$DEPLOY_OUTPUT"
        exit 1
    fi

    print_info "  Deployed at: $GAME_ADDRESS"

    # Call initializer
    # Signature: initializer(
    #   game_creator: ContractAddress,
    #   game_name: ByteArray,
    #   game_description: ByteArray,
    #   game_developer: ByteArray,
    #   game_publisher: ByteArray,
    #   game_genre: ByteArray,
    #   game_image: ByteArray,
    #   game_color: Option<ByteArray>,       -- 0 = Some, 1 = None
    #   client_url: Option<ByteArray>,       -- None
    #   renderer_address: Option<ContractAddress>, -- None
    #   settings_address: Option<ContractAddress>,  -- None
    #   objectives_address: Option<ContractAddress>, -- None
    #   minigame_token_address: ContractAddress,
    #   royalty_fraction: Option<u128>,      -- 0 = Some
    # )

    print_info "  Initializing $name..."

    sncast --profile "$PROFILE" --wait \
        invoke \
        --contract-address "$GAME_ADDRESS" \
        --function "initializer" \
        --arguments "$GAME_CREATOR, \"$name\", \"$description\", \"$developer\", \"$publisher\", \"$genre\", \"$image\", core::option::Option::Some(\"$color\"), core::option::Option::None, core::option::Option::None, core::option::Option::None, core::option::Option::None, $DENSHOKAN_ADDRESS, core::option::Option::Some($royalty_bps)" || {
        print_error "Failed to initialize game $idx ($name)"
        exit 1
    }

    print_info "  Initialized $name (royalty: ${royalty_bps} bps)"

    GAME_ADDRESSES+=("$GAME_ADDRESS")
}

for i in "${!GAMES[@]}"; do
    deploy_game $((i + 1)) "${GAMES[$i]}"
done

# ============================
# VERIFY REGISTRATION
# ============================

print_info "Verifying game registration..."

GAME_COUNT_OUTPUT=$(sncast --profile "$PROFILE" \
    call \
    --contract-address "$GAME_REGISTRY_ADDRESS" \
    --function "game_count" 2>&1) || {
    print_warning "Could not verify game_count (registry may not expose this function)"
    echo "$GAME_COUNT_OUTPUT"
}

if [ -n "${GAME_COUNT_OUTPUT:-}" ]; then
    print_info "Registry game_count response: $GAME_COUNT_OUTPUT"
fi

# ============================
# SAVE DEPLOYMENT INFO
# ============================

GAMES_FILE="$CONTRACTS_DIR/deployments/sepolia_games.json"
mkdir -p "$CONTRACTS_DIR/deployments"

cat > "$GAMES_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "registry_address": "$GAME_REGISTRY_ADDRESS",
  "denshokan_address": "$DENSHOKAN_ADDRESS",
  "mock_class_hash": "$CLASS_HASH",
  "games": [
    {
      "name": "Loot Survivor",
      "address": "${GAME_ADDRESSES[0]}",
      "genre": "Roguelike",
      "royalty_bps": 500
    },
    {
      "name": "Dark Shuffle",
      "address": "${GAME_ADDRESSES[1]}",
      "genre": "Card Game",
      "royalty_bps": 300
    },
    {
      "name": "Pixel Pong",
      "address": "${GAME_ADDRESSES[2]}",
      "genre": "Arcade",
      "royalty_bps": 250
    }
  ]
}
EOF

print_info "Game addresses saved to: $GAMES_FILE"

# ============================
# DEPLOYMENT SUMMARY
# ============================

echo
print_info "=== TEMPLATE GAMES DEPLOYED ==="
echo
echo "Registry:  $GAME_REGISTRY_ADDRESS"
echo "Denshokan: $DENSHOKAN_ADDRESS"
echo
echo "Games:"
echo "  1. Loot Survivor — ${GAME_ADDRESSES[0]} (Roguelike, 5% royalty)"
echo "  2. Dark Shuffle  — ${GAME_ADDRESSES[1]} (Card Game, 3% royalty)"
echo "  3. Pixel Pong    — ${GAME_ADDRESSES[2]} (Arcade, 2.5% royalty)"
echo
echo "Saved to: $GAMES_FILE"
