#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# CAIE EC2 Status Script
# ──────────────────────────────────────────────────────────────────────
#
# Checks the health of all CAIE services.
#
# Usage:
#   ./status.sh
#
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$REPO_DIR/server"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_service() {
    local name=$1
    local url=$2
    local expected=$3

    if curl -s --max-time 5 "$url" | grep -q "$expected" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $name"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name"
        return 1
    fi
}

check_port() {
    local name=$1
    local port=$2

    if nc -z localhost "$port" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} $name (port $port)"
        return 0
    else
        echo -e "  ${RED}✗${NC} $name (port $port)"
        return 1
    fi
}

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  CAIE Service Status"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ──────────────────────────────────────────────────────────────────────
# Check Docker services
# ──────────────────────────────────────────────────────────────────────

echo "Docker Services:"
cd "$SERVER_DIR"

if docker compose ps --format json 2>/dev/null | grep -q "postgres"; then
    pg_status=$(docker compose ps postgres --format "{{.Status}}" 2>/dev/null || echo "unknown")
    if echo "$pg_status" | grep -q "healthy"; then
        echo -e "  ${GREEN}✓${NC} PostgreSQL (healthy)"
    else
        echo -e "  ${YELLOW}~${NC} PostgreSQL ($pg_status)"
    fi
else
    echo -e "  ${RED}✗${NC} PostgreSQL (not running)"
fi

if docker compose ps --format json 2>/dev/null | grep -q "redis"; then
    redis_status=$(docker compose ps redis --format "{{.Status}}" 2>/dev/null || echo "unknown")
    if echo "$redis_status" | grep -q "healthy"; then
        echo -e "  ${GREEN}✓${NC} Redis (healthy)"
    else
        echo -e "  ${YELLOW}~${NC} Redis ($redis_status)"
    fi
else
    echo -e "  ${RED}✗${NC} Redis (not running)"
fi

if docker compose ps --format json 2>/dev/null | grep -q "minio"; then
    minio_status=$(docker compose ps minio --format "{{.Status}}" 2>/dev/null || echo "unknown")
    if echo "$minio_status" | grep -q "healthy"; then
        echo -e "  ${GREEN}✓${NC} Minio (healthy)"
    else
        echo -e "  ${YELLOW}~${NC} Minio ($minio_status)"
    fi
else
    echo -e "  ${RED}✗${NC} Minio (not running)"
fi

echo ""

# ──────────────────────────────────────────────────────────────────────
# Check application services
# ──────────────────────────────────────────────────────────────────────

echo "Application Services:"

# OCR Server (vLLM)
if curl -s --max-time 5 "http://localhost:8000/v1/models" | grep -q "LightOnOCR" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} LightOnOCR vLLM (port 8000)"
else
    echo -e "  ${RED}✗${NC} LightOnOCR vLLM (port 8000)"
fi

# LLM Server (llama-server with Qwen3-8B)
if curl -s --max-time 5 "http://localhost:8001/v1/models" | grep -q "qwen" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Qwen3-8B llama-server (port 8001)"
else
    echo -e "  ${RED}✗${NC} Qwen3-8B llama-server (port 8001)"
fi

# Flask API
if curl -s --max-time 5 "http://localhost:5001/api/auth/me" 2>/dev/null | grep -qE "(Unauthorized|user)"; then
    echo -e "  ${GREEN}✓${NC} Flask API (port 5001)"
elif nc -z localhost 5001 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Flask API (port 5001)"
else
    echo -e "  ${RED}✗${NC} Flask API (port 5001)"
fi

# Client (Vite)
if curl -s --max-time 5 "http://localhost:5173/" | grep -q "html" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Client Vite (port 5173)"
else
    echo -e "  ${RED}✗${NC} Client Vite (port 5173)"
fi

echo ""

# ──────────────────────────────────────────────────────────────────────
# Check tmux session
# ──────────────────────────────────────────────────────────────────────

echo "Tmux Session:"
if tmux has-session -t caie 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} Session 'caie' exists"
    echo ""
    echo "  Windows:"
    tmux list-windows -t caie -F "    - #{window_index}: #{window_name}" 2>/dev/null || true
else
    echo -e "  ${RED}✗${NC} Session 'caie' not found"
fi

echo ""

# ──────────────────────────────────────────────────────────────────────
# GPU Status
# ──────────────────────────────────────────────────────────────────────

echo "GPU Status:"
if nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null; then
    :
else
    echo -e "  ${YELLOW}~${NC} nvidia-smi not available"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
