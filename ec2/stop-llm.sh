#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# CAIE LLM Server Stop Script
# ──────────────────────────────────────────────────────────────────────
#
# Stops the Qwen3-8B llama-server running on port 8001.
#
# Usage:
#   ./stop-llm.sh
#
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

PORT="8001"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# Kill tmux window if it exists
if tmux has-session -t caie 2>/dev/null; then
    if tmux list-windows -t caie | grep -q "llm"; then
        log_info "Stopping tmux window 'llm'..."
        tmux send-keys -t caie:llm C-c
        sleep 2
        tmux kill-window -t caie:llm 2>/dev/null || true
        log_info "LLM tmux window stopped."
    else
        log_warn "No 'llm' window found in tmux session 'caie'."
    fi
fi

# Also kill any llama-server process on the port
PID=$(lsof -ti:$PORT 2>/dev/null || true)
if [ -n "$PID" ]; then
    log_info "Killing llama-server process (PID: $PID) on port $PORT..."
    kill "$PID" 2>/dev/null || true
    sleep 1
    # Force kill if still running
    if kill -0 "$PID" 2>/dev/null; then
        kill -9 "$PID" 2>/dev/null || true
    fi
    log_info "Process killed."
else
    log_warn "No process found on port $PORT."
fi

log_info "LLM server stopped."
