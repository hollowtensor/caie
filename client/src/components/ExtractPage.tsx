import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import {
  fetchUpload,
  fetchSchemas,
  deleteSchema,
  extractData,
  extractCsvUrl,
  fetchTableRegions,
} from '../api'
import type { Upload, Schema, ExtractConfig, ExtractResult, TableRegion } from '../types'
import { DataTable } from './DataTable'

/* ------------------------------------------------------------------ */
/*  Export view                                                        */
/* ------------------------------------------------------------------ */

function ExportView({
  result,
  uploadId,
  downloading,
  onDownload,
  onBack,
}: {
  result: ExtractResult
  uploadId: string
  downloading: boolean
  onDownload: () => void
  onBack: () => void
}) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [regions, setRegions] = useState<TableRegion[]>([])

  // Find the "Page" column index to get page number from row data
  const pageColIdx = result.columns.findIndex(
    (c) => c.toLowerCase() === 'page',
  )

  const previewPageNum =
    selectedRow !== null && pageColIdx >= 0
      ? parseInt(result.rows[selectedRow]?.[pageColIdx] ?? '', 10)
      : null

  const selectedTableIdx =
    selectedRow !== null ? result.row_table_indices?.[selectedRow] ?? null : null

  // Fetch table regions when page changes
  useEffect(() => {
    if (!previewPageNum || previewPageNum <= 0) {
      setRegions([])
      return
    }
    fetchTableRegions(uploadId, previewPageNum).then(setRegions)
  }, [uploadId, previewPageNum])

  const handleRowClick = (originalIndex: number) => {
    setSelectedRow(originalIndex === selectedRow ? null : originalIndex)
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-gray-800">{result.row_count}</span>
          <span className="text-[10px] uppercase text-gray-400">Rows</span>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-gray-800">{result.page_count}</span>
          <span className="text-[10px] uppercase text-gray-400">Pages</span>
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-gray-800">{result.columns.length}</span>
          <span className="text-[10px] uppercase text-gray-400">Columns</span>
        </div>
        {result.flagged_count > 0 && (
          <>
            <div className="h-5 w-px bg-gray-200" />
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-red-500">{result.flagged_count}</span>
              <span className="text-[10px] uppercase text-red-400">Flagged</span>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onBack}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            ← Reconfigure
          </button>
          <button
            onClick={onDownload}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {downloading ? 'Preparing...' : 'Download CSV'}
          </button>
        </div>
      </div>

      {/* Table + Page preview */}
      <div className="flex gap-4">
        <div className={previewPageNum ? 'flex-1 min-w-0' : 'w-full'}>
          <DataTable
            columns={result.columns}
            rows={result.rows}
            flags={result.flags}
            onRowClick={handleRowClick}
            selectedRow={selectedRow}
          />
        </div>

        {/* Page preview panel */}
        {previewPageNum && previewPageNum > 0 && (
          <div className="w-[380px] flex-shrink-0">
            <div className="sticky top-8 rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                <span className="text-xs font-semibold text-gray-600">
                  Page {previewPageNum}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    -
                  </button>
                  <button
                    onClick={() => setZoom(1)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:bg-gray-100 tabular-nums transition-colors"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    +
                  </button>
                  <div className="mx-1 h-4 w-px bg-gray-200" />
                  <button
                    onClick={() => setSelectedRow(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="overflow-auto p-2" style={{ maxHeight: '75vh' }}>
                <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }} className="relative">
                  <img
                    src={`/pages/${uploadId}/page_${String(previewPageNum).padStart(3, '0')}.png`}
                    alt={`Page ${previewPageNum}`}
                    className="w-full rounded"
                  />
                  {/* Table region overlays */}
                  {regions.map((r) => (
                    <div
                      key={r.index}
                      className={`absolute left-0 w-full pointer-events-none transition-opacity ${
                        r.index === selectedTableIdx
                          ? 'bg-blue-400/20 border-2 border-blue-500 rounded'
                          : 'bg-transparent'
                      }`}
                      style={{
                        top: `${r.top * 100}%`,
                        height: `${r.height * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export function ExtractPage() {
  const { uploadId } = useParams<{ uploadId: string }>()
  const [searchParams] = useSearchParams()
  const isCustom = searchParams.get('custom') === '1'
  const [upload, setUpload] = useState<Upload | null>(null)
  const [schemas, setSchemas] = useState<Schema[]>([])
  const [result, setResult] = useState<ExtractResult | null>(null)
  const autoRan = useRef(false)

  const [config, setConfig] = useState<ExtractConfig>({
    row_anchor: '',
    value_anchor: '',
    extras: [],
    include_page: true,
    include_heading: true,
  })
  const [extrasText, setExtrasText] = useState('')

  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (uploadId) fetchUpload(uploadId).then(setUpload)
  }, [uploadId])

  const loadSchemas = useCallback(() => {
    if (upload) fetchSchemas(upload.company).then(setSchemas)
  }, [upload])
  useEffect(() => { loadSchemas() }, [loadSchemas])

  // Auto-run extraction with default config when coming from "View Results"
  useEffect(() => {
    if (autoRan.current || isCustom || !uploadId || !upload || schemas.length === 0) return
    if (upload.extract_state !== 'done') return
    const defaultSchema = schemas.find((s) => s.is_default)
    if (!defaultSchema) return
    autoRan.current = true
    const cfg = defaultSchema.fields
    setConfig(cfg)
    setExtrasText(cfg.extras.join(', '))
    setLoading(true)
    extractData(uploadId, cfg).then((res) => {
      setResult(res)
      setLoading(false)
    })
  }, [uploadId, upload, schemas, isCustom])

  const handleLoadSchema = (s: Schema) => {
    setConfig(s.fields)
    setExtrasText(s.fields.extras.join(', '))
    setResult(null)
  }

  const handleDeleteSchema = async (id: string) => {
    await deleteSchema(id)
    setSchemas((prev) => prev.filter((s) => s.id !== id))
  }

  const runExtraction = async () => {
    if (!uploadId) return
    setLoading(true)
    const extractConfig: ExtractConfig = {
      ...config,
      extras: extrasText.split(',').map((s) => s.trim()).filter(Boolean),
    }
    const res = await extractData(uploadId, extractConfig)
    setResult(res)
    setLoading(false)
  }

  const handleDownload = async () => {
    if (!uploadId) return
    setDownloading(true)
    const extractConfig: ExtractConfig = {
      ...config,
      extras: extrasText.split(',').map((s) => s.trim()).filter(Boolean),
    }
    const blobUrl = await extractCsvUrl(uploadId, extractConfig)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `${upload?.filename?.replace(/\.pdf$/i, '') || 'extract'}_extract.csv`
    a.click()
    URL.revokeObjectURL(blobUrl)
    setDownloading(false)
  }

  if (!upload || (loading && !result)) {
    return <div className="flex h-screen items-center justify-center text-sm text-gray-400">
      {loading ? 'Extracting...' : 'Loading...'}
    </div>
  }

  return (
    <div className={`mx-auto px-6 py-8 ${result ? 'max-w-[1400px]' : 'max-w-5xl'}`}>
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="text-[10px] text-blue-500 hover:text-blue-600 font-medium">
          ← Back
        </Link>
        <h1 className="mt-1 text-lg font-bold text-gray-900">
          {result && !isCustom ? 'Extraction Results' : 'Custom Extract'} — {upload.filename}
        </h1>
        <p className="text-[11px] text-gray-400">
          {upload.company} · {upload.total_pages} pages
        </p>
      </div>

      {result ? (
        <ExportView
          result={result}
          uploadId={uploadId!}
          downloading={downloading}
          onDownload={handleDownload}
          onBack={() => setResult(null)}
        />
      ) : (
        <div className="space-y-5">
          {/* Saved configs */}
          {schemas.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Saved Configs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {schemas.map((s) => (
                  <div key={s.id} className="group flex items-center gap-1 rounded-md border px-2 py-1">
                    <button onClick={() => handleLoadSchema(s)} className="text-[11px] text-gray-700 font-medium">
                      {s.name}
                    </button>
                    <button
                      onClick={() => handleDeleteSchema(s.id)}
                      className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Config inputs */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Column Anchors</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Row Identifier
                </label>
                <input
                  value={config.row_anchor}
                  onChange={(e) => setConfig({ ...config, row_anchor: e.target.value })}
                  placeholder='e.g. "Reference"'
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Value Column
                </label>
                <input
                  value={config.value_anchor}
                  onChange={(e) => setConfig({ ...config, value_anchor: e.target.value })}
                  placeholder='e.g. "Unit MRP"'
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Extra Columns (comma-separated, optional)
              </label>
              <input
                value={extrasText}
                onChange={(e) => setExtrasText(e.target.value)}
                placeholder='e.g. "Description, Category"'
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={config.include_page}
                  onChange={(e) => setConfig({ ...config, include_page: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-500"
                />
                <span className="text-[11px] text-gray-600">Page #</span>
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={config.include_heading}
                  onChange={(e) => setConfig({ ...config, include_heading: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-500"
                />
                <span className="text-[11px] text-gray-600">Heading</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={runExtraction}
              disabled={!config.row_anchor.trim() || !config.value_anchor.trim() || loading}
              className="rounded-lg bg-gray-800 px-5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-gray-900 disabled:opacity-40"
            >
              {loading ? 'Extracting...' : 'Extract'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
