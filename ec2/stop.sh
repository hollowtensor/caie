#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# CAIE EC2 Stop Script
# ──────────────────────────────────────────────────────────────────────
#
# Stops all CAIE services.
#
# Usage:
#   ./stop.sh              # Stop tmux session only
#   ./stop.sh --all        # Stop tmux session and Docker services
#
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$REPO_DIR/server"

SESSION_NAME="caie"
STOP_DOCKER=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --all)
            STOP_DOCKER=true
            shift
            ;;
    esac
done

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# ──────────────────────────────────────────────────────────────────────
# Stop tmux session
# ──────────────────────────────────────────────────────────────────────

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log_info "Stopping tmux session '$SESSION_NAME'..."
    tmux kill-session -t "$SESSION_NAME"
    log_info "Tmux session stopped."
else
    log_warn "Tmux session '$SESSION_NAME' not found."
fi

# ──────────────────────────────────────────────────────────────────────
# Stop Docker services (if --all flag is passed)
# ──────────────────────────────────────────────────────────────────────

if [ "$STOP_DOCKER" = true ]; then
    log_info "Stopping Docker services..."
    cd "$SERVER_DIR"
    docker compose down
    log_info "Docker services stopped."
else
    log_info "Docker services still running. Use './stop.sh --all' to stop them."
fi

echo ""
log_info "All services stopped."
