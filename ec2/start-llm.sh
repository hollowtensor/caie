#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# CAIE LLM Server Start Script
# ──────────────────────────────────────────────────────────────────────
#
# Starts Qwen3-8B-GGUF using llama-server on port 8001.
# Requires llama.cpp to be built at ~/llama.cpp
#
# Usage:
#   ./start-llm.sh              # Start in foreground
#   ./start-llm.sh --background # Start in tmux
#
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

LLAMA_SERVER="$HOME/llama.cpp/build/bin/llama-server"
MODEL="Qwen/Qwen3-8B-GGUF"
HOST="0.0.0.0"
PORT="8001"
GPU_LAYERS="99"  # Offload all layers to GPU
CONTEXT_SIZE="16384"  # Qwen3-8B supports up to 40960

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if llama-server exists
if [ ! -f "$LLAMA_SERVER" ]; then
    log_error "llama-server not found at $LLAMA_SERVER"
    log_error "Please build llama.cpp first:"
    log_error "  cd ~/llama.cpp && cmake -B build -DGGML_CUDA=ON && cmake --build build -j"
    exit 1
fi

# Check for background flag
BACKGROUND=false
for arg in "$@"; do
    case $arg in
        --background|-b)
            BACKGROUND=true
            shift
            ;;
    esac
done

if [ "$BACKGROUND" = true ]; then
    # Start in tmux window
    if ! tmux has-session -t caie 2>/dev/null; then
        log_error "Tmux session 'caie' not found. Run ./start.sh first."
        exit 1
    fi

    # Check if llm window exists
    if tmux list-windows -t caie | grep -q "llm"; then
        log_info "Killing existing llm window..."
        tmux kill-window -t caie:llm 2>/dev/null || true
    fi

    tmux new-window -t caie -n llm
    tmux send-keys -t caie:llm "cd ~/llama.cpp && $LLAMA_SERVER -hf $MODEL -ngl $GPU_LAYERS --host $HOST --port $PORT -c $CONTEXT_SIZE" Enter

    log_info "LLM server starting in tmux window 'llm'"
    log_info "Attach with: tmux attach -t caie"
else
    # Start in foreground
    log_info "Starting Qwen3-8B-GGUF on port $PORT with context $CONTEXT_SIZE..."
    cd ~/llama.cpp
    exec "$LLAMA_SERVER" -hf "$MODEL" -ngl "$GPU_LAYERS" --host "$HOST" --port "$PORT" -c "$CONTEXT_SIZE"
fi
