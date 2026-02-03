from __future__ import annotations

from datetime import datetime, timezone

import redis
from flask import Blueprint, jsonify, request
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    get_jwt,
    get_jwt_identity,
    jwt_required,
)
from werkzeug.security import check_password_hash, generate_password_hash

from config import REDIS_URL
from extensions import db
from models import User, Workspace, WorkspaceMember

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

# Redis client for token blacklisting
_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(REDIS_URL)
    return _redis


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def _workspace_to_dict(ws: Workspace, role: str) -> dict:
    return {
        "id": ws.id,
        "name": ws.name,
        "role": role,
    }


@bp.route("/register", methods=["POST"])
def register():
    """Register a new user with email/password. Creates a personal workspace."""
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if not email or not password or not name:
        return jsonify({"error": "Email, password, and name are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    # Create user
    user = User(
        email=email,
        password_hash=generate_password_hash(password),
        name=name,
    )
    db.session.add(user)
    db.session.flush()  # Get user.id

    # Create personal workspace
    ws = Workspace(name=f"{name}'s Workspace", owner_id=user.id)
    db.session.add(ws)
    db.session.flush()

    # Add user as owner of workspace
    member = WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner")
    db.session.add(member)
    db.session.commit()

    # Generate tokens
    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "user": _user_to_dict(user),
        "workspace": _workspace_to_dict(ws, "owner"),
        "access_token": access_token,
        "refresh_token": refresh_token,
    }), 201


@bp.route("/login", methods=["POST"])
def login():
    """Login with email/password. Returns tokens and user's workspaces."""
    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid credentials"}), 401

    # Get user's workspaces
    workspaces = [
        _workspace_to_dict(m.workspace, m.role)
        for m in user.memberships
    ]

    # Generate tokens
    access_token = create_access_token(identity=user.id)
    refresh_token = create_refresh_token(identity=user.id)

    return jsonify({
        "user": _user_to_dict(user),
        "workspaces": workspaces,
        "access_token": access_token,
        "refresh_token": refresh_token,
    })


@bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """Get a new access token using a refresh token."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 401

    access_token = create_access_token(identity=user_id)
    return jsonify({"access_token": access_token})


@bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """Logout by blacklisting the current token in Redis."""
    jwt_data = get_jwt()
    jti = jwt_data["jti"]
    exp = jwt_data["exp"]

    # Calculate TTL (time until token expires)
    now = int(datetime.now(timezone.utc).timestamp())
    ttl = max(exp - now, 1)

    # Store JTI in Redis with TTL
    get_redis().setex(f"blocklist:{jti}", ttl, "1")

    return jsonify({"ok": True})


@bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Get current user info and their workspaces."""
    user_id = get_jwt_identity()
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 401

    workspaces = [
        _workspace_to_dict(m.workspace, m.role)
        for m in user.memberships
    ]

    return jsonify({
        "user": _user_to_dict(user),
        "workspaces": workspaces,
    })
