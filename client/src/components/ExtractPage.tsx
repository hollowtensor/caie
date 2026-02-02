import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  fetchUpload,
  fetchSchemas,
  createSchema,
  updateSchema,
  deleteSchema,
  resolveColumns,
  extractData,
  extractCsvUrl,
} from '../api'
import type { Upload, Schema, SchemaField, FieldMapping, ExtractResult } from '../types'

const STEPS = ['Schema', 'Mapping', 'Export'] as const

// ─── Stepper ────────────────────────────────────────────────────────

function Stepper({ current, labels }: { current: number; labels: readonly string[] }) {
  return (
    <div className="flex items-center gap-0">
      {labels.map((label, i) => {
        const idx = i + 1
        const done = current > idx
        const active = current === idx
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <div className={`mx-2 h-px w-8 ${done ? 'bg-blue-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex items-center gap-1.5">
              <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                active ? 'bg-blue-500 text-white shadow-sm shadow-blue-200'
                  : done ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-400'
              }`}>
                {done ? '\u2713' : idx}
              </div>
              <span className={`text-[11px] font-medium ${active ? 'text-gray-800' : done ? 'text-blue-500' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Schema Editor (inline modal-style card) ────────────────────────

function SchemaEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: { id?: string; name: string; fields: SchemaField[] }
  onSave: (data: { id?: string; name: string; fields: SchemaField[] }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [fields, setFields] = useState<SchemaField[]>([...initial.fields])

  const update = (i: number, patch: Partial<SchemaField>) =>
    setFields(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))

  const remove = (i: number) => setFields(fields.filter((_, idx) => idx !== i))

  const add = () => setFields([...fields, { key: '', label: '', source: 'column', match_parent: '', match_child: '' }])

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <h3 className="text-sm font-semibold text-gray-800">
          {initial.id ? 'Edit Schema' : 'New Schema'}
        </h3>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
      </div>

      <div className="space-y-4 p-5">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Schema Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-300 transition-colors focus:border-blue-400 focus:bg-white focus:outline-none"
            placeholder="e.g. Schneider Contactors"
          />
        </div>

        {/* Fields */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Fields ({fields.length})
            </label>
            <button onClick={add}
              className="rounded-md bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-200">
              + Add
            </button>
          </div>

          <div className="space-y-1.5">
            {/* Header */}
            <div className="grid grid-cols-[80px_1fr_90px_32px] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <span>Key</span>
              <span>Label</span>
              <span>Source</span>
              <span />
            </div>

            {fields.map((f, i) => (
              <div key={i} className="group rounded-lg border border-gray-100 bg-gray-50 p-2 transition-colors hover:border-gray-200">
                <div className="grid grid-cols-[80px_1fr_90px_32px] items-center gap-2">
                  <input value={f.key} onChange={(e) => update(i, { key: e.target.value })}
                    className="rounded border border-transparent bg-transparent px-1.5 py-1 text-[11px] font-mono text-gray-600 transition-colors focus:border-gray-200 focus:bg-white focus:outline-none"
                    placeholder="key" />
                  <input value={f.label} onChange={(e) => update(i, { label: e.target.value })}
                    className="rounded border border-transparent bg-transparent px-1.5 py-1 text-[11px] text-gray-700 transition-colors focus:border-gray-200 focus:bg-white focus:outline-none"
                    placeholder="Display label" />
                  <select value={f.source} onChange={(e) => update(i, { source: e.target.value as SchemaField['source'] })}
                    className="rounded border border-transparent bg-transparent px-1 py-1 text-[11px] text-gray-600 transition-colors focus:border-gray-200 focus:bg-white focus:outline-none">
                    <option value="column">Column</option>
                    <option value="heading">Heading</option>
                    <option value="page">Page #</option>
                  </select>
                  <button onClick={() => remove(i)}
                    className="flex h-6 w-6 items-center justify-center rounded text-gray-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100">
                    &times;
                  </button>
                </div>
                {f.source === 'column' && (
                  <div className="mt-1.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={f.match_parent}
                        onChange={(e) => update(i, { match_parent: e.target.value })}
                        className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-[10px] text-gray-500 transition-colors placeholder-gray-300 focus:border-gray-200 focus:bg-white focus:outline-none"
                        placeholder="Match parent (e.g. Unit MRP)"
                      />
                      {!f.melt && (
                        <input
                          value={f.match_child}
                          onChange={(e) => update(i, { match_child: e.target.value })}
                          className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-1 text-[10px] text-gray-500 transition-colors placeholder-gray-300 focus:border-gray-200 focus:bg-white focus:outline-none"
                          placeholder="Pin child (e.g. AC-1) — optional"
                        />
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 pl-1.5">
                      <input
                        type="checkbox"
                        checked={!!f.melt}
                        onChange={(e) => update(i, { melt: e.target.checked, match_child: '' })}
                        className="h-3 w-3 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
                      />
                      <span className="text-[10px] text-gray-400">
                        Unpivot children into rows (melt)
                      </span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
        <button onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50">
          Cancel
        </button>
        <button onClick={() => onSave({ id: initial.id, name, fields })}
          disabled={!name.trim() || fields.length === 0}
          className="rounded-lg bg-blue-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400">
          Save
        </button>
      </div>
    </div>
  )
}

// ─── Step 1: Schema Selection ───────────────────────────────────────

function StepSchema({
  upload,
  schemas,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  upload: Upload
  schemas: Schema[]
  selected: Schema | null
  onSelect: (s: Schema) => void
  onSave: (data: { id?: string; company: string; name: string; fields: SchemaField[] }) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState<{ id?: string; name: string; fields: SchemaField[] } | null>(null)

  const handleSave = (data: { id?: string; name: string; fields: SchemaField[] }) => {
    onSave({ ...data, company: upload.company })
    setEditing(null)
  }

  if (editing) {
    return <SchemaEditor initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-6">
      {/* Left: schema list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Schemas</span>
          <button onClick={() => setEditing({ name: '', fields: [
            { key: 'page', label: 'Page', source: 'page', match_parent: '', match_child: '' },
            { key: 'category', label: 'Category', source: 'heading', match_parent: '', match_child: '' },
          ] })}
            className="rounded-md bg-blue-500 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-blue-600">
            + New
          </button>
        </div>

        {schemas.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 py-10 text-center">
            <div className="text-sm text-gray-400">No schemas yet</div>
            <div className="mt-1 text-[11px] text-gray-300">Create one to get started</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {schemas.map((s) => (
              <div key={s.id} onClick={() => onSelect(s)}
                className={`group cursor-pointer rounded-lg border px-3 py-2.5 transition-all ${
                  selected?.id === s.id
                    ? 'border-blue-400 bg-blue-50 shadow-sm shadow-blue-100'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-medium ${selected?.id === s.id ? 'text-blue-700' : 'text-gray-700'}`}>
                    {s.name}
                  </span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={(e) => { e.stopPropagation(); setEditing({ id: s.id, name: s.name, fields: s.fields }) }}
                      className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-white hover:text-blue-500">
                      Edit
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}
                      className="rounded px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-white hover:text-red-500">
                      Delete
                    </button>
                  </div>
                </div>
                <div className="mt-0.5 text-[10px] text-gray-400">
                  {s.fields.length} fields
                  {s.fields.some((f) => f.melt) && (
                    <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-[9px] font-medium text-blue-500">melt</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: selected schema preview */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {!selected ? (
          <div className="flex h-full items-center justify-center py-16 text-sm text-gray-300">
            Select a schema to preview
          </div>
        ) : (
          <>
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-gray-800">{selected.name}</h3>
              <p className="mt-0.5 text-[10px] text-gray-400">{selected.fields.length} extraction fields</p>
            </div>
            <div className="p-4">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wider text-gray-400">
                    <th className="pb-2 pr-4 font-semibold">Field</th>
                    <th className="pb-2 pr-4 font-semibold">Source</th>
                    <th className="pb-2 font-semibold">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.fields.map((f) => (
                    <tr key={f.key} className="border-b border-gray-50">
                      <td className="py-1.5 pr-4 font-medium text-gray-700">{f.label}</td>
                      <td className="py-1.5 pr-4">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          f.source === 'column'
                            ? f.melt ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-600'
                            : f.source === 'heading' ? 'bg-amber-50 text-amber-600'
                            : 'bg-purple-50 text-purple-600'
                        }`}>
                          {f.melt ? 'melt' : f.source}
                        </span>
                      </td>
                      <td className="py-1.5 text-gray-400">
                        {f.source === 'column' ? (
                          <div className="flex items-center gap-1">
                            {f.match_parent && (
                              <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">
                                {f.match_parent}
                              </span>
                            )}
                            {f.match_child && (
                              <>
                                <span className="text-[9px] text-gray-300">&rarr;</span>
                                <span className="inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-mono text-indigo-600">
                                  {f.match_child}
                                </span>
                              </>
                            )}
                            {f.melt && (
                              <span className="text-[9px] italic text-blue-400">all children</span>
                            )}
                            {!f.match_parent && !f.melt && (
                              <span className="text-gray-300">none</span>
                            )}
                          </div>
                        ) : '\u2014'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Step 2: Column Mapping ─────────────────────────────────────────

function StepMapping({
  schema,
  fieldMappings,
  totalOutputColumns,
}: {
  schema: Schema
  fieldMappings: FieldMapping[]
  totalOutputColumns: number
}) {
  const [expandedMelt, setExpandedMelt] = useState<string | null>(null)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Column Mapping</h3>
          <p className="mt-0.5 text-[10px] text-gray-400">
            {schema.fields.length} fields &rarr; {totalOutputColumns} output columns
          </p>
        </div>
      </div>

      <div className="divide-y divide-gray-50">
        {fieldMappings.map((fm) => {
          const f = fm.field
          const isMeltExpanded = expandedMelt === f.key
          return (
            <div key={f.key} className="px-5 py-2.5">
              <div className="flex items-center gap-4">
                <div className="w-40">
                  <span className="text-sm font-medium text-gray-700">{f.label}</span>
                  <span className="ml-1.5 text-[10px] font-mono text-gray-300">{f.key}</span>
                </div>

                <svg width="20" height="12" className="shrink-0 text-gray-300">
                  <line x1="0" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="1.5" />
                  <polygon points="14,2 20,6 14,10" fill="currentColor" />
                </svg>

                {fm.mode === 'auto' && (
                  <span className={`rounded-md px-2.5 py-1 text-[11px] font-medium ${
                    f.source === 'heading' ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-purple-600'
                  }`}>
                    {f.source === 'heading' ? 'Page Headings' : 'Page Number'}
                  </span>
                )}

                {fm.mode === 'flat' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Single column
                  </span>
                )}

                {fm.mode === 'pin' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2.5 py-1 text-[11px] font-medium text-green-700">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Pinned: {f.match_child}
                  </span>
                )}

                {fm.mode === 'melt' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedMelt(isMeltExpanded ? null : f.key)}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-100"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                      Unpivots {fm.matched_children.length} variants into rows
                    </button>
                  </div>
                )}

                {fm.output_count === 0 && fm.mode !== 'auto' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-400">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    No match
                  </span>
                )}
              </div>

              {/* Expanded melt children list */}
              {fm.mode === 'melt' && isMeltExpanded && fm.matched_children.length > 0 && (
                <div className="ml-[188px] mt-2 flex flex-wrap gap-1">
                  {fm.matched_children.map((child) => (
                    <span key={child} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-600">
                      {child}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 3: Results & Export ────────────────────────────────────────

function StepExport({
  result,
  uploading,
  onDownload,
}: {
  result: ExtractResult
  uploading: boolean
  onDownload: () => void
}) {
  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-lg font-bold text-gray-800">{result.row_count}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Rows</div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <div className="text-lg font-bold text-gray-800">{result.page_count}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Pages</div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div>
            <div className="text-lg font-bold text-gray-800">{result.columns.length}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Columns</div>
          </div>
        </div>
        <button onClick={onDownload} disabled={uploading}
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-600 disabled:bg-gray-300 disabled:shadow-none">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {uploading ? 'Preparing...' : 'Download CSV'}
        </button>
      </div>

      {/* Data table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50">
                <th className="border-b border-gray-200 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">#</th>
                {result.columns.map((col, i) => (
                  <th key={i} className="whitespace-nowrap border-b border-gray-200 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {result.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-gray-50/50">
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-gray-300">{ri + 1}</td>
                  {row.map((cell, ci) => (
                    <td key={ci} className={`whitespace-nowrap px-3 py-1.5 ${cell === '-' ? 'text-gray-300' : 'text-gray-700'}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main ExtractPage ───────────────────────────────────────────────

export function ExtractPage() {
  const { uploadId } = useParams<{ uploadId: string }>()
  const [upload, setUpload] = useState<Upload | null>(null)
  const [step, setStep] = useState(1)
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [selected, setSelected] = useState<Schema | null>(null)
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([])
  const [totalOutputColumns, setTotalOutputColumns] = useState(0)
  const [result, setResult] = useState<ExtractResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (uploadId) fetchUpload(uploadId).then(setUpload)
  }, [uploadId])

  const loadSchemas = useCallback(() => {
    if (upload) fetchSchemas(upload.company).then(setSchemas)
  }, [upload])

  useEffect(() => { loadSchemas() }, [loadSchemas])

  const handleSaveSchema = async (data: { id?: string; company: string; name: string; fields: SchemaField[] }) => {
    if (data.id) {
      const updated = await updateSchema(data.id, { name: data.name, fields: data.fields })
      setSchemas((prev) => prev.map((s) => s.id === data.id ? updated : s))
      if (selected?.id === data.id) setSelected(updated)
    } else {
      const created = await createSchema({ company: data.company, name: data.name, fields: data.fields })
      setSchemas((prev) => [created, ...prev])
      setSelected(created)
    }
  }

  const handleDelete = async (id: string) => {
    await deleteSchema(id)
    setSchemas((prev) => prev.filter((s) => s.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const goToMapping = async () => {
    if (!uploadId || !selected) return
    setLoading(true)
    const { field_mappings, total_output_columns } = await resolveColumns(uploadId, { schema_id: selected.id })
    setFieldMappings(field_mappings)
    setTotalOutputColumns(total_output_columns)
    setLoading(false)
    setStep(2)
  }

  const runExtraction = async () => {
    if (!uploadId || !selected) return
    setLoading(true)
    const res = await extractData(uploadId, { schema_id: selected.id })
    setResult(res)
    setLoading(false)
    setStep(3)
  }

  const handleDownload = async () => {
    if (!uploadId || !selected) return
    setDownloading(true)
    const blobUrl = await extractCsvUrl(uploadId, { schema_id: selected.id })
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${upload?.filename?.replace(/\.pdf$/i, '') || 'extract'}_extract.csv`
    a.click()
    URL.revokeObjectURL(blobUrl)
    setDownloading(false)
  }

  if (!upload) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 text-sm text-gray-300">Loading...</div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900">
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-2.5">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-base font-bold text-gray-900 transition-colors hover:text-blue-600">CAIE</Link>
          <span className="text-xs text-gray-400">Context Aware Information Extraction</span>
        </div>
        <span className="text-[10px] text-gray-300">&copy; Hashteelab</span>
      </header>

      {/* ── Sub-header with upload info + stepper ── */}
      <div className="border-b border-gray-200 bg-white px-6 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <div className="text-sm font-medium text-gray-800">{upload.filename}</div>
              <div className="flex items-center gap-2 text-[10px] text-gray-400">
                <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-500">
                  {upload.company}
                </span>
                <span>{upload.total_pages} pages</span>
              </div>
            </div>
          </div>
          <Stepper current={step} labels={STEPS} />
        </div>
      </div>

      {/* ── Content ── */}
      <main className="flex-1 overflow-y-auto">
        <div className={`mx-auto px-6 py-6 ${step === 3 ? 'max-w-6xl' : 'max-w-3xl'}`}>

          {/* Step 1: Schema */}
          {step === 1 && (
            <div className="space-y-5">
              <StepSchema
                upload={upload}
                schemas={schemas}
                selected={selected}
                onSelect={setSelected}
                onSave={handleSaveSchema}
                onDelete={handleDelete}
              />
              <div className="flex justify-end pt-2">
                <button onClick={goToMapping} disabled={!selected || loading}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none">
                  {loading ? 'Resolving columns...' : 'Next: Map Columns'}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Mapping */}
          {step === 2 && selected && (
            <div className="space-y-5">
              <StepMapping schema={selected} fieldMappings={fieldMappings} totalOutputColumns={totalOutputColumns} />
              <div className="flex items-center justify-between pt-2">
                <button onClick={() => setStep(1)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </button>
                <button onClick={runExtraction} disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none">
                  {loading ? 'Extracting...' : 'Extract & Preview'}
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Export */}
          {step === 3 && result && (
            <div className="space-y-5">
              <StepExport result={result} uploading={downloading} onDownload={handleDownload} />
              <div className="pt-2">
                <button onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-white hover:text-gray-700">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to Mapping
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
