#!/bin/bash

# Denshokan Token Upgrade Script
# Declares a new Denshokan class and upgrades the deployed contract.
#
# Prerequisites:
#   - sncast account configured in snfoundry.toml
#   - Account must be the contract owner
#   - DENSHOKAN_ADDRESS set in .env or environment
#
# Usage:
#   ./contracts/scripts/upgrade_denshokan.sh

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

PROFILE="${PROFILE:-sepolia}"
DENSHOKAN_ADDRESS="${DENSHOKAN_ADDRESS:-}"

if [ -z "$DENSHOKAN_ADDRESS" ]; then
    print_error "DENSHOKAN_ADDRESS is required. Set it in .env or as an environment variable."
    echo "  Usage: DENSHOKAN_ADDRESS=0x... ./contracts/scripts/upgrade_denshokan.sh"
    exit 1
fi

# ============================
# DISPLAY CONFIGURATION
# ============================

print_info "Upgrade Configuration:"
echo "  Profile: $PROFILE"
echo "  Denshokan Address: $DENSHOKAN_ADDRESS"
echo ""

# Confirm upgrade
if [ "${SKIP_CONFIRMATION:-false}" != "true" ]; then
    read -p "Continue with upgrade? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Upgrade cancelled"
        exit 0
    fi
fi

# ============================
# BUILD CONTRACTS
# ============================

SCARB_PROFILE="release"
ARTIFACT_DIR="target/release"

cd "$CONTRACTS_DIR"

print_info "Building contracts ($SCARB_PROFILE profile)..."
scarb --profile "$SCARB_PROFILE" build --workspace

# Verify contract artifact exists
if [ ! -f "$CONTRACTS_DIR/$ARTIFACT_DIR/denshokan_token_Denshokan.contract_class.json" ]; then
    print_error "Denshokan contract artifact not found at $ARTIFACT_DIR/denshokan_token_Denshokan.contract_class.json"
    exit 1
fi

print_info "Contract artifact found"

# ============================
# DECLARE NEW CLASS
# ============================

print_info "Declaring Denshokan contract..."

DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name Denshokan \
    --package denshokan_token 2>&1) || {
    if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
        print_warning "Denshokan already declared"
        NEW_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare Denshokan"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${NEW_CLASS_HASH:-}" ]; then
    NEW_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)
fi

if [ -z "$NEW_CLASS_HASH" ]; then
    print_error "Failed to extract new class hash"
    echo "$DECLARE_OUTPUT"
    exit 1
fi

print_info "New Denshokan class hash: $NEW_CLASS_HASH"

# ============================
# UPGRADE CONTRACT
# ============================

print_info "Upgrading Denshokan at $DENSHOKAN_ADDRESS..."

UPGRADE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    invoke \
    --contract-address "$DENSHOKAN_ADDRESS" \
    --function "upgrade" \
    --arguments "$NEW_CLASS_HASH" 2>&1) || {
    print_error "Failed to upgrade Denshokan. Ensure the caller is the contract owner."
    echo "$UPGRADE_OUTPUT"
    exit 1
}

print_info "Upgrade transaction submitted"
echo "$UPGRADE_OUTPUT"

# ============================
# SAVE UPGRADE INFO
# ============================

UPGRADE_FILE="$CONTRACTS_DIR/deployments/denshokan_upgrade_$(date +%Y%m%d_%H%M%S).json"
mkdir -p "$CONTRACTS_DIR/deployments"

cat > "$UPGRADE_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "action": "upgrade",
  "denshokan_address": "$DENSHOKAN_ADDRESS",
  "new_class_hash": "$NEW_CLASS_HASH"
}
EOF

print_info "Upgrade info saved to: $UPGRADE_FILE"

# ============================
# SUMMARY
# ============================

echo
print_info "=== UPGRADE SUCCESSFUL ==="
echo
echo "Denshokan Token Contract:"
echo "  Address: $DENSHOKAN_ADDRESS"
echo "  New Class Hash: $NEW_CLASS_HASH"
echo
echo "Saved to: $UPGRADE_FILE"
echo
