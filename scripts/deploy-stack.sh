#!/bin/bash

# Deploy Full Denshokan Stack
# Deploys core contracts, then game contracts from sibling repos, then syncs env.
#
# Order:
#   1. Denshokan core (Registry, Renderer, Token, Viewer)
#   2. Number Guess game (from NUMBER_GUESS_DIR)
#   3. Sync env vars to indexer + client
#
# Prerequisites:
#   - sncast "deployer" account configured and funded
#   - contracts/.env with PROFILE set
#   - NUMBER_GUESS_DIR pointing to number-guess repo (default: ../number-guess)
#
# Usage:
#   ./scripts/deploy-stack.sh                    # Full deploy
#   ./scripts/deploy-stack.sh --skip-games       # Core only
#   ./scripts/deploy-stack.sh --games-only       # Games only (uses existing core addresses)

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
SCRIPTS_DIR="$ROOT_DIR/scripts"

# Sibling repos (override with env vars)
NUMBER_GUESS_DIR="${NUMBER_GUESS_DIR:-$(cd "$ROOT_DIR/../number-guess" 2>/dev/null && pwd || echo "")}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# ============================
# PARSE FLAGS
# ============================

SKIP_GAMES=false
GAMES_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --skip-games)  SKIP_GAMES=true ;;
        --games-only)  GAMES_ONLY=true ;;
        *)             print_error "Unknown flag: $arg"; exit 1 ;;
    esac
done

# ============================
# LOAD ENV
# ============================

if [ -f "$CONTRACTS_DIR/.env" ]; then
    set -a
    source "$CONTRACTS_DIR/.env"
    set +a
fi

PROFILE="${PROFILE:-sepolia}"

# ============================
# STEP 1: DEPLOY CORE
# ============================

