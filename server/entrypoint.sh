#!/bin/sh
set -e

cd /app/server

# Run database migrations
echo "Running database migrations..."
python -m flask db upgrade

# Start the server
echo "Starting server..."
exec python -m app --host 0.0.0.0 --port 5001
