from __future__ import annotations

from extensions import db
from models import Upload, Page, Schema as SchemaModel


def init_db():
    """No-op — Flask-Migrate handles schema creation."""
    pass


# ---------- Upload helpers ----------

def _upload_to_dict(u: Upload) -> dict:
    return {
        "id": u.id,
        "workspace_id": u.workspace_id,
        "user_id": u.user_id,
        "filename": u.filename,
        "company": u.company,
        "year": u.year,
        "month": u.month,
        "pdf_path": u.pdf_path,
        "state": u.state,
        "message": u.message,
        "total_pages": u.total_pages,
        "current_page": u.current_page,
        "extract_state": u.extract_state,
        "extract_csv": u.extract_csv,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def db_get(uid: str) -> dict | None:
    u = db.session.get(Upload, uid)
    return _upload_to_dict(u) if u else None


def db_list(workspace_id: str | None = None) -> list[dict]:
    query = Upload.query.order_by(Upload.created_at.desc())
    if workspace_id:
        query = query.filter_by(workspace_id=workspace_id)
    return [_upload_to_dict(u) for u in query.all()]


def db_update(uid: str, **kw):
    u = db.session.get(Upload, uid)
    if u:
        for k, v in kw.items():
            setattr(u, k, v)
        db.session.commit()


def db_create_upload(
    uid: str,
    filename: str,
    company: str,
    year: int | None,
    month: int | None,
    pdf_path: str,
    state: str,
    message: str,
    total_pages: int,
    workspace_id: str | None = None,
    user_id: str | None = None,
) -> dict:
    u = Upload(
        id=uid,
        workspace_id=workspace_id,
        user_id=user_id,
        filename=filename,
        company=company,
        year=year,
        month=month,
        pdf_path=pdf_path,
        state=state,
        message=message,
        total_pages=total_pages,
    )
    db.session.add(u)
    db.session.commit()
    return _upload_to_dict(u)


def db_delete_upload(uid: str):
    u = db.session.get(Upload, uid)
    if u:
        db.session.delete(u)
        db.session.commit()


def db_list_uploads_by_company_state(
    company: str, state: str, extract_states: list[str | None]
) -> list[dict]:
    """List uploads filtered by company, state, and extract_state values."""
    query = Upload.query.filter_by(company=company, state=state)
    conditions = []
    if None in extract_states:
        conditions.append(Upload.extract_state.is_(None))
    non_null = [s for s in extract_states if s is not None]
    if non_null:
        conditions.append(Upload.extract_state.in_(non_null))
    if conditions:
        from sqlalchemy import or_
        query = query.filter(or_(*conditions))
    return [_upload_to_dict(u) for u in query.all()]


# ---------- Page helpers ----------

def _page_to_dict(p: Page) -> dict:
    return {
        "upload_id": p.upload_id,
        "page_num": p.page_num,
        "markdown": p.markdown,
        "state": p.state,
        "error": p.error,
    }


def db_get_page(uid: str, page_num: int) -> dict | None:
    p = db.session.get(Page, (uid, page_num))
    return _page_to_dict(p) if p else None


def db_page_states(uid: str) -> list[dict]:
    pages = (
        Page.query.filter_by(upload_id=uid)
        .order_by(Page.page_num)
        .all()
    )
    return [{"page_num": p.page_num, "state": p.state} for p in pages]


def db_create_pages(uid: str, page_nums: list[int]):
    """Bulk create page records (skips if already exists)."""
    for pn in page_nums:
        existing = db.session.get(Page, (uid, pn))
        if not existing:
            db.session.add(Page(upload_id=uid, page_num=pn, state="pending"))
    db.session.commit()


def db_get_parsed_pages(uid: str) -> list[dict]:
    """Get all done pages for an upload, ordered by page_num."""
    pages = (
        Page.query.filter_by(upload_id=uid, state="done")
        .order_by(Page.page_num)
        .all()
    )
    return [{"page_num": p.page_num, "markdown": p.markdown} for p in pages]


def db_update_page(uid: str, page_num: int, **kw):
    p = db.session.get(Page, (uid, page_num))
    if p:
        for k, v in kw.items():
            setattr(p, k, v)
        db.session.commit()


def db_update_page_done(uid: str, page_num: int, markdown: str):
    p = db.session.get(Page, (uid, page_num))
    if p:
        p.markdown = markdown
        p.state = "done"
        db.session.commit()


def db_update_page_error(uid: str, page_num: int, error: str):
    p = db.session.get(Page, (uid, page_num))
    if p:
        p.state = "error"
        p.error = error
        db.session.commit()


def db_get_pending_page_nums(uid: str) -> list[int]:
    """Get page numbers that are pending or errored."""
    pages = (
        Page.query.filter(
            Page.upload_id == uid,
            Page.state.in_(["pending", "error"]),
        )
        .all()
    )
    return [p.page_num for p in pages]


def db_reset_error_pages(uid: str):
    """Reset all error pages to pending state."""
    Page.query.filter_by(upload_id=uid, state="error").update(
        {"state": "pending", "error": None}
    )
    db.session.commit()


def db_reset_all_pages(uid: str):
    """Reset all pages to pending state and clear markdown."""
    Page.query.filter_by(upload_id=uid).update(
        {"state": "pending", "markdown": None, "error": None}
    )
    db.session.commit()


# ---------- Schema helpers ----------

def _schema_to_dict(s: SchemaModel) -> dict:
    return {
        "id": s.id,
        "workspace_id": s.workspace_id,
        "company": s.company,
        "name": s.name,
        "fields": s.fields,
        "is_default": s.is_default,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def db_create_schema(
    company: str,
    name: str,
    fields: list[dict],
    workspace_id: str | None = None,
) -> dict:
    s = SchemaModel(
        company=company,
        name=name,
        fields=fields,
        workspace_id=workspace_id,
    )
    db.session.add(s)
    db.session.commit()
    return _schema_to_dict(s)


def db_get_schema(sid: str) -> dict | None:
    s = db.session.get(SchemaModel, sid)
    return _schema_to_dict(s) if s else None


def db_list_schemas(
    company: str | None = None,
    workspace_id: str | None = None,
) -> list[dict]:
    query = SchemaModel.query.order_by(SchemaModel.created_at.desc())
    if company:
        query = query.filter_by(company=company)
    if workspace_id:
        query = query.filter_by(workspace_id=workspace_id)
    return [_schema_to_dict(s) for s in query.all()]


def db_update_schema(sid: str, **kw) -> dict | None:
    s = db.session.get(SchemaModel, sid)
    if not s:
        return None
    for k, v in kw.items():
        setattr(s, k, v)
    db.session.commit()
    return _schema_to_dict(s)


def db_delete_schema(sid: str):
    s = db.session.get(SchemaModel, sid)
    if s:
        db.session.delete(s)
        db.session.commit()


def db_set_default_schema(sid: str):
    """Set a schema as the default for its company, unsetting any previous default."""
    s = db.session.get(SchemaModel, sid)
    if not s:
        return
    SchemaModel.query.filter_by(company=s.company).update({"is_default": False})
    s.is_default = True
    db.session.commit()


def db_get_default_schema(company: str) -> dict | None:
    s = SchemaModel.query.filter_by(company=company, is_default=True).first()
    return _schema_to_dict(s) if s else None
