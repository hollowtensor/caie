#!/usr/bin/env bash
set -euo pipefail

LOG_FILE="/workspace/server.log"
PID_FILE="/workspace/vllm.pid"

echo "Starting vLLM server in background..."

nohup vllm serve lightonai/LightOnOCR-2-1B \
  --host 0.0.0.0 --port 8000 \
  --limit-mm-per-prompt '{"image": 1}' \
  --mm-processor-cache-gb 0 \
  --no-enable-prefix-caching \
  --gpu-memory-utilization 0.35 > "$LOG_FILE" 2>&1 &

# Save the process ID
echo $! > "$PID_FILE"

echo "Server started in background."
echo "PID saved to: $PID_FILE"
echo "Logs: $LOG_FILE"
echo "Check health: http://localhost:8000/health"
