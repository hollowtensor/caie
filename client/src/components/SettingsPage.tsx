import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchSchemas,
  createSchema,
  deleteSchema,
  setDefaultSchema,
  fetchUploads,
  scanColumns,
} from '../api'
import type { Schema, Upload, ScanResult } from '../types'

function ConfigCard({
  schema,
  onSetDefault,
  onDelete,
}: {
  schema: Schema
  onSetDefault: (id: string) => void
  onDelete: (id: string) => void
}) {
  const f = schema.fields
  return (
    <div
      className={`rounded-lg border p-4 ${
        schema.is_default
          ? 'border-green-300 bg-green-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{schema.name}</span>
          {schema.is_default && (
            <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              DEFAULT
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {!schema.is_default && (
            <button
              onClick={() => onSetDefault(schema.id)}
              className="rounded bg-green-500 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-600"
            >
              Set Default
            </button>
          )}
          <button
            onClick={() => onDelete(schema.id)}
            className="rounded border border-red-200 px-2.5 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
        <div>
          Row anchor: <span className="font-medium text-gray-700">{f.row_anchor}</span>
        </div>
        <div>
          Value anchor: <span className="font-medium text-gray-700">{f.value_anchor}</span>
        </div>
        {f.extras.length > 0 && (
          <div className="col-span-2">
            Extras: <span className="font-medium text-gray-700">{f.extras.join(', ')}</span>
          </div>
        )}
        <div>Page: {f.include_page ? 'Yes' : 'No'}</div>
        <div>Heading: {f.include_heading ? 'Yes' : 'No'}</div>
      </div>
    </div>
  )
}

function NewConfigForm({
  company,
  latestUploadId,
  onCreated,
}: {
  company: string
  latestUploadId: string | null
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [rowAnchor, setRowAnchor] = useState('')
  const [valueAnchor, setValueAnchor] = useState('')
  const [extras, setExtras] = useState<string[]>([])
  const [includePage, setIncludePage] = useState(false)
  const [includeHeading, setIncludeHeading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)

  const handleScan = async () => {
    if (!latestUploadId || !rowAnchor.trim() || !valueAnchor.trim()) return
    setScanning(true)
    const res = await scanColumns(latestUploadId, {
      row_anchor: rowAnchor.trim(),
      value_anchor: valueAnchor.trim(),
    })
    setScanResult(res)
    setExtras([])
    setScanning(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !rowAnchor.trim() || !valueAnchor.trim()) return
    setSaving(true)
    await createSchema({
      company,
      name: name.trim(),
      fields: {
        row_anchor: rowAnchor.trim(),
        value_anchor: valueAnchor.trim(),
        extras,
        include_page: includePage,
        include_heading: includeHeading,
      },
    })
    setSaving(false)
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 space-y-4">
      <div className="text-xs font-semibold text-gray-500 uppercase">New Config</div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Config name"
        className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
      />

      <div className="grid grid-cols-2 gap-3">
        <input
          value={rowAnchor}
          onChange={(e) => { setRowAnchor(e.target.value); setScanResult(null) }}
          placeholder="Row anchor (e.g. Reference)"
          className="rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
        <input
          value={valueAnchor}
          onChange={(e) => { setValueAnchor(e.target.value); setScanResult(null) }}
          placeholder="Value anchor (e.g. Unit MRP)"
          className="rounded border border-gray-200 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Scan button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleScan}
          disabled={!rowAnchor.trim() || !valueAnchor.trim() || !latestUploadId || scanning}
          className="rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
        >
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
        {!latestUploadId && (
          <span className="text-[10px] text-amber-500">No parsed uploads to scan against</span>
        )}
        {scanResult && (
          <span className="text-[10px] text-gray-400">
            {scanResult.tables_found} tables across {scanResult.pages_found} pages
          </span>
        )}
      </div>

      {/* Scan results — row columns, value columns info + extra column checkboxes */}
      {scanResult && (
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          {/* Row columns */}
          {scanResult.row_columns && scanResult.row_columns.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Matched Row Columns
              </div>
              <div className="flex flex-wrap gap-1">
                {scanResult.row_columns.map((rc) => (
                  <span key={rc} className="rounded bg-green-50 px-2 py-0.5 text-[10px] text-green-600 font-medium">
                    {rc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Value columns */}
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Matched Value Columns
            </div>
            <div className="flex flex-wrap gap-1">
              {scanResult.value_columns.map((vc) => (
                <span key={vc} className="rounded bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600 font-medium">
                  {vc}
                </span>
              ))}
            </div>
          </div>

          {/* Extra columns */}
          {scanResult.extra_columns.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Extra Columns
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                {scanResult.extra_columns.map((ec) => (
                  <label key={ec} className="flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={extras.includes(ec)}
                      onChange={(e) => {
                        setExtras(
                          e.target.checked
                            ? [...extras, ec]
                            : extras.filter((x) => x !== ec),
                        )
                      }}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-500"
                    />
                    <span className="text-[11px] text-gray-700 truncate" title={ec}>
                      {ec}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Options */}
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={includePage}
            onChange={(e) => setIncludePage(e.target.checked)}
            className="rounded"
          />
          Include page number
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={includeHeading}
            onChange={(e) => setIncludeHeading(e.target.checked)}
            className="rounded"
          />
          Include heading
        </label>
      </div>

      <button
        type="submit"
        disabled={saving || !name.trim() || !rowAnchor.trim() || !valueAnchor.trim()}
        className="rounded bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
      >
        {saving ? 'Saving...' : 'Create Config'}
      </button>
    </form>
  )
}

export function SettingsPage() {
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [uploads, setUploads] = useState<Upload[]>([])
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)
  const [showForm, setShowForm] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [s, u] = await Promise.all([fetchSchemas(), fetchUploads()])
    setSchemas(s)
    setUploads(u)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Get unique companies from uploads
  const companies = [...new Set(uploads.map((u) => u.company))].sort()

  const handleSetDefault = async (id: string) => {
    await setDefaultSchema(id)
    reload()
  }

  const handleDelete = async (id: string) => {
    await deleteSchema(id)
    reload()
  }

  // Find the latest parsed upload for a company (for scanning)
  const latestUploadForCompany = (company: string): string | null => {
    const companyUploads = uploads
      .filter((u) => u.company === company && u.state === 'done')
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    return companyUploads[0]?.id ?? null
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100 text-gray-900">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2.5">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-base font-bold hover:text-blue-600">
            CAIE
          </Link>
          <span className="text-xs text-gray-400">Settings</span>
        </div>
        <Link
          to="/"
          className="rounded border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Back to Home
        </Link>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-1 text-lg font-bold text-gray-800">Company Extraction Configs</h2>
          <p className="mb-6 text-sm text-gray-500">
            Set a default extraction config per company. When parsing completes, the default config
            is used for automatic extraction.
          </p>

          {companies.length === 0 ? (
            <div className="rounded-lg bg-white p-8 text-center text-sm text-gray-400 shadow-sm">
              No uploads yet. Upload a PDF to get started.
            </div>
          ) : (
            <div className="space-y-4">
              {companies.map((company) => {
                const companySchemas = schemas.filter((s) => s.company === company)
                const isExpanded = expandedCompany === company
                const hasDefault = companySchemas.some((s) => s.is_default)
                const uploadCount = uploads.filter((u) => u.company === company).length

                return (
                  <div key={company} className="rounded-lg bg-white shadow-sm">
                    <button
                      onClick={() => {
                        setExpandedCompany(isExpanded ? null : company)
                        setShowForm(null)
                      }}
                      className="flex w-full items-center justify-between px-5 py-3.5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold capitalize text-gray-800">
                          {company}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          {uploadCount} upload{uploadCount !== 1 ? 's' : ''}
                        </span>
                        {hasDefault ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                            Auto-extract enabled
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                            No default config
                          </span>
                        )}
                      </div>
                      <svg
                        className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 px-5 pb-4 pt-3">
                        {companySchemas.length === 0 ? (
                          <p className="mb-3 text-xs text-gray-400">
                            No configs yet for this company.
                          </p>
                        ) : (
                          <div className="mb-3 space-y-2">
                            {companySchemas.map((s) => (
                              <ConfigCard
                                key={s.id}
                                schema={s}
                                onSetDefault={handleSetDefault}
                                onDelete={handleDelete}
                              />
                            ))}
                          </div>
                        )}

                        {showForm === company ? (
                          <NewConfigForm
                            company={company}
                            latestUploadId={latestUploadForCompany(company)}
                            onCreated={() => {
                              setShowForm(null)
                              reload()
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => setShowForm(company)}
                            className="rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-500"
                          >
                            + Add Config
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
