from __future__ import annotations

import sqlite3

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
