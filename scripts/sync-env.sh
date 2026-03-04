#!/bin/bash

# Sync contract addresses from contracts/.env to other packages
# Source of truth: contracts/.env (updated by deployment scripts)
#
# Updates:
#   - indexer/.env               (DENSHOKAN_ADDRESS, REGISTRY_ADDRESS)
#   - client/src/networks.ts     (address fields in SN_MAIN or SN_SEPOLIA section)
#
# Game addresses (numberGuess, ticTacToe) are loaded from deployment JSON files
# in contracts/deployments/ when available.
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

# Determine target network from PROFILE
PROFILE="${PROFILE:-sepolia}"
if [ "$PROFILE" = "mainnet" ]; then
    NETWORK_SECTION="SN_MAIN"
else
    NETWORK_SECTION="SN_SEPOLIA"
fi

echo -e "${GREEN}[INFO]${NC} Source addresses (from contracts/.env, profile=$PROFILE):"
echo "  Denshokan:    $DENSHOKAN"
echo "  Registry:     $REGISTRY"
echo "  Viewer:       $VIEWER"
echo "  Targets:      indexer/.env, client/src/networks.ts ($NETWORK_SECTION)"
echo

# ============================
# HELPERS
# ============================

# Update a key=value line in a .env file
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

# Update an address field in the correct network section of networks.ts
# Uses awk to find the section (e.g. SN_SEPOLIA: {) and then replace the
# matching property line within that section's block.
update_network_address() {
    local file="$1"
    local section="$2"   # e.g. SN_MAIN or SN_SEPOLIA
    local field="$3"     # e.g. denshokanAddress
    local value="$4"     # e.g. 0x00c4...

    if [ -z "$value" ]; then
        echo "  $field — skipped (no value)"
        return 0
    fi

    # Extract the current value for display
    local old_value
    old_value=$(awk -v section="$section" -v field="$field" '
        $0 ~ section ": \\{" { in_section = 1 }
        in_section && $0 ~ field ": \"" {
            match($0, /"[^"]*"/)
            print substr($0, RSTART+1, RLENGTH-2)
            exit
        }
        in_section && /^  \}/ { in_section = 0 }
    ' "$file")

    if [ "$old_value" = "$value" ]; then
        echo "  $field — unchanged"
        return 0
    fi

    if [ "$DRY_RUN" = true ]; then
        echo -e "  $field — ${YELLOW}would update${NC}: ${old_value:-(empty)} → $value"
    else
        awk -v section="$section" -v field="$field" -v value="$value" '
            $0 ~ section ": \\{" { in_section = 1 }
            in_section && $0 ~ field ": \"" {
                # Replace the quoted value on this line
                sub(/"[^"]*"/, "\"" value "\"")
            }
            in_section && /^  \}/ { in_section = 0 }
            { print }
        ' "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
        echo -e "  $field — ${GREEN}updated${NC}: ${old_value:-(empty)} → $value"
    fi
}

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
# UPDATE CLIENT NETWORKS.TS
# ============================

NETWORKS_TS="$ROOT_DIR/client/src/networks.ts"

if [ -f "$NETWORKS_TS" ]; then
    echo -e "${GREEN}[INFO]${NC} Updating client/src/networks.ts ($NETWORK_SECTION)"
    update_network_address "$NETWORKS_TS" "$NETWORK_SECTION" "denshokanAddress" "$DENSHOKAN"
    update_network_address "$NETWORKS_TS" "$NETWORK_SECTION" "registryAddress" "$REGISTRY"
    update_network_address "$NETWORKS_TS" "$NETWORK_SECTION" "viewerAddress" "$VIEWER"
    echo
else
    echo -e "${YELLOW}[SKIP]${NC} client/src/networks.ts not found"
fi

# ============================
# SUMMARY
# ============================

if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}[DRY RUN]${NC} No files were modified. Run without --dry-run to apply."
else
    echo -e "${GREEN}[DONE]${NC} All files synced."
fi
