#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
# CAIE EC2 Setup Script
# ──────────────────────────────────────────────────────────────────────
#
# Prerequisites:
#   - Ubuntu 22.04 with GPU (Deep Learning AMI recommended)
#   - Miniconda3 installed at ~/miniconda3
#   - Docker installed
#   - nvm installed for Node.js
#
# Usage:
#   cd ~/caie/ec2
#   chmod +x setup.sh
#   ./setup.sh
#
# ──────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$REPO_DIR/server"
CLIENT_DIR="$REPO_DIR/client"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ──────────────────────────────────────────────────────────────────────
# Check prerequisites
# ──────────────────────────────────────────────────────────────────────

log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if [ ! -d "$HOME/miniconda3" ]; then
    log_error "Miniconda3 not found at ~/miniconda3. Please install it first."
    exit 1
fi

if ! nvidia-smi &> /dev/null; then
    log_warn "nvidia-smi not found. GPU may not be available."
fi

log_info "Prerequisites OK"

# ──────────────────────────────────────────────────────────────────────
# Create lightonocr conda environment
# ──────────────────────────────────────────────────────────────────────

log_info "Setting up lightonocr conda environment..."

if ~/miniconda3/bin/conda env list | grep -q "^lightonocr "; then
    log_warn "lightonocr environment already exists. Skipping creation."
else
    ~/miniconda3/bin/conda create -n lightonocr python=3.11 -y
fi

log_info "Installing vLLM and dependencies in lightonocr env..."
source ~/miniconda3/bin/activate lightonocr

# Install vLLM first (pins transformers<5)
pip install --default-timeout=300 vllm==0.15.0 pypdfium2

# Override with transformers>=5.0.0 (required by LightOnOCR-2-1B)
pip install --default-timeout=300 "transformers>=5.0.0"

log_info "Downloading LightOnOCR-2-1B model..."
python -c "
from huggingface_hub import snapshot_download
snapshot_download('lightonai/LightOnOCR-2-1B')
print('Model downloaded.')
"

conda deactivate

# ──────────────────────────────────────────────────────────────────────
# Create caie conda environment for Flask
# ──────────────────────────────────────────────────────────────────────

log_info "Setting up caie conda environment for Flask..."

if ~/miniconda3/bin/conda env list | grep -q "^caie "; then
    log_warn "caie environment already exists. Skipping creation."
else
    ~/miniconda3/bin/conda create -n caie python=3.11 -y
fi

log_info "Installing Flask dependencies in caie env..."
source ~/miniconda3/bin/activate caie

pip install -r "$SERVER_DIR/requirements.txt" httpx minio pillow

conda deactivate

# ──────────────────────────────────────────────────────────────────────
# Create server .env file
# ──────────────────────────────────────────────────────────────────────

log_info "Creating server .env file..."

if [ -f "$SERVER_DIR/.env" ]; then
    log_warn ".env file already exists. Backing up to .env.backup"
    cp "$SERVER_DIR/.env" "$SERVER_DIR/.env.backup"
fi

cat > "$SERVER_DIR/.env" << 'EOF'
DATABASE_URL=postgresql://caie:caie_dev@localhost:5432/caie
REDIS_URL=redis://localhost:6379/0
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_SECURE=false
MINIO_BUCKET_PDFS=caie-pdfs
MINIO_BUCKET_PAGES=caie-pages
MINIO_BUCKET_OUTPUT=caie-output
JWT_SECRET_KEY=dev-secret-key-change-in-prod
JWT_ACCESS_TOKEN_EXPIRES=900
JWT_REFRESH_TOKEN_EXPIRES=2592000
LIGHTONOCR_SERVER_URL=http://localhost:8000/v1
VLM_SERVER_URL=http://localhost:8001/v1
VLM_MODEL=Qwen/Qwen2.5-VL-7B-Instruct
LLM_SERVER_URL=http://localhost:8001/v1
LLM_MODEL=Qwen/Qwen2.5-7B-Instruct
EOF

log_info ".env file created at $SERVER_DIR/.env"

# ──────────────────────────────────────────────────────────────────────
# Start Docker services
# ──────────────────────────────────────────────────────────────────────

log_info "Starting Docker services (postgres, redis, minio)..."

cd "$SERVER_DIR"
docker compose up -d postgres redis minio

log_info "Waiting for services to be healthy..."
sleep 10

docker compose ps

# ──────────────────────────────────────────────────────────────────────
# Run database migrations
# ──────────────────────────────────────────────────────────────────────

log_info "Running database migrations..."

source ~/miniconda3/bin/activate caie
cd "$SERVER_DIR"
PYTHONPATH=. FLASK_APP=app flask db upgrade
conda deactivate

# ──────────────────────────────────────────────────────────────────────
# Install client dependencies
# ──────────────────────────────────────────────────────────────────────

log_info "Installing client dependencies..."

if [ -f "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm use 22 2>/dev/null || nvm install 22
    cd "$CLIENT_DIR"
    npm install
else
    log_warn "nvm not found. Skipping client setup."
    log_warn "Install nvm and run: cd $CLIENT_DIR && npm install"
fi

# ──────────────────────────────────────────────────────────────────────
# Done
# ──────────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  To start all services:"
echo "    cd $SCRIPT_DIR"
echo "    ./start.sh"
echo ""
echo "  Services will be available at:"
echo "    - Client:        http://localhost:5173"
echo "    - API:           http://localhost:5001"
echo "    - Minio Console: http://localhost:9001"
echo ""
echo "════════════════════════════════════════════════════════════════"
