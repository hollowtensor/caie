# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CAIE (Context-Aware Information Extraction) is a full-stack app for extracting structured data from PDF pricelists using OCR and LLMs. Features workspace-based multi-tenancy with JWT auth, PostgreSQL, Minio object storage, and Redis for token blacklisting.

## Development Commands

### Local dev (ports shifted to avoid conflicts with other projects)

```bash
# Start infra with dev port overrides (Postgres:5434, Redis:6381, Minio:9004/9005)
cd server
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis minio

# Run Flask (from server/ directory, needs PYTHONPATH)
source ../.venv/bin/activate
PYTHONPATH=. FLASK_APP=app flask db upgrade
python -m app --port 5001

# Client (use --port if 5173 is taken)
cd client
npm install
npm run dev          # or: npx vite --port 5174
npm run build        # tsc + vite build (use `npx vite build` to skip tsc)
npm run lint         # eslint
```

### Production (EC2 at caie.hashteelabs.com)

```bash
# SSH alias: ssh caie-cpu
# Infra runs via standard docker-compose.yml (default ports)
cd ~/caie/server && docker compose up -d postgres redis minio

# Flask runs in tmux session
tmux new-session -d -s caie 'source ~/caie/.venv/bin/activate && cd ~/caie/server && python -m app --host 0.0.0.0 --port 5001'
tmux attach -t caie   # view logs

# Rebuild client after changes
cd ~/caie/client && npx vite build

# Nginx serves client dist + proxies /api /upload /pages to Flask
# HTTPS via Let's Encrypt (auto-renew via certbot timer)
```

### Deploying changes

```bash
# Push from local (requires hollowtensor GitHub account)
gh auth switch --user hollowtensor
git push origin main

# On EC2
ssh caie-cpu
cd ~/caie && git pull origin main
# Rebuild client if frontend changed:
cd client && npx vite build
# Restart Flask if backend changed:
tmux kill-session -t caie
tmux new-session -d -s caie 'source ~/caie/.venv/bin/activate && cd ~/caie/server && python -m app --host 0.0.0.0 --port 5001'
```

### Database migrations

```bash
PYTHONPATH=. FLASK_APP=app flask db migrate -m "description"  # generate
PYTHONPATH=. FLASK_APP=app flask db upgrade                   # apply
PYTHONPATH=. FLASK_APP=app flask db downgrade                 # rollback
```

Migrations live in `server/migrations/`. Models must be imported in `app.py` for Alembic to detect them (the `import models` in `create_app` handles this).

## Architecture

**Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4. TanStack Table for data grids. react-router-dom v7 for routing. Auth state in `AuthContext`.

**Backend**: Flask with Blueprints (`server/routes/`), Flask-SQLAlchemy, Flask-Migrate, Flask-JWT-Extended. Six blueprints: auth, workspaces, uploads, pages, extract, compare.

**Storage**: Minio (S3-compatible) with three buckets: `caie-pdfs` (originals), `caie-pages` (rendered PNGs + JPEG thumbnails), `caie-output` (extracted CSVs). Abstracted in `server/storage.py`.

**Auth flow**: JWT access + refresh tokens. Redis-backed token blocklist for logout. Two decorators in `server/auth.py`: `@auth_required` (sets `g.current_user`) and `@workspace_required` (also validates `X-Workspace-Id` header, sets `g.workspace`). SSE endpoint takes token via query param since EventSource can't set headers.

**Multi-tenancy**: All data scoped to workspace. Client sends `X-Workspace-Id` header on every API call (see `authFetch()` in `client/src/api.ts`). Users belong to workspaces via `WorkspaceMember` with owner/member roles.

### Key data flow

