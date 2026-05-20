#!/bin/bash

# Redeploys the DefaultRenderer (declare + deploy fresh instance) and
# repoints the deployed Denshokan token at the new address via
# `set_default_renderer_address`.
#
# Prerequisites:
#   - Denshokan has been class-upgraded with `set_default_renderer_address`
#     available (run `upgrade_denshokan.sh` first).
#   - sncast account configured in snfoundry.toml; account must own the
#     denshokan contract.
#
# Required env (read from contracts/.env):
#   DENSHOKAN_ADDRESS  - target denshokan to repoint
#   TOKEN_OWNER        - owner of the new renderer (use the same owner
#                        as the denshokan deployment unless you have a
#                        reason not to)
#
# Optional env:
#   PROFILE                = sepolia
#   SKIP_CONFIRMATION      = true to skip prompt
#   RENDERER_ONLY          = true to declare+deploy but skip the
#                            set_default_renderer_address call
#                            (useful for dry runs)
#
# Usage:
#   ./contracts/scripts/redeploy_default_renderer.sh

set -euo pipefail

# ============================
# ENVIRONMENT SETUP
# ============================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/.."

if [ -f "$CONTRACTS_DIR/.env" ]; then
    set -a
    source "$CONTRACTS_DIR/.env"
    set +a
    echo "Loaded environment variables from $CONTRACTS_DIR/.env"
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# ============================
# CONFIGURATION
# ============================

PROFILE="${PROFILE:-sepolia}"
DENSHOKAN_ADDRESS="${DENSHOKAN_ADDRESS:-}"
TOKEN_OWNER="${TOKEN_OWNER:-}"
RENDERER_ONLY="${RENDERER_ONLY:-false}"

if [ -z "$DENSHOKAN_ADDRESS" ]; then
    print_error "DENSHOKAN_ADDRESS is required (set in .env or as env var)."
    exit 1
fi

if [ -z "$TOKEN_OWNER" ]; then
    print_error "TOKEN_OWNER is required (the address that will own the new renderer)."
    exit 1
fi

print_info "Redeploy Configuration:"
echo "  Profile:           $PROFILE"
echo "  Denshokan Address: $DENSHOKAN_ADDRESS"
echo "  Renderer Owner:    $TOKEN_OWNER"
echo "  Renderer Only:     $RENDERER_ONLY"
echo

if [ "${SKIP_CONFIRMATION:-false}" != "true" ]; then
    read -p "Continue? (y/N) " -n 1 -r
    echo
    [[ ! $REPLY =~ ^[Yy]$ ]] && { print_info "Cancelled"; exit 0; }
fi

# ============================
# BUILD
# ============================

SCARB_PROFILE="release"
ARTIFACT_DIR="target/release"

cd "$CONTRACTS_DIR"

print_info "Building contracts ($SCARB_PROFILE profile)..."
scarb --profile "$SCARB_PROFILE" build --workspace

if [ ! -f "$CONTRACTS_DIR/$ARTIFACT_DIR/denshokan_renderer_DefaultRenderer.contract_class.json" ]; then
    print_error "DefaultRenderer artifact not found"
    exit 1
fi

# ============================
# DECLARE RENDERER
# ============================

print_info "Declaring DefaultRenderer..."

DECLARE_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    declare \
    --contract-name DefaultRenderer \
    --package denshokan_renderer 2>&1) || {
    if echo "$DECLARE_OUTPUT" | grep -q "already declared"; then
        print_warning "DefaultRenderer already declared (same class)"
        RENDERER_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | head -1)
    else
        print_error "Failed to declare DefaultRenderer"
        echo "$DECLARE_OUTPUT"
        exit 1
    fi
}

if [ -z "${RENDERER_CLASS_HASH:-}" ]; then
    RENDERER_CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -oE 'class_hash: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' \
        || echo "$DECLARE_OUTPUT" | grep -oE '0x[0-9a-fA-F]+' | tail -1)
fi

if [ -z "$RENDERER_CLASS_HASH" ]; then
    print_error "Failed to extract renderer class hash"
    echo "$DECLARE_OUTPUT"
    exit 1
fi

print_info "Renderer class hash: $RENDERER_CLASS_HASH"

# ============================
# DEPLOY RENDERER
# ============================

print_info "Deploying DefaultRenderer with owner=$TOKEN_OWNER..."

DEPLOY_OUTPUT=$(sncast --profile "$PROFILE" --wait \
    deploy \
    --class-hash "$RENDERER_CLASS_HASH" \
    --arguments "$TOKEN_OWNER" 2>&1)

NEW_RENDERER_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -oE 'contract_address: 0x[0-9a-fA-F]+' | grep -oE '0x[0-9a-fA-F]+' \
    || echo "$DEPLOY_OUTPUT" | grep -oE '0x[0-9a-fA-F]{64}' | head -1)

if [ -z "$NEW_RENDERER_ADDRESS" ]; then
    print_error "Failed to deploy DefaultRenderer"
    echo "$DEPLOY_OUTPUT"
    exit 1
fi

print_info "DefaultRenderer deployed at: $NEW_RENDERER_ADDRESS"

# ============================
# REPOINT DENSHOKAN
# ============================

if [ "$RENDERER_ONLY" = "true" ]; then
    print_warning "RENDERER_ONLY=true — skipping set_default_renderer_address call"
else
    print_info "Calling set_default_renderer_address on $DENSHOKAN_ADDRESS..."

    REPOINT_OUTPUT=$(sncast --profile "$PROFILE" --wait \
        invoke \
        --contract-address "$DENSHOKAN_ADDRESS" \
        --function "set_default_renderer_address" \
        --arguments "$NEW_RENDERER_ADDRESS" 2>&1) || {
        print_error "Failed to call set_default_renderer_address. Caller must be denshokan owner."
        echo "$REPOINT_OUTPUT"
        exit 1
    }

    print_info "Denshokan repointed to new renderer"
fi

# ============================
# SAVE LOG
# ============================

LOG_FILE="$CONTRACTS_DIR/deployments/renderer_redeploy_$(date +%Y%m%d_%H%M%S).json"
mkdir -p "$CONTRACTS_DIR/deployments"

cat > "$LOG_FILE" << EOF
{
  "profile": "$PROFILE",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "action": "redeploy_default_renderer",
  "denshokan_address": "$DENSHOKAN_ADDRESS",
  "new_renderer_address": "$NEW_RENDERER_ADDRESS",
  "new_renderer_class_hash": "$RENDERER_CLASS_HASH",
  "renderer_only": $RENDERER_ONLY
}
EOF

# ============================
# SUMMARY
# ============================

echo
print_info "=== REDEPLOY SUCCESSFUL ==="
echo
echo "  Denshokan:        $DENSHOKAN_ADDRESS"
echo "  New Renderer:     $NEW_RENDERER_ADDRESS"
echo "  Renderer Class:   $RENDERER_CLASS_HASH"
echo
echo "Log saved to: $LOG_FILE"
echo

if [ "$RENDERER_ONLY" != "true" ]; then
    print_info "Next: re-enable quarantined token URI fetches in the indexer DB:"
    echo "  UPDATE tokens SET token_uri_fetch_failed = false,"
    echo "                    token_uri_fetch_last_error = NULL"
    echo "  WHERE token_uri_fetch_failed = true;"
fi
