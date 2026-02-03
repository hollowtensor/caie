from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from auth import auth_required
from extensions import db
from models import User, Workspace, WorkspaceMember

bp = Blueprint("workspaces", __name__, url_prefix="/api/workspaces")


def _workspace_to_dict(ws: Workspace, role: str | None = None) -> dict:
    d = {
        "id": ws.id,
        "name": ws.name,
        "owner_id": ws.owner_id,
        "created_at": ws.created_at.isoformat() if ws.created_at else None,
    }
    if role:
        d["role"] = role
    return d


def _member_to_dict(m: WorkspaceMember) -> dict:
    return {
        "user_id": m.user_id,
        "email": m.user.email,
        "name": m.user.name,
        "role": m.role,
        "joined_at": m.joined_at.isoformat() if m.joined_at else None,
    }


@bp.route("", methods=["GET"])
@auth_required
def list_workspaces():
    """List all workspaces the current user belongs to."""
    user = g.current_user
    workspaces = [
        _workspace_to_dict(m.workspace, m.role)
        for m in user.memberships
    ]
    return jsonify(workspaces)


@bp.route("", methods=["POST"])
@auth_required
def create_workspace():
    """Create a new workspace. The current user becomes the owner."""
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"error": "Workspace name is required"}), 400

    user = g.current_user

    ws = Workspace(name=name, owner_id=user.id)
    db.session.add(ws)
    db.session.flush()

    member = WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner")
    db.session.add(member)
    db.session.commit()

    return jsonify(_workspace_to_dict(ws, "owner")), 201


@bp.route("/<wid>", methods=["GET"])
@auth_required
def get_workspace(wid: str):
    """Get workspace details including members. Must be a member."""
    user = g.current_user

    membership = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=user.id
    ).first()
    if not membership:
        return jsonify({"error": "Not a member of this workspace"}), 403

    ws = membership.workspace
    members = [_member_to_dict(m) for m in ws.members]

    return jsonify({
        **_workspace_to_dict(ws, membership.role),
        "members": members,
    })


@bp.route("/<wid>", methods=["PUT"])
@auth_required
def update_workspace(wid: str):
    """Update workspace name. Owner only."""
    user = g.current_user

    membership = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=user.id
    ).first()
    if not membership:
        return jsonify({"error": "Not a member of this workspace"}), 403

    if membership.role != "owner":
        return jsonify({"error": "Only the owner can update the workspace"}), 403

    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()

    if not name:
        return jsonify({"error": "Workspace name is required"}), 400

    ws = membership.workspace
    ws.name = name
    db.session.commit()

    return jsonify(_workspace_to_dict(ws, "owner"))


@bp.route("/<wid>", methods=["DELETE"])
@auth_required
def delete_workspace(wid: str):
    """Delete a workspace. Owner only. Cannot delete if it's the user's only workspace."""
    user = g.current_user

    membership = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=user.id
    ).first()
    if not membership:
        return jsonify({"error": "Not a member of this workspace"}), 403

    if membership.role != "owner":
        return jsonify({"error": "Only the owner can delete the workspace"}), 403

    # Check if this is the user's only workspace
    if len(user.memberships) <= 1:
        return jsonify({"error": "Cannot delete your only workspace"}), 400

    ws = membership.workspace
    db.session.delete(ws)
    db.session.commit()

    return jsonify({"ok": True})


@bp.route("/<wid>/invite", methods=["POST"])
@auth_required
def invite_member(wid: str):
    """Invite a user to the workspace by email. Owner only."""
    user = g.current_user

    membership = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=user.id
    ).first()
    if not membership:
        return jsonify({"error": "Not a member of this workspace"}), 403

    if membership.role != "owner":
        return jsonify({"error": "Only the owner can invite members"}), 403

    data = request.get_json(force=True)
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    invited_user = User.query.filter_by(email=email).first()
    if not invited_user:
        return jsonify({"error": "User not found with that email"}), 404

    # Check if already a member
    existing = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=invited_user.id
    ).first()
    if existing:
        return jsonify({"error": "User is already a member of this workspace"}), 409

    new_member = WorkspaceMember(
        workspace_id=wid, user_id=invited_user.id, role="member"
    )
    db.session.add(new_member)
    db.session.commit()

    return jsonify(_member_to_dict(new_member)), 201


@bp.route("/<wid>/members/<uid>", methods=["DELETE"])
@auth_required
def remove_member(wid: str, uid: str):
    """Remove a member from the workspace. Owner only (or user can remove themselves)."""
    user = g.current_user

    membership = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=user.id
    ).first()
    if not membership:
        return jsonify({"error": "Not a member of this workspace"}), 403

    # Allow owner to remove anyone, or user to remove themselves
    is_owner = membership.role == "owner"
    is_self = uid == user.id

    if not is_owner and not is_self:
        return jsonify({"error": "Only the owner can remove members"}), 403

    target = WorkspaceMember.query.filter_by(
        workspace_id=wid, user_id=uid
    ).first()
    if not target:
        return jsonify({"error": "Member not found"}), 404

    # Cannot remove the owner
    if target.role == "owner":
        return jsonify({"error": "Cannot remove the workspace owner"}), 400

    db.session.delete(target)
    db.session.commit()

    return jsonify({"ok": True})
