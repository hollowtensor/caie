#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# CAIE EC2 Start Script
# ──────────────────────────────────────────────────────────────────────
#
# Starts all CAIE services in a tmux session.
#
# Usage:
#   ./start.sh
#
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$REPO_DIR/server"
CLIENT_DIR="$REPO_DIR/client"

SESSION_NAME="caie"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# ──────────────────────────────────────────────────────────────────────
# Ensure Docker services are running
# ──────────────────────────────────────────────────────────────────────

log_info "Ensuring Docker services are running..."
cd "$SERVER_DIR"
docker compose up -d postgres redis minio

# ──────────────────────────────────────────────────────────────────────
# Kill existing tmux session if it exists
# ──────────────────────────────────────────────────────────────────────

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log_warn "Killing existing tmux session '$SESSION_NAME'..."
    tmux kill-session -t "$SESSION_NAME"
fi

# ──────────────────────────────────────────────────────────────────────
# Create tmux session with all services
# ──────────────────────────────────────────────────────────────────────

log_info "Creating tmux session '$SESSION_NAME'..."

# Window 0: LightOnOCR vLLM server
tmux new-session -d -s "$SESSION_NAME" -n ocr
tmux send-keys -t "$SESSION_NAME:ocr" "source ~/miniconda3/bin/activate lightonocr && cd $REPO_DIR && vllm serve lightonai/LightOnOCR-2-1B --host 0.0.0.0 --port 8000 --limit-mm-per-prompt '{\"image\": 1}' --mm-processor-cache-gb 0 --no-enable-prefix-caching --gpu-memory-utilization 0.85" Enter

# Window 1: Flask server
tmux new-window -t "$SESSION_NAME" -n flask
tmux send-keys -t "$SESSION_NAME:flask" "source ~/miniconda3/bin/activate caie && cd $SERVER_DIR && PYTHONPATH=. python -m app" Enter

# Window 2: Client dev server
tmux new-window -t "$SESSION_NAME" -n client
tmux send-keys -t "$SESSION_NAME:client" "source ~/.nvm/nvm.sh && nvm use 22 && cd $CLIENT_DIR && npm run dev -- --host 0.0.0.0" Enter

# ──────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────

log_info "Tmux session '$SESSION_NAME' created with windows:"
tmux list-windows -t "$SESSION_NAME"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Services starting..."
echo ""
echo "  To attach to tmux session:"
echo "    tmux attach -t $SESSION_NAME"
echo ""
echo "  Switch windows:"
echo "    Ctrl+b 0  - OCR server (port 8000)"
echo "    Ctrl+b 1  - Flask server (port 5001)"
echo "    Ctrl+b 2  - Client (port 5173)"
echo ""
echo "  Detach: Ctrl+b d"
echo ""
echo "  Check status:"
echo "    ./status.sh"
echo ""
echo "════════════════════════════════════════════════════════════════"
