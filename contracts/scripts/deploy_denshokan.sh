#!/bin/bash

# Denshokan Contract Deployment Script
# Deploys the Denshokan token contract and MinigameRegistry using sncast

set -euo pipefail

# ============================
# ENVIRONMENT SETUP
# ============================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."

# Load .env if it exists
if [ -f "$CONTRACTS_DIR/.env" ]; then
    set -a
    source "$CONTRACTS_DIR/.env"
    set +a
    echo "Loaded environment variables from $CONTRACTS_DIR/.env"
fi

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# ============================
# CONFIGURATION
# ============================

# Profile from snfoundry.toml (default, sepolia, mainnet)
PROFILE="${PROFILE:-sepolia}"

# Registry parameters
REGISTRY_NAME="${REGISTRY_NAME:-DenshokanRegistry}"
REGISTRY_SYMBOL="${REGISTRY_SYMBOL:-DREG}"
REGISTRY_BASE_URI="${REGISTRY_BASE_URI:-https://api.denshokan.dev/registry/}"

# Token parameters
TOKEN_NAME="${TOKEN_NAME:-Denshokan}"
TOKEN_SYMBOL="${TOKEN_SYMBOL:-DNSH}"
TOKEN_BASE_URI="${TOKEN_BASE_URI:-https://api.denshokan.dev/token/}"

# Optional: existing registry address (skip registry deployment if set)
GAME_REGISTRY_ADDRESS="${GAME_REGISTRY_ADDRESS:-}"

# ============================
# DISPLAY CONFIGURATION
# ============================

print_info "Deployment Configuration:"
echo "  Profile: $PROFILE (from snfoundry.toml)"
echo ""
echo "  Registry Parameters:"
echo "    Name: $REGISTRY_NAME"
echo "    Symbol: $REGISTRY_SYMBOL"
echo "    Base URI: $REGISTRY_BASE_URI"
echo ""
echo "  Token Parameters:"
echo "    Name: $TOKEN_NAME"
echo "    Symbol: $TOKEN_SYMBOL"
echo "    Base URI: $TOKEN_BASE_URI"
echo ""
if [ -n "$GAME_REGISTRY_ADDRESS" ]; then
    echo "  Using existing registry: $GAME_REGISTRY_ADDRESS"
fi

# Confirm deployment
if [ "${SKIP_CONFIRMATION:-false}" != "true" ]; then
    read -p "Continue with deployment? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Deployment cancelled"
        exit 0
    fi
fi

# ============================
# BUILD CONTRACTS
# ============================

print_info "Building contracts..."
cd "$CONTRACTS_DIR"
scarb build

# Verify contract artifacts exist
if [ ! -f "$CONTRACTS_DIR/target/dev/denshokan_Denshokan.contract_class.json" ]; then
    print_error "Denshokan contract artifact not found"
    exit 1
fi

if [ ! -f "$CONTRACTS_DIR/target/dev/denshokan_MinigameRegistry.contract_class.json" ]; then
    print_error "MinigameRegistry contract artifact not found"
    exit 1
fi

print_info "Contract artifacts found"

# ============================
# DEPLOY MINIGAME REGISTRY
# ============================

