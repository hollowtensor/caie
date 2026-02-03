from __future__ import annotations

import uuid
from datetime import datetime, timezone

from extensions import db


def _uuid12() -> str:
    return uuid.uuid4().hex[:12]


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow)

    memberships = db.relationship(
        "WorkspaceMember", back_populates="user", cascade="all, delete-orphan"
    )


class Workspace(db.Model):
    __tablename__ = "workspaces"

    id = db.Column(db.String(36), primary_key=True, default=_uuid)
    name = db.Column(db.String(255), nullable=False)
    owner_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow)

    owner = db.relationship("User")
    members = db.relationship(
        "WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan"
    )


class WorkspaceMember(db.Model):
    __tablename__ = "workspace_members"

    workspace_id = db.Column(
        db.String(36), db.ForeignKey("workspaces.id"), primary_key=True
    )
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), primary_key=True)
    role = db.Column(db.String(20), nullable=False, default="member")
    joined_at = db.Column(db.DateTime, default=_utcnow)

    workspace = db.relationship("Workspace", back_populates="members")
    user = db.relationship("User", back_populates="memberships")


class Upload(db.Model):
    __tablename__ = "uploads"

    id = db.Column(db.String(12), primary_key=True, default=_uuid12)
    workspace_id = db.Column(
        db.String(36), db.ForeignKey("workspaces.id"), nullable=True
    )
    user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=True)
    filename = db.Column(db.String(255), nullable=False)
    company = db.Column(db.String(100), nullable=False, default="schneider")
    year = db.Column(db.Integer)
    month = db.Column(db.Integer)
    pdf_path = db.Column(db.String(500), default="")
    state = db.Column(db.String(20), nullable=False, default="queued")
    message = db.Column(db.Text, default="")
    total_pages = db.Column(db.Integer, default=0)
    current_page = db.Column(db.Integer, default=0)
    extract_state = db.Column(db.String(20))
    extract_csv = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=_utcnow)

    pages = db.relationship(
        "Page", back_populates="upload", cascade="all, delete-orphan"
    )


class Page(db.Model):
    __tablename__ = "pages"

    upload_id = db.Column(
        db.String(12), db.ForeignKey("uploads.id"), primary_key=True
    )
    page_num = db.Column(db.Integer, primary_key=True)
    markdown = db.Column(db.Text, default="")
    state = db.Column(db.String(20), nullable=False, default="pending")
    error = db.Column(db.Text)

    upload = db.relationship("Upload", back_populates="pages")


class Schema(db.Model):
    __tablename__ = "schemas"

    id = db.Column(db.String(12), primary_key=True, default=_uuid12)
    workspace_id = db.Column(
        db.String(36), db.ForeignKey("workspaces.id"), nullable=True
    )
    company = db.Column(db.String(100), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    fields = db.Column(db.JSON, nullable=False)
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_utcnow)
