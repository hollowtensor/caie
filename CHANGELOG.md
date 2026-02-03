# Changelog

## v2.0.0-rc.1 — Release Candidate 1 (Major)

### Breaking Changes

- **Database**: Migrated from SQLite to PostgreSQL — requires database migration
- **Storage**: Migrated from local filesystem to Minio S3-compatible object storage
- **Authentication**: All API endpoints now require JWT authentication (except /auth/*)
- **Multi-tenancy**: All data is now scoped to workspaces via `X-Workspace-Id` header

### Features

#### User Authentication
- JWT-based authentication with access and refresh tokens
- User registration with email, password, and name
- Login/logout with token blacklisting via Redis
- Automatic token refresh on expiry
- Protected routes with `@auth_required` and `@workspace_required` decorators

#### Multi-Workspace Support
- Users can create and manage multiple workspaces
- Workspace member management with owner/member roles
- Workspace invitation system
- Workspace selector in header for quick switching
- All uploads, schemas, and extractions scoped to workspace
- Workspace settings page for member management

#### Production Infrastructure
- **PostgreSQL 16**: Production-grade relational database
- **Redis 7**: Token blacklisting and session management
- **Minio**: S3-compatible object storage for PDFs, pages, and outputs
- **Docker Compose**: Full stack deployment with health checks
- **Flask-Migrate**: Alembic-based database migrations

#### Image Upload Support
- Upload PNG and JPG images alongside PDFs
- Automatic format detection and processing

### Architecture

- **Flask-SQLAlchemy**: ORM with relationship models
- **Flask-JWT-Extended**: JWT token management
- **Minio Python SDK**: Object storage abstraction
- **AuthContext**: React context for auth state management
- **authFetch**: Wrapper for authenticated API requests with auto-refresh

### New Files

- `server/models.py` — SQLAlchemy models (User, Workspace, WorkspaceMember, Upload, Page, Schema)
- `server/auth.py` — Auth decorators (@auth_required, @workspace_required)
- `server/storage.py` — Minio storage abstraction
- `server/extensions.py` — Flask extension instances
- `server/routes/auth.py` — Authentication endpoints
- `server/routes/workspaces.py` — Workspace management endpoints
- `client/src/contexts/AuthContext.tsx` — React auth context
- `client/src/pages/LoginPage.tsx` — Login form
- `client/src/pages/RegisterPage.tsx` — Registration form
- `client/src/pages/WorkspaceSettingsPage.tsx` — Workspace management UI
- `client/src/components/WorkspaceSelector.tsx` — Workspace switcher

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://caie:caie_dev@localhost:5432/caie` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis for JWT blacklisting |
| `MINIO_ENDPOINT` | `localhost:9000` | Minio S3 endpoint |
| `MINIO_ACCESS_KEY` | `minioadmin` | Minio access key |
| `MINIO_SECRET_KEY` | `minioadmin` | Minio secret key |
| `MINIO_SECURE` | `false` | Use HTTPS for Minio |
| `JWT_SECRET_KEY` | `change-me-in-production` | JWT signing key |
| `JWT_ACCESS_TOKEN_EXPIRES` | `900` (15 min) | Access token TTL |
| `JWT_REFRESH_TOKEN_EXPIRES` | `2592000` (30 days) | Refresh token TTL |

### Upgrade Guide

1. Start infrastructure: `docker compose up -d postgres redis minio`
2. Run migrations: `flask db upgrade`
3. Register a new user (previous SQLite data is not migrated)

---

## v1.0.0-rc.1 — Release Candidate 1

### Features

#### PDF Parsing & OCR
- Upload PDF pricelists, split into pages, OCR each page via LightOn API
- Resume interrupted parsing from where it left off
- Split view: page image alongside parsed markdown

#### Schema-Based Extraction
- Define extraction schemas with row anchor, value anchor, and extra columns
- Melt/unpivot for variable child columns (e.g. voltage variants)
- Save schemas per company with set-default support
- Auto-extraction on upload completion using default schema

#### Data Table & Results
- Full-featured data table with sorting, filtering, pagination
- "View Results" from progress card with auto-run extraction
- Download extracted data as CSV

#### Anomaly Detection
- Statistical per-column profiling (length, digit ratio, frequency)
- Flag cells with unusual values (non-numeric in numeric columns, outlier lengths, rare patterns)
- Case-insensitive frequency counting to reduce false positives
- Flagged-only filter toggle in data table

#### Row Inspection & Page Preview
- Click any row to open side panel with source PDF page
- Tabs: Parsed (markdown) and Image views
- Zoom controls on image view
- Source table highlighted in parsed markdown view with "Source Table" label
- Table region estimation for overlay positioning

#### VLM Table Validation (Vision Language Model)
- Send page image to VLM for fresh table re-OCR
- Heading-based table identification (no original HTML sent as reference)
- Pricelist-aware prompt: colspan/rowspan, product references, price values
- Side-by-side review: original OCR vs VLM re-OCR
- Accept to replace table in markdown and re-run extraction, or reject
- "No OCR errors detected" feedback when tables match
- Configurable VLM server URL and model (LM Studio / RunPod compatible)

#### LLM Table Correction (Text-Based)
- Programmatic structural analysis: row-by-row column counts with rowspan tracking
- Feeds exact diagnosis to LLM (mismatched columns, wrong rowspans)
- Full page markdown context for informed corrections
- Separate VLM (blue) and LLM (violet) buttons in preview panel
- Configurable LLM server URL and model

#### UI/UX
- Glassmorphic sticky validation toolbar in preview panel
- Preview panel expands to 60% when row selected
- Auto-disable flagged filter when all corrections accepted
- Company-specific settings page for extraction configs

### Architecture
- **Server**: Flask + SQLite, Blueprint-based routes
- **Client**: React + Vite + TypeScript + Tailwind CSS
- **OCR**: LightOn API (configurable endpoint)
- **VLM**: OpenAI-compatible API (LM Studio / RunPod)
- **LLM**: OpenAI-compatible API (LM Studio / RunPod)
- **Table parsing**: HTML table extraction with regex-based splitting
- **Data table**: @tanstack/react-table with sorting, filtering, pagination

### Configuration
| Variable | Default | Description |
|----------|---------|-------------|
| `LIGHTONOCR_SERVER_URL` | `http://localhost:8000/v1` | OCR API endpoint |
| `VLM_SERVER_URL` | `http://localhost:1234/v1` | VLM server (LM Studio) |
| `VLM_MODEL` | `qwen/qwen3-vl-8b` | Vision language model |
| `LLM_SERVER_URL` | `http://localhost:1234/v1` | LLM server (LM Studio) |
| `LLM_MODEL` | `gpt-oss-20b` | Text language model |
