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

print_info "Building contracts (release profile)..."
cd "$CONTRACTS_DIR"
scarb --profile release build --workspace

ARTIFACT="$CONTRACTS_DIR/target/release/denshokan_testing_minigame_mock.contract_class.json"

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

print_info "Declaring minigame_mock..."

DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name minigame_mock \
    --package denshokan_testing 2>&1) || {
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

    # Call initializer using raw calldata (felt serialization)
    # ByteArray = num_31byte_chunks [chunks...] pending_word pending_len
    # Option::Some(x) = 0 x  |  Option::None = 1

    # Encode strings to ByteArray calldata
    encode_bytearray() {
        local str="$1"
        local len=${#str}
        local hex=$(printf '%s' "$str" | xxd -p | tr -d '\n')
        if [ "$len" -le 31 ]; then
            echo "0 0x$hex $len"
        else
            local full_chunks=$((len / 31))
            local pending_len=$((len % 31))
            local result="$full_chunks"
            local i=0
            while [ "$i" -lt "$full_chunks" ]; do
                local chunk_hex=${hex:$((i * 62)):62}
                result="$result 0x$chunk_hex"
                i=$((i + 1))
            done
            if [ "$pending_len" -gt 0 ]; then
                local pending_hex=${hex:$((full_chunks * 62))}
                result="$result 0x$pending_hex $pending_len"
            else
                result="$result 0x0 0"
            fi
            echo "$result"
        fi
    }

    local NAME_CD=$(encode_bytearray "$name")
    local DESC_CD=$(encode_bytearray "$description")
    local DEV_CD=$(encode_bytearray "$developer")
    local PUB_CD=$(encode_bytearray "$publisher")
    local GENRE_CD=$(encode_bytearray "$genre")
    local IMAGE_CD=$(encode_bytearray "$image")
    local COLOR_CD=$(encode_bytearray "$color")

    print_info "  Initializing $name..."

    sncast --profile "$PROFILE" --wait \
        invoke \
        --contract-address "$GAME_ADDRESS" \
        --function "initializer" \
        --calldata \
            $GAME_CREATOR \
            $NAME_CD \
            $DESC_CD \
            $DEV_CD \
            $PUB_CD \
            $GENRE_CD \
            $IMAGE_CD \
            0 $COLOR_CD \
            1 \
            1 \
            1 \
            1 \
            $DENSHOKAN_ADDRESS \
            0 $royalty_bps || {
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