if [ -z "$GAME_REGISTRY_ADDRESS" ]; then
    print_info "Declaring MinigameRegistry contract..."

    REGISTRY_DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
        declare \
        --contract-name MinigameRegistry 2>&1) || {
        # Check if already declared
        if echo "$REGISTRY_DECLARE_OUTPUT" | grep -q "already declared"; then
            print_warning "MinigameRegistry already declared"
            REGISTRY_CLASS_HASH=$(echo "$REGISTRY_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
        else
            print_error "Failed to declare MinigameRegistry"
            echo "$REGISTRY_DECLARE_OUTPUT"
            exit 1
        fi
    }

    if [ -z "${REGISTRY_CLASS_HASH:-}" ]; then
        REGISTRY_CLASS_HASH=$(echo "$REGISTRY_DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$REGISTRY_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)
    fi

    print_info "MinigameRegistry class hash: $REGISTRY_CLASS_HASH"

    print_info "Deploying MinigameRegistry contract..."

    # Constructor: name: ByteArray, symbol: ByteArray, base_uri: ByteArray
    REGISTRY_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
        deploy \
        --class-hash "$REGISTRY_CLASS_HASH" \
        --arguments "\"$REGISTRY_NAME\", \"$REGISTRY_SYMBOL\", \"$REGISTRY_BASE_URI\"" 2>&1)

    GAME_REGISTRY_ADDRESS=$(echo "$REGISTRY_DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$REGISTRY_DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

    if [ -z "$GAME_REGISTRY_ADDRESS" ]; then
        print_error "Failed to deploy MinigameRegistry"
        echo "$REGISTRY_DEPLOY_OUTPUT"
        exit 1
    fi

    print_info "MinigameRegistry deployed at: $GAME_REGISTRY_ADDRESS"
else
    print_info "Using existing registry at: $GAME_REGISTRY_ADDRESS"
fi

# ============================
# DEPLOY DENSHOKAN TOKEN
# ============================

print_info "Declaring Denshokan contract..."

DENSHOKAN_DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name Denshokan 2>&1) || {
    if echo "$DENSHOKAN_DECLARE_OUTPUT" | grep -q "already declared"; then
        print_warning "Denshokan already declared"
        DENSHOKAN_CLASS_HASH=$(echo "$DENSHOKAN_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare Denshokan"
        echo "$DENSHOKAN_DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${DENSHOKAN_CLASS_HASH:-}" ]; then
    DENSHOKAN_CLASS_HASH=$(echo "$DENSHOKAN_DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$DENSHOKAN_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)
fi

print_info "Denshokan class hash: $DENSHOKAN_CLASS_HASH"

print_info "Deploying Denshokan contract..."

# Constructor: name: ByteArray, symbol: ByteArray, base_uri: ByteArray,
#              game_registry_address: ContractAddress
DENSHOKAN_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$DENSHOKAN_CLASS_HASH" \
    --arguments "\"$TOKEN_NAME\", \"$TOKEN_SYMBOL\", \"$TOKEN_BASE_URI\", $GAME_REGISTRY_ADDRESS" 2>&1)

CONTRACT_ADDRESS=$(echo "$DENSHOKAN_DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$DENSHOKAN_DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

if [ -z "$CONTRACT_ADDRESS" ]; then
    print_error "Failed to deploy Denshokan"
    echo "$DENSHOKAN_DEPLOY_OUTPUT"
    exit 1
fi

print_info "Denshokan deployed at: $CONTRACT_ADDRESS"

# ============================
# SAVE DEPLOYMENT INFO
# ============================

DEPLOYMENT_FILE="$CONTRACTS_DIR/deployments/denshokan_$(date +%Y%m%d_%H%M%S).json"
mkdir -p "$CONTRACTS_DIR/deployments"

cat > "$DEPLOYMENT_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "denshokan_contract": {
    "address": "$CONTRACT_ADDRESS",
    "class_hash": "$DENSHOKAN_CLASS_HASH",
    "parameters": {
      "name": "$TOKEN_NAME",
      "symbol": "$TOKEN_SYMBOL",
      "base_uri": "$TOKEN_BASE_URI",
      "game_registry_address": "$GAME_REGISTRY_ADDRESS"
    }
  },
  "minigame_registry_contract": {
    "address": "$GAME_REGISTRY_ADDRESS",
    "class_hash": "${REGISTRY_CLASS_HASH:-existing}",
    "parameters": {
      "name": "$REGISTRY_NAME",
      "symbol": "$REGISTRY_SYMBOL",
      "base_uri": "$REGISTRY_BASE_URI"
    }
  }
}
EOF

print_info "Deployment info saved to: $DEPLOYMENT_FILE"

# ============================
# DEPLOYMENT SUMMARY
# ============================

echo
print_info "=== DEPLOYMENT SUCCESSFUL ==="
echo
echo "MinigameRegistry Contract:"
echo "  Address: $GAME_REGISTRY_ADDRESS"
if [ -n "${REGISTRY_CLASS_HASH:-}" ]; then
    echo "  Class Hash: $REGISTRY_CLASS_HASH"
fi
echo
echo "Denshokan Token Contract:"
echo "  Address: $CONTRACT_ADDRESS"
echo "  Class Hash: $DENSHOKAN_CLASS_HASH"
echo "  Token Name: $TOKEN_NAME"
echo "  Token Symbol: $TOKEN_SYMBOL"
echo "  Base URI: $TOKEN_BASE_URI"
echo "  Game Registry: $GAME_REGISTRY_ADDRESS"
echo

echo "To interact with the contracts:"
echo "  export DENSHOKAN_CONTRACT=$CONTRACT_ADDRESS"
echo "  export GAME_REGISTRY=$GAME_REGISTRY_ADDRESS"
echo
