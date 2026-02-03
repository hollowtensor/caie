from __future__ import annotations

from functools import wraps

from flask import g, jsonify, request
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from extensions import db
from models import User, WorkspaceMember


def auth_required(fn):
    """Decorator: requires valid JWT access token, sets g.current_user."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 401
        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


def workspace_required(fn):
    """Decorator: requires auth + valid X-Workspace-Id header, sets g.workspace."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        # First verify auth
        verify_jwt_in_request()
        user_id = get_jwt_identity()
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({"error": "User not found"}), 401
        g.current_user = user

        # Then verify workspace membership
        ws_id = request.headers.get("X-Workspace-Id")
        if not ws_id:
            return jsonify({"error": "X-Workspace-Id header required"}), 400

        membership = WorkspaceMember.query.filter_by(
            workspace_id=ws_id, user_id=user.id
        ).first()
        if not membership:
            return jsonify({"error": "Not a member of this workspace"}), 403

        g.workspace = membership.workspace
        g.workspace_role = membership.role
        return fn(*args, **kwargs)
    return wrapper


def get_current_user() -> User | None:
    """Get the current user from g, or None if not authenticated."""
    return getattr(g, "current_user", None)


def get_current_workspace():
    """Get the current workspace from g, or None if not set."""
    return getattr(g, "workspace", None)


def get_workspace_role() -> str | None:
    """Get the current user's role in the workspace, or None."""
    return getattr(g, "workspace_role", None)
