import { useState } from 'react'
import { updateUpload, reparseUpload } from '../api'
import type { Upload } from '../types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const COMPANIES = ['schneider', 'legrand', 'siemens', 'abb']

interface Props {
  upload: Upload
  onUpdate: (updated: Upload) => void
  onReparse?: () => void
}

export function DocumentInfo({ upload, onUpdate, onReparse }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [company, setCompany] = useState(upload.company)
  const [year, setYear] = useState(upload.year)
  const [month, setMonth] = useState(upload.month)

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }

  const handleEdit = () => {
    setCompany(upload.company)
    setYear(upload.year)
    setMonth(upload.month)
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateUpload(upload.id, { company, year, month })
      onUpdate(updated)
      setEditing(false)
    } catch (e) {
      console.error('Failed to update:', e)
    } finally {
      setSaving(false)
    }
  }

  const handleReparse = async () => {
    if (!confirm('Reparse this document? This will clear all existing parsing and extraction data.')) {
      return
    }
    setReparsing(true)
    try {
      await reparseUpload(upload.id)
      onReparse?.()
    } catch (e) {
      console.error('Failed to reparse:', e)
    } finally {
      setReparsing(false)
    }
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{upload.filename}</h2>
            <p className="text-xs text-gray-500">ID: {upload.id}</p>
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleReparse}
              disabled={reparsing}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
              title="Reparse document"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={handleEdit}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Edit"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Company
                </label>
                <select
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {COMPANIES.map((c) => (
                    <option key={c} value={c}>
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Year
                </label>
                <input
                  type="number"
                  value={year || ''}
                  onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : null)}
                  min={2020}
                  max={2030}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Month
                </label>
                <select
                  value={month || ''}
                  onChange={(e) => setMonth(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="rounded px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Company</p>
              <p className="text-sm font-medium text-gray-700 capitalize">{upload.company}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Year</p>
              <p className="text-sm font-medium text-gray-700">{upload.year || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Month</p>
              <p className="text-sm font-medium text-gray-700">{upload.month ? MONTHS[upload.month - 1] : '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Uploaded</p>
              <p className="text-sm font-medium text-gray-700">{formatDate(upload.created_at)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
