FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for pypdfium2 and Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy server code (includes migrations/)
COPY . server/

# Copy .env if it exists (will be overridden by docker-compose env vars)
COPY .env* ./

# Make entrypoint executable
RUN chmod +x server/entrypoint.sh

EXPOSE 5001

# Run migrations then start server
ENTRYPOINT ["/bin/sh", "server/entrypoint.sh"]
