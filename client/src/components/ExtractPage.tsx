import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import {
  fetchUpload,
  fetchSchemas,
  deleteSchema,
  extractData,
  extractCsvUrl,
  fetchPageMarkdown,
  validateTable,
  applyCorrection,
} from '../api'
import type { Upload, Schema, ExtractConfig, ExtractResult } from '../types'
import { DataTable } from './DataTable'

/* ------------------------------------------------------------------ */
/*  Markdown view with table highlighting                              */
/* ------------------------------------------------------------------ */

function PageMarkdownView({
  markdown,
  highlightTableIdx,
}: {
  markdown: string
  highlightTableIdx: number | null
}) {
  // Split markdown by <table>...</table> blocks, wrap the target one
  const highlighted = useMemo(() => {
    if (highlightTableIdx === null || !markdown) return markdown

    let tableCount = 0
    return markdown.replace(
      /<table[\s\S]*?<\/table>/gi,
      (match) => {
        const idx = tableCount++
        if (idx === highlightTableIdx) {
          return `<div class="highlighted-table"><div class="table-label">Source Table</div>${match}</div>`
        }
        return match
      },
    )
  }, [markdown, highlightTableIdx])

  return (
    <div className="page-markdown-preview prose prose-sm max-w-none text-[11px]">
      <style>{`
        .page-markdown-preview table {
          border-collapse: collapse;
          width: 100%;
          font-size: 10px;
          margin: 8px 0;
        }
        .page-markdown-preview th,
        .page-markdown-preview td {
          border: 1px solid #e5e7eb;
          padding: 3px 6px;
          text-align: left;
          white-space: nowrap;
        }
        .page-markdown-preview th {
          background: #f9fafb;
          font-weight: 600;
          color: #374151;
        }
        .page-markdown-preview td {
          color: #4b5563;
        }
        .page-markdown-preview .highlighted-table {
          position: relative;
          background: #dbeafe;
          border: 2px solid #3b82f6;
          border-radius: 6px;
          padding: 4px;
          margin: 8px 0;
        }
        .page-markdown-preview .highlighted-table table {
          margin: 0;
        }
        .page-markdown-preview .table-label {
          font-size: 9px;
          font-weight: 700;
          color: #2563eb;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 6px 4px;
        }
        .page-markdown-preview h1,
        .page-markdown-preview h2,
        .page-markdown-preview h3,
        .page-markdown-preview h4 {
          font-size: 11px;
          font-weight: 700;
          color: #1f2937;
          margin: 10px 0 4px;
        }
        .page-markdown-preview p {
          margin: 4px 0;
          color: #6b7280;
        }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {highlighted}
      </ReactMarkdown>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Table diff utilities                                               */
/* ------------------------------------------------------------------ */

/** Extract all text content from an HTML table, normalized */
function extractTextContent(html: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const cells = doc.querySelectorAll('td, th')
  return Array.from(cells)
    .map((c) => (c.textContent || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|')
}

/** Check if two tables have the same content (ignoring structural differences) */
function tablesAreSame(original: string, corrected: string): boolean {
  return extractTextContent(original) === extractTextContent(corrected)
}

/* ------------------------------------------------------------------ */
/*  VLM diff view                                                      */
/* ------------------------------------------------------------------ */

function VlmDiffView({
  original,
  corrected,
  onAccept,
  onReject,
}: {
  original: string
  corrected: string
  onAccept: () => void
  onReject: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
        <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span className="font-medium">VLM re-OCR complete — review below</span>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">Current (Original OCR)</div>
        <div className="rounded border border-red-200 bg-red-50/30 p-2 overflow-auto">
          <div className="vlm-table-preview" dangerouslySetInnerHTML={{ __html: original }} />
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-green-600 mb-1">VLM Re-OCR</div>
        <div className="rounded border border-green-200 bg-green-50/30 p-2 overflow-auto">
          <div className="vlm-table-preview" dangerouslySetInnerHTML={{ __html: corrected }} />
        </div>
      </div>

      <style>{`
        .vlm-table-preview table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .vlm-table-preview th, .vlm-table-preview td { border: 1px solid #e5e7eb; padding: 3px 6px; text-align: left; white-space: nowrap; }
        .vlm-table-preview th { background: #f9fafb; font-weight: 600; }
      `}</style>

      <div className="flex gap-2 pt-1">
        <button
          onClick={onAccept}
          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700"
        >
          Accept VLM Version
        </button>
        <button
          onClick={onReject}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          Keep Original
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Export view                                                        */
/* ------------------------------------------------------------------ */

function ExportView({
  result,
  uploadId,
  downloading,
  onDownload,
  onBack,
  onRefresh,
  extractConfig,
}: {
  result: ExtractResult
  uploadId: string
  downloading: boolean
  onDownload: () => void
  onBack: () => void
  onRefresh: (res: ExtractResult) => void
  extractConfig: ExtractConfig
}) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [previewTab, setPreviewTab] = useState<'image' | 'parsed'>('parsed')
  const [pageMarkdown, setPageMarkdown] = useState<string>('')

  // VLM validation state
  const [vlmState, setVlmState] = useState<'idle' | 'loading' | 'preview' | 'no-change'>('idle')
  const [vlmOriginal, setVlmOriginal] = useState('')
  const [vlmCorrected, setVlmCorrected] = useState('')
  const [vlmError, setVlmError] = useState('')

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

  // Fetch page markdown when page changes
  useEffect(() => {
    if (!previewPageNum || previewPageNum <= 0) {
      setPageMarkdown('')
      return
    }
    fetchPageMarkdown(uploadId, previewPageNum).then((p) =>
      setPageMarkdown(p.markdown || ''),
    )
    // Reset VLM state when changing rows
    setVlmState('idle')
    setVlmError('')
  }, [uploadId, previewPageNum])

  const handleRowClick = (originalIndex: number) => {
    setSelectedRow(originalIndex === selectedRow ? null : originalIndex)
  }

  const handleValidate = async () => {
    if (!previewPageNum || selectedTableIdx === null) return
    setVlmState('loading')
    setVlmError('')
    try {
      const { original, corrected } = await validateTable(uploadId, previewPageNum, selectedTableIdx)
      setVlmOriginal(original)
      setVlmCorrected(corrected)
      setVlmState(tablesAreSame(original, corrected) ? 'no-change' : 'preview')
    } catch (e: unknown) {
      setVlmError(e instanceof Error ? e.message : 'VLM validation failed')
      setVlmState('idle')
    }
  }

  const handleAccept = async () => {
    if (!previewPageNum || selectedTableIdx === null) return
    await applyCorrection(uploadId, previewPageNum, selectedTableIdx, vlmCorrected)
    setVlmState('idle')
    // Re-fetch markdown to show updated content
    fetchPageMarkdown(uploadId, previewPageNum).then((p) =>
      setPageMarkdown(p.markdown || ''),
    )
    // Re-run extraction to refresh results
    const res = await extractData(uploadId, extractConfig)
    onRefresh(res)
  }

  const handleReject = () => {
    setVlmState('idle')
    setVlmOriginal('')
    setVlmCorrected('')
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
          <div className="w-[420px] flex-shrink-0">
            <div className="sticky top-8 rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Header with tabs and controls */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-gray-600 mr-2">
                    Page {previewPageNum}
                  </span>
                  <button
                    onClick={() => setPreviewTab('parsed')}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      previewTab === 'parsed'
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Parsed
                  </button>
                  <button
                    onClick={() => setPreviewTab('image')}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      previewTab === 'image'
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Image
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {previewTab === 'image' && (
                    <>
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
                    </>
                  )}
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

              {/* Content */}
              <div className="overflow-auto p-2" style={{ maxHeight: '75vh' }}>
                {previewTab === 'image' ? (
                  <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
                    <img
                      src={`/pages/${uploadId}/page_${String(previewPageNum).padStart(3, '0')}.png`}
                      alt={`Page ${previewPageNum}`}
                      className="w-full rounded"
                    />
                  </div>
                ) : vlmState === 'no-change' ? (
                  <div>
                    <PageMarkdownView
                      markdown={pageMarkdown}
                      highlightTableIdx={selectedTableIdx}
                    />
                    <div className="mt-3 border-t border-gray-100 pt-3">
                      <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                        <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs text-green-700 font-medium">VLM confirmed — no OCR errors detected in this table</span>
                      </div>
                      <button
                        onClick={handleReject}
                        className="mt-2 text-[10px] text-gray-400 hover:text-gray-600"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : vlmState === 'preview' ? (
                  <VlmDiffView
                    original={vlmOriginal}
                    corrected={vlmCorrected}
                    onAccept={handleAccept}
                    onReject={handleReject}
                  />
                ) : (
                  <div>
                    <PageMarkdownView
                      markdown={pageMarkdown}
                      highlightTableIdx={selectedTableIdx}
                    />
                    {/* VLM validate button */}
                    {selectedTableIdx !== null && (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        {vlmState === 'loading' ? (
                          <div className="flex items-center gap-2 text-xs text-blue-600">
                            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Validating with VLM...
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={handleValidate}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Validate with VLM
                            </button>
                            {vlmError && (
                              <p className="mt-2 text-[11px] text-red-500">{vlmError}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
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
          onRefresh={setResult}
          extractConfig={{
            ...config,
            extras: extrasText.split(',').map((s) => s.trim()).filter(Boolean),
          }}
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