if [ "$GAMES_ONLY" = false ]; then
    print_info "=== Step 1/3: Deploying Denshokan core contracts ($PROFILE) ==="
    echo

    SKIP_CONFIRMATION=true "$CONTRACTS_DIR/scripts/deploy_denshokan.sh"

    # Re-source .env to pick up addresses written by deploy script
    # The deploy script saves a JSON but doesn't update .env, so extract from latest deployment
    LATEST_DEPLOYMENT=$(ls -t "$CONTRACTS_DIR/deployments"/denshokan_*.json 2>/dev/null | head -1)

    if [ -z "$LATEST_DEPLOYMENT" ]; then
        print_error "No deployment artifact found after deploying core contracts"
        exit 1
    fi

    # Extract addresses from deployment JSON
    DENSHOKAN_ADDRESS=$(grep -oP '"address":\s*"\K[^"]+' "$LATEST_DEPLOYMENT" | head -1)
    GAME_REGISTRY_ADDRESS=$(grep -oP '"address":\s*"\K[^"]+' "$LATEST_DEPLOYMENT" | tail -1)
    VIEWER_ADDRESS=$(grep -oP '"address":\s*"\K[^"]+' "$LATEST_DEPLOYMENT" | sed -n '3p')

    # More robust: extract by section
    DENSHOKAN_ADDRESS=$(python3 -c "
import json, sys
d = json.load(open('$LATEST_DEPLOYMENT'))
print(d['denshokan_contract']['address'])
" 2>/dev/null || echo "$DENSHOKAN_ADDRESS")

    GAME_REGISTRY_ADDRESS=$(python3 -c "
import json, sys
d = json.load(open('$LATEST_DEPLOYMENT'))
print(d['minigame_registry_contract']['address'])
" 2>/dev/null || echo "$GAME_REGISTRY_ADDRESS")

    VIEWER_ADDRESS=$(python3 -c "
import json, sys
d = json.load(open('$LATEST_DEPLOYMENT'))
print(d['denshokan_viewer_contract']['address'])
" 2>/dev/null || echo "$VIEWER_ADDRESS")

    print_info "Core addresses from deployment:"
    echo "  Denshokan: $DENSHOKAN_ADDRESS"
    echo "  Registry:  $GAME_REGISTRY_ADDRESS"
    echo "  Viewer:    $VIEWER_ADDRESS"

    # Update contracts/.env with new addresses so downstream scripts pick them up
    update_or_append() {
        local file="$1" key="$2" value="$3"
        if grep -q "^${key}=" "$file" 2>/dev/null; then
            sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        else
            echo "${key}=${value}" >> "$file"
        fi
    }

    update_or_append "$CONTRACTS_DIR/.env" "DENSHOKAN_ADDRESS" "$DENSHOKAN_ADDRESS"
    update_or_append "$CONTRACTS_DIR/.env" "GAME_REGISTRY_ADDRESS" "$GAME_REGISTRY_ADDRESS"
    update_or_append "$CONTRACTS_DIR/.env" "VIEWER_ADDRESS" "$VIEWER_ADDRESS"

    echo
else
    # Games-only: addresses must already be in .env
    if [ -z "${DENSHOKAN_ADDRESS:-}" ] || [ -z "${GAME_REGISTRY_ADDRESS:-}" ]; then
        print_error "DENSHOKAN_ADDRESS and GAME_REGISTRY_ADDRESS must be set in contracts/.env for --games-only"
        exit 1
    fi
    print_info "Using existing core addresses from contracts/.env"
    echo "  Denshokan: $DENSHOKAN_ADDRESS"
    echo "  Registry:  $GAME_REGISTRY_ADDRESS"
fi

# ============================
# STEP 2: DEPLOY GAMES
# ============================

if [ "$SKIP_GAMES" = false ]; then
    print_info "=== Step 2/3: Deploying game contracts ==="
    echo

    # --- Number Guess ---
    if [ -n "$NUMBER_GUESS_DIR" ] && [ -d "$NUMBER_GUESS_DIR/contracts" ]; then
        print_info "Deploying Number Guess from $NUMBER_GUESS_DIR"

        # Update number-guess .env with current denshokan addresses
        NG_ENV="$NUMBER_GUESS_DIR/contracts/.env"
        if [ -f "$NG_ENV" ]; then
            sed -i "s|^DENSHOKAN_ADDRESS=.*|DENSHOKAN_ADDRESS=${DENSHOKAN_ADDRESS}|" "$NG_ENV"
            sed -i "s|^GAME_REGISTRY_ADDRESS=.*|GAME_REGISTRY_ADDRESS=${GAME_REGISTRY_ADDRESS}|" "$NG_ENV"
            print_info "Updated $NG_ENV with current addresses"
        else
            print_warning "$NG_ENV not found, creating from current addresses"
            cat > "$NG_ENV" << EOF
PROFILE=$PROFILE
DENSHOKAN_ADDRESS=$DENSHOKAN_ADDRESS
GAME_REGISTRY_ADDRESS=$GAME_REGISTRY_ADDRESS
EOF
        fi

        SKIP_CONFIRMATION=true "$NUMBER_GUESS_DIR/contracts/scripts/deploy_number_guess.sh"

        # Extract number-guess address from its deployment artifact
        NG_DEPLOYMENT="$NUMBER_GUESS_DIR/contracts/deployments/${PROFILE}_number_guess.json"
        if [ -f "$NG_DEPLOYMENT" ]; then
            NUMBER_GUESS_ADDRESS=$(python3 -c "
import json
d = json.load(open('$NG_DEPLOYMENT'))
print(d['number_guess']['address'])
" 2>/dev/null || grep -oP '"address":\s*"\K[^"]+' "$NG_DEPLOYMENT" | head -1)
            print_info "Number Guess deployed at: $NUMBER_GUESS_ADDRESS"
        fi

        echo
    else
        print_warning "Number Guess repo not found at ${NUMBER_GUESS_DIR:-../number-guess}"
        print_warning "Set NUMBER_GUESS_DIR to the repo path, or skip with --skip-games"
    fi
else
    print_info "=== Step 2/3: Skipping game deployment (--skip-games) ==="
    echo
fi

# ============================
# STEP 3: SYNC ENV
# ============================

print_info "=== Step 3/3: Syncing environment ==="
echo

"$SCRIPTS_DIR/sync-env.sh"

# Update game contract addresses in networks.ts if we have them
if [ -n "${NUMBER_GUESS_ADDRESS:-}" ]; then
    NETWORKS_TS="$ROOT_DIR/client/src/networks.ts"
    if [ -f "$NETWORKS_TS" ]; then
        print_info "Number Guess address for client: $NUMBER_GUESS_ADDRESS"
        print_warning "Update gameContracts in client/src/networks.ts manually if the address changed"
    fi
fi

# ============================
# SUMMARY
# ============================

echo
print_info "========================================="
print_info "  FULL STACK DEPLOYMENT COMPLETE ($PROFILE)"
print_info "========================================="
echo
echo "Core Contracts:"
echo "  Denshokan: ${DENSHOKAN_ADDRESS:-n/a}"
echo "  Registry:  ${GAME_REGISTRY_ADDRESS:-n/a}"
echo "  Viewer:    ${VIEWER_ADDRESS:-n/a}"
echo
if [ -n "${NUMBER_GUESS_ADDRESS:-}" ]; then
    echo "Game Contracts:"
    echo "  Number Guess: $NUMBER_GUESS_ADDRESS"
    echo
fi
echo "Environment synced to: indexer/.env, client/src/networks.ts"
