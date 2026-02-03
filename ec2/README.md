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
| **Docker services** | PostgreSQL 16, Redis 7, Minio |
| **Node.js** | Via nvm for client dev server |

## Services & Ports

| Service | Port | Description |
|---------|------|-------------|
| LightOnOCR (vLLM) | 8000 | OCR model API |
| Flask API | 5001 | Backend REST API |
| Client (Vite) | 5173 | React frontend |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | JWT token blacklist |
| Minio API | 9000 | Object storage |
| Minio Console | 9001 | Storage web UI |

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
- Window `ocr`: vLLM server with LightOnOCR-2-1B
- Window `flask`: Flask backend
- Window `client`: Vite dev server

### `stop.sh`
Stops all services and the tmux session.

### `status.sh`
Check the health of all services.

## Tmux Session

All services run in a tmux session named `caie`.

```bash
# Attach to session
tmux attach -t caie

# Switch windows
Ctrl+b 0  # OCR server
Ctrl+b 1  # Flask server
Ctrl+b 2  # Client

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
