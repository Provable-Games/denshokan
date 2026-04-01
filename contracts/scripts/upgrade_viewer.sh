#!/bin/bash

# DenshokanViewer Upgrade Script
# Declares a new DenshokanViewer class and upgrades the deployed contract.
# If upgrade fails (e.g. owner mismatch), falls back to deploying a fresh viewer.

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
VIEWER_ADDRESS="${VIEWER_ADDRESS:-}"
DENSHOKAN_ADDRESS="${DENSHOKAN_ADDRESS:-}"

if [ -z "$VIEWER_ADDRESS" ]; then
    print_error "VIEWER_ADDRESS is required. Set it in .env or as an environment variable."
    echo "  Usage: VIEWER_ADDRESS=0x... DENSHOKAN_ADDRESS=0x... ./scripts/upgrade_viewer.sh"
    exit 1
fi

if [ -z "$DENSHOKAN_ADDRESS" ]; then
    print_error "DENSHOKAN_ADDRESS is required (needed if deploying a new viewer)."
    echo "  Set it in .env or as an environment variable."
    exit 1
fi

# ============================
# DISPLAY CONFIGURATION
# ============================

print_info "Upgrade Configuration:"
echo "  Profile: $PROFILE"
echo "  Viewer Address: $VIEWER_ADDRESS"
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
if [ ! -f "$CONTRACTS_DIR/$ARTIFACT_DIR/denshokan_viewer_DenshokanViewer.contract_class.json" ]; then
    print_error "DenshokanViewer contract artifact not found at $ARTIFACT_DIR/denshokan_viewer_DenshokanViewer.contract_class.json"
    exit 1
fi

print_info "Contract artifact found"

# ============================
# DECLARE NEW CLASS
# ============================

print_info "Declaring DenshokanViewer contract..."

VIEWER_DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name DenshokanViewer \
    --package denshokan_viewer 2>&1) || {
    if echo "$VIEWER_DECLARE_OUTPUT" | grep -q "already declared"; then
        print_warning "DenshokanViewer already declared"
        NEW_CLASS_HASH=$(echo "$VIEWER_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare DenshokanViewer"
        echo "$VIEWER_DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${NEW_CLASS_HASH:-}" ]; then
    NEW_CLASS_HASH=$(echo "$VIEWER_DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$VIEWER_DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)
fi

if [ -z "$NEW_CLASS_HASH" ]; then
    print_error "Failed to extract new class hash"
    echo "$VIEWER_DECLARE_OUTPUT"
    exit 1
fi

print_info "New DenshokanViewer class hash: $NEW_CLASS_HASH"

# ============================
# ATTEMPT UPGRADE
# ============================

print_info "Attempting upgrade of DenshokanViewer at $VIEWER_ADDRESS..."

UPGRADE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    invoke \
    --contract-address "$VIEWER_ADDRESS" \
    --function "upgrade" \
    --arguments "$NEW_CLASS_HASH" 2>&1) || true

if echo "$UPGRADE_OUTPUT" | grep -qE "error|Error|ERROR"; then
    print_warning "Upgrade failed — will deploy a fresh viewer instead"
    echo "$UPGRADE_OUTPUT"
    echo ""

    # ============================
    # DEPLOY NEW VIEWER
    # ============================

    # Get deployer account address for viewer owner
    VIEWER_OWNER=$(sncast --profile "$PROFILE" account list 2>&1 | grep "address:" | head -1 | grep -oE '0x[0-9a-fA-F]+')
    if [ -z "$VIEWER_OWNER" ]; then
        print_error "Failed to get deployer account address for viewer owner."
        exit 1
    fi
    print_info "Viewer owner: $VIEWER_OWNER"

    print_info "Deploying new DenshokanViewer..."

    # Constructor: owner: ContractAddress, denshokan_address: ContractAddress
    VIEWER_DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
        deploy \
        --class-hash "$NEW_CLASS_HASH" \
        --arguments "$VIEWER_OWNER, $DENSHOKAN_ADDRESS" 2>&1)

    NEW_VIEWER_ADDRESS=$(echo "$VIEWER_DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' || echo "$VIEWER_DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

    if [ -z "$NEW_VIEWER_ADDRESS" ]; then
        print_error "Failed to deploy new DenshokanViewer"
        echo "$VIEWER_DEPLOY_OUTPUT"
        exit 1
    fi

    print_info "New DenshokanViewer deployed at: $NEW_VIEWER_ADDRESS"

    # ============================
    # SAVE DEPLOYMENT INFO
    # ============================

    UPGRADE_FILE="$CONTRACTS_DIR/deployments/viewer_upgrade_$(date +%Y%m%d_%H%M%S).json"
    mkdir -p "$CONTRACTS_DIR/deployments"

    cat > "$UPGRADE_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "action": "deploy_new",
  "previous_viewer_address": "$VIEWER_ADDRESS",
  "new_viewer_address": "$NEW_VIEWER_ADDRESS",
  "new_class_hash": "$NEW_CLASS_HASH",
  "parameters": {
    "owner": "$VIEWER_OWNER",
    "denshokan_address": "$DENSHOKAN_ADDRESS"
  }
}
EOF

    print_info "Deployment info saved to: $UPGRADE_FILE"

    echo
    print_info "=== NEW VIEWER DEPLOYED ==="
    echo
    echo "DenshokanViewer Contract:"
    echo "  Old Address: $VIEWER_ADDRESS"
    echo "  New Address: $NEW_VIEWER_ADDRESS"
    echo "  Class Hash:  $NEW_CLASS_HASH"
    echo "  Owner:       $VIEWER_OWNER"
    echo "  Denshokan:   $DENSHOKAN_ADDRESS"
    echo
    echo "Update your .env / client config with the new viewer address:"
    echo "  VIEWER_ADDRESS=$NEW_VIEWER_ADDRESS"
    echo
else
    print_info "Upgrade transaction submitted"
    echo "$UPGRADE_OUTPUT"

    # ============================
    # SAVE UPGRADE INFO
    # ============================

    UPGRADE_FILE="$CONTRACTS_DIR/deployments/viewer_upgrade_$(date +%Y%m%d_%H%M%S).json"
    mkdir -p "$CONTRACTS_DIR/deployments"

    cat > "$UPGRADE_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "action": "upgrade",
  "viewer_address": "$VIEWER_ADDRESS",
  "new_class_hash": "$NEW_CLASS_HASH"
}
EOF

    print_info "Upgrade info saved to: $UPGRADE_FILE"

    echo
    print_info "=== UPGRADE SUCCESSFUL ==="
    echo
    echo "DenshokanViewer Contract:"
    echo "  Address: $VIEWER_ADDRESS"
    echo "  New Class Hash: $NEW_CLASS_HASH"
    echo
fi
