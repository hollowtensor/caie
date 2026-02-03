import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchWorkspace,
  updateWorkspace,
  deleteWorkspace,
  inviteToWorkspace,
  removeFromWorkspace,
} from '../api'
import type { WorkspaceDetails, WorkspaceMember } from '../types'

export function WorkspaceSettingsPage() {
  const navigate = useNavigate()
  const { currentWorkspace, refreshWorkspaces, setCurrentWorkspace, workspaces } = useAuth()

  const [workspace, setWorkspace] = useState<WorkspaceDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form states
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const isOwner = workspace?.role === 'owner'

  useEffect(() => {
    if (!currentWorkspace) return

    setLoading(true)
    fetchWorkspace(currentWorkspace.id)
      .then((ws) => {
        setWorkspace(ws)
        setName(ws.name)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [currentWorkspace])

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace || !name.trim()) return

    setSaving(true)
    setError('')
    try {
      await updateWorkspace(workspace.id, name.trim())
      await refreshWorkspaces()
      setWorkspace((ws) => (ws ? { ...ws, name: name.trim() } : ws))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename')
    } finally {
      setSaving(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!workspace || !inviteEmail.trim()) return

    setInviting(true)
    setInviteError('')
    try {
      await inviteToWorkspace(workspace.id, inviteEmail.trim())
      setInviteEmail('')
      // Refresh workspace to get updated members
      const ws = await fetchWorkspace(workspace.id)
      setWorkspace(ws)
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Failed to invite')
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!workspace) return
    if (!confirm(`Remove ${member.email} from this workspace?`)) return

    try {
      await removeFromWorkspace(workspace.id, member.user_id)
      const ws = await fetchWorkspace(workspace.id)
      setWorkspace(ws)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member')
    }
  }

  const handleDelete = async () => {
    if (!workspace) return

    setDeleting(true)
    try {
      await deleteWorkspace(workspace.id)
      await refreshWorkspaces()
      // Switch to another workspace
      const remaining = workspaces.filter((w) => w.id !== workspace.id)
      if (remaining.length > 0) {
        setCurrentWorkspace(remaining[0])
      }
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete')
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-red-500">Workspace not found</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Workspace Settings</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* General Settings */}
        <section className="mb-8 rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">General</h2>
          </div>
          <div className="px-6 py-4">
            <form onSubmit={handleRename}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Workspace Name
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                />
                {isOwner && (
                  <button
                    type="submit"
                    disabled={saving || name.trim() === workspace.name}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
              {!isOwner && (
                <p className="mt-2 text-xs text-gray-500">Only the owner can rename the workspace.</p>
              )}
            </form>
          </div>
        </section>

        {/* Members */}
        <section className="mb-8 rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Members</h2>
            <p className="mt-0.5 text-sm text-gray-500">{workspace.members.length} member(s)</p>
          </div>

          {/* Invite form - owner only */}
          {isOwner && (
            <div className="border-b border-gray-200 px-6 py-4">
              <form onSubmit={handleInvite} className="flex gap-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Enter email to invite"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={inviting || !inviteEmail.trim()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
                >
                  {inviting ? 'Inviting...' : 'Invite'}
                </button>
              </form>
              {inviteError && (
                <p className="mt-2 text-sm text-red-500">{inviteError}</p>
              )}
            </div>
          )}

          {/* Member list */}
          <ul className="divide-y divide-gray-200">
            {workspace.members.map((member) => (
              <li key={member.user_id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600">
                    {member.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{member.name || member.email}</p>
                    <p className="text-xs text-gray-500">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      member.role === 'owner'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {member.role}
                  </span>
                  {isOwner && member.role !== 'owner' && (
                    <button
                      onClick={() => handleRemoveMember(member)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500"
                      title="Remove member"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Danger Zone - owner only */}
        {isOwner && (
          <section className="rounded-lg border border-red-200 bg-white">
            <div className="border-b border-red-200 px-6 py-4">
              <h2 className="text-base font-semibold text-red-600">Danger Zone</h2>
            </div>
            <div className="px-6 py-4">
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Delete Workspace</p>
                    <p className="text-xs text-gray-500">
                      Permanently delete this workspace and all its data.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              ) : (
                <div className="rounded-lg bg-red-50 p-4">
                  <p className="mb-3 text-sm text-red-700">
                    Are you sure? This action cannot be undone. All uploads and data will be permanently deleted.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:bg-red-400"
                    >
                      {deleting ? 'Deleting...' : 'Yes, Delete Workspace'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