1. User registers → JWT issued → personal workspace auto-created
2. Upload PDF → stored in Minio → PostgreSQL record created with workspace_id
3. Background thread (`server/tasks/parse.py`) renders pages **one at a time** to PNG + thumbnail, uploads each to Minio immediately (memory-safe for low-RAM instances)
4. Parse workers load images on demand from Minio (not pre-loaded) and OCR concurrently via LightOnOCR vLLM endpoint
5. SSE streams progress to client (auto-reconnects on disconnect)
6. On startup, `_auto_extract_pending()` in `app.py` runs extraction for any uploads in "done" state without extractions
7. User creates extraction schema → rows extracted via anchor matching → CSV stored in Minio
8. Optional VLM/LLM validation for table correction (configurable model endpoints)

### Important patterns

- **Memory-safe rendering**: `render_and_save_pdf()` renders one page at a time to avoid OOM on low-memory instances. Parse workers also load images on demand from Minio.
- **Thumbnails**: `storage.upload_page_image()` generates a 150px-wide JPEG thumbnail alongside each full PNG. PageGrid loads thumbnails; full images load on page select. Thumbnail endpoint falls back to full image if thumbnail doesn't exist.
- **Error sanitization**: Internal URLs (RunPod, localhost, etc.) are stripped from all client-facing errors. `_sanitize_error()` in `parse.py` at write time, `_scrub()` in `db.py` at read time. **Never expose OCR/VLM/LLM endpoint URLs to the frontend.**
- **SSE reconnection**: `useSSE.ts` auto-reconnects after 2s on disconnect. `ProgressCard.tsx` treats `rendering`/`parsing` states as active (not "Interrupted") even if SSE is temporarily disconnected.
- **Background OCR tasks** run in threads with their own Flask app context (see `parse.py`). They need `app.app_context()` to access the DB.
- **`server/db.py`** is a compatibility layer wrapping SQLAlchemy queries in function-based helpers. New code should use SQLAlchemy models directly.
- **Vite proxy** is configured in `client/vite.config.ts` — also includes `allowedHosts` for the `caie.hashteelabs.com` domain.

### Environment variables

All defined in `server/config.py` with defaults. Key ones beyond the basics:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://caie:caie_dev@localhost:5432/caie` | PostgreSQL |
| `REDIS_URL` | `redis://localhost:6379/0` | JWT blocklist |
| `MINIO_ENDPOINT` | `localhost:9000` | Object storage |
| `LIGHTONOCR_SERVER_URL` | `http://localhost:8000/v1` | OCR vLLM endpoint |
| `VLM_SERVER_URL` | `http://localhost:1234/v1` | Vision model for table validation |
| `VLM_MODEL` | `zai-org/glm-4.6v-flash` | VLM model name |
| `LLM_SERVER_URL` | `http://localhost:1234/v1` | Text LLM for table correction |
| `LLM_MODEL` | `gpt-oss-20b` | LLM model name |

Minio credentials default to `minioadmin`/`minioadmin`. JWT secret defaults to `change-me-in-production`.

### Infrastructure

- **Production**: EC2 `t3.medium` (4GB RAM) at `caie.hashteelabs.com`. GPU workloads (OCR, VLM, LLM) run on RunPod, accessed via proxy URLs.
- **SSH**: `ssh caie-cpu` (configured in SSH config)
- **Nginx**: reverse proxy + serves client dist, HTTPS via Let's Encrypt. Reference config at `ec2/nginx.conf` — keep the deployed `/etc/nginx/sites-enabled/caie` in sync with it.
- **SSE requires unbuffered nginx**: the `/api/uploads/<id>/status` location MUST set `proxy_buffering off`, `chunked_transfer_encoding off`, and HTTP/1.1 with empty `Connection`. Without this, nginx holds events in its buffer and the frontend appears frozen until the parse finishes (manifests as "have to refresh to see updates"). A dedicated `location ~ ^/api/uploads/[^/]+/status$` block must come *before* the generic `/api/` block.
- **Docker compose dev override**: `docker-compose.dev.yml` remaps ports (Postgres→5434, Redis→6381, Minio→9004/9005) to avoid conflicts with other local projects
- **Git remote**: `github.com/hollowtensor/caie` — push requires `gh auth switch --user hollowtensor`
