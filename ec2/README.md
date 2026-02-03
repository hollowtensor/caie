# EC2 Deployment Guide

Deploy CAIE (Context-Aware Information Extraction) on AWS EC2 with GPU support.

## Prerequisites

- AWS EC2 instance with GPU (tested on g5.xlarge with NVIDIA A10G)
- Ubuntu 22.04 (Deep Learning AMI recommended)
- Miniconda3 installed
- Docker installed
- At least 30GB free disk space

## Quick Start

```bash
# 1. SSH into your EC2 instance
ssh -i ~/.ssh/your-key.pem ubuntu@<EC2_IP>

# 2. Clone the repository
git clone https://github.com/hollowtensor/caie.git ~/caie
cd ~/caie/ec2

# 3. Run the setup script
chmod +x setup.sh
./setup.sh

# 4. Start all services
./start.sh
```

## What Gets Installed

| Component | Description |
|-----------|-------------|
| **lightonocr** conda env | Python 3.11 + vLLM 0.15.0 + transformers 5.0.0 |
| **caie** conda env | Python 3.11 + Flask + SQLAlchemy |
| **llama.cpp** | For running Qwen3-8B-GGUF |
| **Docker services** | PostgreSQL 16, Redis 7, Minio |
| **Node.js** | Via nvm for client dev server |

## Services & Ports

| Service | Port | Description | GPU Memory |
|---------|------|-------------|------------|
| LightOnOCR (vLLM) | 8000 | OCR model API | ~9 GB |
| Qwen3-8B (llama-server) | 8001 | LLM for table correction | ~6 GB |
| Flask API | 5001 | Backend REST API | - |
| Client (Vite) | 5173 | React frontend | - |
| PostgreSQL | 5432 | Database | - |
| Redis | 6379 | JWT token blacklist | - |
| Minio API | 9000 | Object storage | - |
| Minio Console | 9001 | Storage web UI | - |

## Scripts

### `setup.sh`
One-time setup script that:
- Creates conda environments (lightonocr, caie)
- Installs Python dependencies
- Downloads LightOnOCR model
- Starts Docker services
- Runs database migrations
- Installs client dependencies

### `start.sh`
Starts all services in a tmux session:
- Window `ocr`: vLLM server with LightOnOCR-2-1B (port 8000)
- Window `llm`: llama-server with Qwen3-8B-GGUF (port 8001)
- Window `flask`: Flask backend (port 5001)
- Window `client`: Vite dev server (port 5173)

### `stop.sh`
Stops all services and the tmux session.

### `status.sh`
Check the health of all services.

### `start-llm.sh`
Start just the LLM server (Qwen3-8B):
```bash
./start-llm.sh              # Foreground
./start-llm.sh --background # In tmux
```

### `stop-llm.sh`
Stop the LLM server.

## Tmux Session

All services run in a tmux session named `caie`.

```bash
# Attach to session
tmux attach -t caie

# Switch windows
Ctrl+b 0  # OCR server (port 8000)
Ctrl+b 1  # LLM server (port 8001)
Ctrl+b 2  # Flask server (port 5001)
Ctrl+b 3  # Client (port 5173)

# Detach
Ctrl+b d
```

## Environment Variables

The setup creates `~/caie/server/.env` with these defaults:

```bash
DATABASE_URL=postgresql://caie:caie_dev@localhost:5432/caie
REDIS_URL=redis://localhost:6379/0
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
LIGHTONOCR_SERVER_URL=http://localhost:8000/v1
VLM_SERVER_URL=http://localhost:8001/v1
VLM_MODEL=qwen3
LLM_SERVER_URL=http://localhost:8001/v1
LLM_MODEL=qwen3
```

## Qwen3 Reasoning Mode

Qwen3-8B is a reasoning model that outputs thinking tokens. To disable reasoning, add `/no_think` to the system prompt:

```json
{
  "messages": [
    {"role": "system", "content": "You are a helpful assistant. /no_think"},
    {"role": "user", "content": "Hello"}
  ]
}
```

## Troubleshooting

### vLLM fails to start
Check GPU availability:
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

### Database connection errors
Ensure Docker services are running:
```bash
docker ps
docker compose -f ~/caie/server/docker-compose.yml logs postgres
```

### Out of disk space
The Deep Learning AMI can fill up. Check usage:
```bash
df -h /
# Clean up unused Docker images
docker system prune -a
```

### Model download fails
Manually download the model:
```bash
source ~/miniconda3/bin/activate lightonocr
python -c "from huggingface_hub import snapshot_download; snapshot_download('lightonai/LightOnOCR-2-1B')"
```

## Security Notes

For production:
1. Change `JWT_SECRET_KEY` in `.env`
2. Change Minio credentials
3. Use proper PostgreSQL credentials
4. Configure security groups for required ports only
5. Use HTTPS with a reverse proxy (nginx)
