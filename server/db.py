from __future__ import annotations

import json
import sqlite3
import uuid

from .config import DB_PATH


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS uploads (
                id           TEXT PRIMARY KEY,
                filename     TEXT NOT NULL,
                company      TEXT NOT NULL DEFAULT 'schneider',
                year         INTEGER,
                month        INTEGER,
                pdf_path     TEXT NOT NULL,
                state        TEXT NOT NULL DEFAULT 'queued',
                message      TEXT DEFAULT '',
                total_pages  INTEGER DEFAULT 0,
                current_page INTEGER DEFAULT 0,
                created_at   TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS pages (
                upload_id TEXT NOT NULL,
                page_num  INTEGER NOT NULL,
                markdown  TEXT DEFAULT '',
                state     TEXT NOT NULL DEFAULT 'pending',
                error     TEXT,
                PRIMARY KEY (upload_id, page_num)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS schemas (
                id         TEXT PRIMARY KEY,
                company    TEXT NOT NULL,
                name       TEXT NOT NULL,
                fields     TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)


def db_update(uid: str, **kw):
    with get_db() as conn:
        sets = ", ".join(f"{k}=?" for k in kw)
        conn.execute(f"UPDATE uploads SET {sets} WHERE id=?", [*kw.values(), uid])


def db_get(uid: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM uploads WHERE id=?", (uid,)).fetchone()
    conn.close()
    return dict(row) if row else None


def db_list() -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT id, filename, company, year, month, state, message,"
        " total_pages, current_page, created_at"
        " FROM uploads ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def db_get_page(uid: str, page_num: int) -> dict | None:
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM pages WHERE upload_id=? AND page_num=?", (uid, page_num)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def db_page_states(uid: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT page_num, state FROM pages WHERE upload_id=? ORDER BY page_num",
        (uid,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ---------- Schema helpers ----------

def _schema_row_to_dict(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["fields"] = json.loads(d["fields"])
    return d


def db_create_schema(company: str, name: str, fields: list[dict]) -> dict:
    sid = uuid.uuid4().hex[:12]
    with get_db() as conn:
        conn.execute(
            "INSERT INTO schemas (id, company, name, fields) VALUES (?,?,?,?)",
            (sid, company, name, json.dumps(fields)),
        )
    return db_get_schema(sid)  # type: ignore


def db_get_schema(sid: str) -> dict | None:
    conn = get_db()
    row = conn.execute("SELECT * FROM schemas WHERE id=?", (sid,)).fetchone()
    conn.close()
    return _schema_row_to_dict(row) if row else None


def db_list_schemas(company: str | None = None) -> list[dict]:
    conn = get_db()
    if company:
        rows = conn.execute(
            "SELECT * FROM schemas WHERE company=? ORDER BY created_at DESC",
            (company,),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM schemas ORDER BY created_at DESC"
        ).fetchall()
    conn.close()
    return [_schema_row_to_dict(r) for r in rows]


def db_update_schema(sid: str, **kw) -> dict | None:
    if "fields" in kw:
        kw["fields"] = json.dumps(kw["fields"])
    with get_db() as conn:
        sets = ", ".join(f"{k}=?" for k in kw)
        conn.execute(f"UPDATE schemas SET {sets} WHERE id=?", [*kw.values(), sid])
    return db_get_schema(sid)


def db_delete_schema(sid: str):
    with get_db() as conn:
        conn.execute("DELETE FROM schemas WHERE id=?", (sid,))
