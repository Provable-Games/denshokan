#!/bin/bash

# Sync contract addresses across all .env files
# Source of truth: contracts/.env (updated by deployment scripts)
#
# Updates:
#   - client/.env      (VITE_DENSHOKAN_ADDRESS, VITE_REGISTRY_ADDRESS, VITE_VIEWER_ADDRESS)
#   - indexer/.env      (DENSHOKAN_ADDRESS, REGISTRY_ADDRESS)
#   - contracts/.env    (already the source, no changes)
#
# Usage:
#   ./scripts/sync-env.sh
#   ./scripts/sync-env.sh --dry-run

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DRY_RUN=false
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
fi

# ============================
# LOAD SOURCE OF TRUTH
# ============================

CONTRACTS_ENV="$ROOT_DIR/contracts/.env"

if [ ! -f "$CONTRACTS_ENV" ]; then
    echo -e "${RED}[ERROR]${NC} contracts/.env not found. Run a deployment first."
    exit 1
fi

set -a
source "$CONTRACTS_ENV"
set +a

# Validate required addresses
DENSHOKAN="${DENSHOKAN_ADDRESS:-}"
REGISTRY="${GAME_REGISTRY_ADDRESS:-}"
VIEWER="${VIEWER_ADDRESS:-}"

if [ -z "$DENSHOKAN" ] || [ -z "$REGISTRY" ] || [ -z "$VIEWER" ]; then
    echo -e "${RED}[ERROR]${NC} Missing addresses in contracts/.env:"
    [ -z "$DENSHOKAN" ] && echo "  DENSHOKAN_ADDRESS is empty"
    [ -z "$REGISTRY" ] && echo "  GAME_REGISTRY_ADDRESS is empty"
    [ -z "$VIEWER" ] && echo "  VIEWER_ADDRESS is empty"
    exit 1
fi

echo -e "${GREEN}[INFO]${NC} Source addresses (from contracts/.env):"
echo "  Denshokan: $DENSHOKAN"
echo "  Registry:  $REGISTRY"
echo "  Viewer:    $VIEWER"
echo

# ============================
# HELPER
# ============================

# Update a key=value line in a file. If the key exists, replace the value.
# If the key doesn't exist, skip it (don't add new keys).
update_env_var() {
    local file="$1"
    local key="$2"
    local value="$3"

    if ! grep -q "^${key}=" "$file" 2>/dev/null; then
        return 1
    fi

    local old_value
    old_value=$(grep "^${key}=" "$file" | head -1 | cut -d'=' -f2-)

    if [ "$old_value" = "$value" ]; then
        echo "  $key — unchanged"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "  $key — ${YELLOW}would update${NC}: $old_value → $value"
    else
        # Use a delimiter that won't appear in hex addresses
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
        echo -e "  $key — ${GREEN}updated${NC}: $old_value → $value"
    fi
}

# ============================
# UPDATE CLIENT
# ============================

CLIENT_ENV="$ROOT_DIR/client/.env"

if [ -f "$CLIENT_ENV" ]; then
    echo -e "${GREEN}[INFO]${NC} Updating client/.env"
    update_env_var "$CLIENT_ENV" "VITE_DENSHOKAN_ADDRESS" "$DENSHOKAN"
    update_env_var "$CLIENT_ENV" "VITE_REGISTRY_ADDRESS" "$REGISTRY"
    update_env_var "$CLIENT_ENV" "VITE_VIEWER_ADDRESS" "$VIEWER"
    echo
else
    echo -e "${YELLOW}[SKIP]${NC} client/.env not found"
fi

# ============================
# UPDATE INDEXER
# ============================

INDEXER_ENV="$ROOT_DIR/indexer/.env"

if [ -f "$INDEXER_ENV" ]; then
    echo -e "${GREEN}[INFO]${NC} Updating indexer/.env"
    update_env_var "$INDEXER_ENV" "DENSHOKAN_ADDRESS" "$DENSHOKAN"
    update_env_var "$INDEXER_ENV" "REGISTRY_ADDRESS" "$REGISTRY"
    echo
else
    echo -e "${YELLOW}[SKIP]${NC} indexer/.env not found"
fi

# ============================
# SUMMARY
# ============================

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN]${NC} No files were modified. Run without --dry-run to apply."
else
    echo -e "${GREEN}[DONE]${NC} All env files synced."
fi
