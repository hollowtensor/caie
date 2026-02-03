# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CAIE (Context-Aware Information Extraction) is a full-stack app for extracting structured data from PDF pricelists using OCR and LLMs. Features workspace-based multi-tenancy with user authentication (JWT), PostgreSQL database, Minio object storage, and Redis for token management.

## Development Commands

### Docker services (Postgres, Redis, Minio, Server)

```bash
# Start all services
docker compose up -d

# Start only infrastructure (run Flask locally)
docker compose up -d postgres redis minio

# View logs
docker compose logs -f server

# Stop all
docker compose down
```

### Running Flask locally (against Docker services)

```bash
source .venv/bin/activate
flask db upgrade  # Run migrations
python -m server.app --server-url https://<pod-id>-8000.proxy.runpod.net/v1
```

### Client (runs locally, proxies to Flask)

```bash
cd client
npm install          # install dependencies
npm run dev          # dev server with HMR (port 5173)
npm run build        # tsc + vite build
npm run lint         # eslint
```

### Database migrations

```bash
flask db init        # first time only
flask db migrate -m "description"  # generate migration
flask db upgrade     # apply migrations
flask db downgrade   # rollback
```

## Architecture

**Frontend**: React 19 + TypeScript + Vite + Tailwind CSS 4. Uses TanStack Table, react-router-dom v7, react-markdown. Auth state managed via AuthContext.

**Backend**: Flask with Blueprints, Flask-SQLAlchemy, Flask-Migrate (Alembic), Flask-JWT-Extended. PostgreSQL database, Minio S3-compatible storage, Redis for JWT blacklisting.

**Authentication**: JWT access + refresh tokens. All routes (except auth endpoints) require `@auth_required` or `@workspace_required` decorator. SSE endpoint accepts token via query param.

**Multi-tenancy**: Workspace model. Users belong to workspaces via WorkspaceMember (owner/member roles). All data (uploads, schemas) scoped to workspace via `X-Workspace-Id` header.

### Key data flow

1. User registers/logs in → JWT tokens issued → personal workspace created
2. Upload PDF → stored in Minio (`caie-pdfs` bucket) → record created in PostgreSQL with workspace_id
3. Background thread renders pages to PNG (Minio `caie-pages`), OCRs concurrently via LightOnOCR
4. SSE streams progress to client (auth via query param token)
5. User creates extraction schema → rows extracted via anchor matching → CSV to Minio (`caie-output`)
6. Optional VLM/LLM validation for table correction

### Server structure

- `server/app.py` — Flask factory, JWT setup, migration init
- `server/extensions.py` — Flask-SQLAlchemy, Migrate, JWT instances
- `server/models.py` — SQLAlchemy models (User, Workspace, WorkspaceMember, Upload, Page, Schema)
- `server/config.py` — All env vars (DATABASE_URL, REDIS_URL, MINIO_*, JWT_*)
- `server/db.py` — SQLAlchemy-backed helper functions (compatibility layer)
- `server/auth.py` — `@auth_required`, `@workspace_required` decorators
- `server/storage.py` — Minio storage abstraction (upload/get/delete for PDFs, pages, CSVs)
- `server/routes/auth.py` — Register, login, refresh, logout, me endpoints
- `server/routes/workspaces.py` — Workspace CRUD, member management, invite
- `server/routes/uploads.py` — Upload CRUD, SSE status (workspace-scoped)
- `server/routes/pages.py` — Page serving from Minio, VLM/LLM validation
- `server/routes/extract.py` — Schema CRUD, extraction, CSV download
- `server/tasks/parse.py` — Background OCR job (app context for threads)

### Client structure

- `client/src/api.ts` — `authFetch()` wrapper, token management, all API calls
- `client/src/contexts/AuthContext.tsx` — Auth state, login/register/logout, workspace switching
- `client/src/pages/LoginPage.tsx`, `RegisterPage.tsx` — Auth forms
- `client/src/components/WorkspaceSelector.tsx` — Workspace dropdown in header
- `client/src/components/Layout.tsx` — Two-panel layout with auth UI
- `client/src/App.tsx` — Routes with `<ProtectedRoute>` wrapper
- `client/src/hooks/useSSE.ts` — EventSource with auth token query param

### Database tables

- **users** — id, email, password_hash, name
- **workspaces** — id, name, owner_id
- **workspace_members** — workspace_id, user_id, role (owner/member)
- **uploads** — id, workspace_id, user_id, filename, company, state, etc.
- **pages** — upload_id, page_num, markdown, state, error
- **schemas** — id, workspace_id, company, name, fields (JSON), is_default

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://caie:caie_dev@localhost:5432/caie` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis for JWT blacklisting |
| `MINIO_ENDPOINT` | `localhost:9000` | Minio S3 endpoint |
| `MINIO_ACCESS_KEY` | `minioadmin` | Minio access key |
| `MINIO_SECRET_KEY` | `minioadmin` | Minio secret key |
| `MINIO_SECURE` | `false` | Use HTTPS for Minio |
| `JWT_SECRET_KEY` | `change-me-in-production` | JWT signing key |
| `JWT_ACCESS_TOKEN_EXPIRES` | `900` (15 min) | Access token TTL in seconds |
| `JWT_REFRESH_TOKEN_EXPIRES` | `2592000` (30 days) | Refresh token TTL |
| `LIGHTONOCR_SERVER_URL` | `http://localhost:8000/v1` | OCR vLLM endpoint |

### Minio buckets

- `caie-pdfs` — Original PDF uploads
- `caie-pages` — Rendered page PNG images
- `caie-output` — Extracted CSV files

### Vite proxy

Dev server proxies `/api`, `/upload`, `/pages` to `http://localhost:5001` (configured in `client/vite.config.ts`).

### Docker services

- **postgres:16-alpine** — Port 5432, persistent volume `pgdata`
- **redis:7-alpine** — Port 6379
- **minio** — Ports 9000 (API), 9001 (console), volume `miniodata`
- **server** — Port 5001, builds from `server/Dockerfile`, connects to other services via Docker network hostnames
