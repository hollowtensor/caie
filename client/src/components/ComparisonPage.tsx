import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { compareExtractions, downloadComparisonCsv, getPageImageUrl } from '../api'
import type { ComparisonResult } from '../types'
import { ComparisonTable } from './ComparisonTable'

type StatusFilter = 'all' | 'NEW' | 'REMOVED' | 'UP' | 'DOWN' | 'UNAVAIL' | 'AVAIL' | 'SAME'

interface SelectedRowInfo {
  rowIndex: number
  basePage: string
  targetPage: string
  reference: string
  variant: string
}

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3]

export function ComparisonPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const baseId = searchParams.get('base')
  const targetId = searchParams.get('target')

  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [downloading, setDownloading] = useState(false)
  const [selectedRow, setSelectedRow] = useState<SelectedRowInfo | null>(null)
  const [baseZoom, setBaseZoom] = useState(1)
  const [targetZoom, setTargetZoom] = useState(1)

  useEffect(() => {
    if (!baseId || !targetId) {
      setError('Missing base or target upload ID')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    compareExtractions(baseId, targetId)
      .then(setResult)
      .catch((e) => setError(e.message || 'Comparison failed'))
      .finally(() => setLoading(false))
  }, [baseId, targetId])

  const handleDownload = async () => {
    if (!baseId || !targetId) return
    setDownloading(true)
    try {
      const blobUrl = await downloadComparisonCsv(baseId, targetId)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `comparison_${baseId}_vs_${targetId}.csv`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } catch (e) {
      console.error('Download failed:', e)
    } finally {
      setDownloading(false)
    }
  }

  const handleSwap = () => {
    if (!baseId || !targetId) return
    navigate(`/compare?base=${targetId}&target=${baseId}`)
  }

  const handleRowClick = (rowIndex: number) => {
    if (!result) return

    // Toggle off if clicking same row
    if (selectedRow?.rowIndex === rowIndex) {
      setSelectedRow(null)
      return
    }

    const row = result.rows[rowIndex]
    // Columns: Status, Reference, Variant, Description, Base Price, Target Price, Change, % Change, Base Page, Target Page
    const basePage = row[8] || ''
    const targetPage = row[9] || ''
    const reference = row[1] || ''
    const variant = row[2] || ''

    setSelectedRow({
      rowIndex,
      basePage,
      targetPage,
      reference,
      variant,
    })
    // Reset zoom when selecting a new row
    setBaseZoom(1)
    setTargetZoom(1)
  }

  const handleZoom = (
    current: number,
    setter: (v: number) => void,
    direction: 'in' | 'out'
  ) => {
    const currentIndex = ZOOM_LEVELS.indexOf(current)
    if (direction === 'in' && currentIndex < ZOOM_LEVELS.length - 1) {
      setter(ZOOM_LEVELS[currentIndex + 1])
    } else if (direction === 'out' && currentIndex > 0) {
      setter(ZOOM_LEVELS[currentIndex - 1])
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-400">
        Comparing documents...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500">{error}</p>
          <Link to="/" className="mt-2 text-xs text-blue-500 hover:text-blue-600">
            ← Back to uploads
          </Link>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-400">
        No comparison data
      </div>
    )
  }

  const { summary, base_upload, target_upload, debug } = result

  // Get counts for filter buttons
  const statusCounts = {
    NEW: summary.added,
    REMOVED: summary.removed,
    UP: summary.price_increased,
    DOWN: summary.price_decreased,
    UNAVAIL: summary.price_unavailable || 0,
    AVAIL: summary.price_available || 0,
    SAME: summary.unchanged,
  }

  // Show debug info if there are no matches
  const hasNoMatches = summary.matched === 0 && (summary.added > 0 || summary.removed > 0)

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8">
      {/* Header */}
      <div className="mb-4">
        <Link
          to={`/extract/${baseId}`}
          className="text-[10px] text-blue-500 hover:text-blue-600 font-medium"
        >
          ← Back to extraction
        </Link>
        <h1 className="mt-1 text-lg font-bold text-gray-900">
          Pricelist Comparison
        </h1>
      </div>

      {/* Document selector with swap */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Base document */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Base (Old)
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800 truncate" title={base_upload.filename}>
                  {base_upload.filename}
                </div>
                <div className="text-[10px] text-gray-400">
                  {base_upload.company}
                  {base_upload.year && ` · ${base_upload.month ? `${base_upload.month}/` : ''}${base_upload.year}`}
                </div>
              </div>
            </div>
          </div>

          {/* Swap button */}
          <button
            onClick={handleSwap}
            className="flex-shrink-0 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-gray-300 transition-colors group"
            title="Swap base and target"
          >
            <svg className="h-5 w-5 text-gray-400 group-hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>

          {/* Target document */}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Target (New)
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-800 truncate" title={target_upload.filename}>
                  {target_upload.filename}
                </div>
                <div className="text-[10px] text-gray-400">
                  {target_upload.company}
                  {target_upload.year && ` · ${target_upload.month ? `${target_upload.month}/` : ''}${target_upload.year}`}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-6 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-800">{summary.total_base}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Base Items</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-800">{summary.total_target}</div>
          <div className="text-[10px] uppercase tracking-wider text-gray-400">Target Items</div>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="text-2xl font-bold text-green-600">+{summary.added}</div>
          <div className="text-[10px] uppercase tracking-wider text-green-500">Added</div>
        </div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="text-2xl font-bold text-red-600">-{summary.removed}</div>
          <div className="text-[10px] uppercase tracking-wider text-red-500">Removed</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="text-2xl font-bold text-amber-600">{summary.price_increased}</div>
          <div className="text-[10px] uppercase tracking-wider text-amber-500">Price Up</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="text-2xl font-bold text-blue-600">{summary.price_decreased}</div>
          <div className="text-[10px] uppercase tracking-wider text-blue-500">Price Down</div>
        </div>
      </div>

      {/* Debug info when no matches */}
      {hasNoMatches && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-.833-2.694-.833-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-800">No matching items found</h3>
              <p className="mt-1 text-xs text-amber-700">
                The documents have no matching references. This could mean:
              </p>
              <ul className="mt-2 text-xs text-amber-700 list-disc ml-4 space-y-1">
                <li>The reference column uses different formats in each document</li>
                <li>These are genuinely different product catalogs</li>
                <li>The extraction config (row anchor: "{debug.row_anchor}") doesn't match the columns</li>
              </ul>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1">
                    Sample refs from base ({summary.total_base} items)
                  </div>
                  <div className="text-xs text-amber-800 font-mono bg-amber-100/50 rounded p-2 max-h-24 overflow-auto">
                    {debug.base_sample_refs.length > 0
                      ? debug.base_sample_refs.map((r, i) => <div key={i}>{r}</div>)
                      : <span className="text-amber-500 italic">No items extracted</span>
                    }
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-1">
                    Sample refs from target ({summary.total_target} items)
                  </div>
                  <div className="text-xs text-amber-800 font-mono bg-amber-100/50 rounded p-2 max-h-24 overflow-auto">
                    {debug.target_sample_refs.length > 0
                      ? debug.target_sample_refs.map((r, i) => <div key={i}>{r}</div>)
                      : <span className="text-amber-500 italic">No items extracted</span>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter tabs & download */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'all'
                ? 'bg-gray-800 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All ({result.rows.length})
          </button>
          <button
            onClick={() => setFilter('NEW')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'NEW'
                ? 'bg-green-600 text-white'
                : 'text-green-600 hover:bg-green-50'
            }`}
          >
            New ({statusCounts.NEW})
          </button>
          <button
            onClick={() => setFilter('REMOVED')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'REMOVED'
                ? 'bg-red-600 text-white'
                : 'text-red-600 hover:bg-red-50'
            }`}
          >
            Removed ({statusCounts.REMOVED})
          </button>
          <button
            onClick={() => setFilter('UP')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'UP'
                ? 'bg-amber-600 text-white'
                : 'text-amber-600 hover:bg-amber-50'
            }`}
          >
            Price Up ({statusCounts.UP})
          </button>
          <button
            onClick={() => setFilter('DOWN')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'DOWN'
                ? 'bg-blue-600 text-white'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            Price Down ({statusCounts.DOWN})
          </button>
          {statusCounts.UNAVAIL > 0 && (
            <button
              onClick={() => setFilter('UNAVAIL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === 'UNAVAIL'
                  ? 'bg-orange-600 text-white'
                  : 'text-orange-600 hover:bg-orange-50'
              }`}
            >
              Unavailable ({statusCounts.UNAVAIL})
            </button>
          )}
          {statusCounts.AVAIL > 0 && (
            <button
              onClick={() => setFilter('AVAIL')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === 'AVAIL'
                  ? 'bg-teal-600 text-white'
                  : 'text-teal-600 hover:bg-teal-50'
              }`}
            >
              Available ({statusCounts.AVAIL})
            </button>
          )}
          <button
            onClick={() => setFilter('SAME')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === 'SAME'
                ? 'bg-gray-500 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Unchanged ({statusCounts.SAME})
          </button>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {downloading ? 'Preparing...' : 'Download CSV'}
        </button>
      </div>

      {/* Comparison table + Page preview */}
      <div className="flex gap-4">
        <div className={selectedRow ? 'w-[55%] min-w-0 flex-shrink-0' : 'w-full'}>
          <ComparisonTable
            columns={result.columns}
            rows={result.rows}
            filter={filter}
            onRowClick={handleRowClick}
            selectedRow={selectedRow?.rowIndex ?? null}
          />
        </div>

        {/* Side-by-side page preview */}
        {selectedRow && baseId && targetId && (
          <div className="flex-1 min-w-0">
            <div className="sticky top-4 rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
                <div className="text-xs font-semibold text-gray-600">
                  {selectedRow.reference}
                  {selectedRow.variant && <span className="text-gray-400 ml-1">({selectedRow.variant})</span>}
                </div>
                <button
                  onClick={() => setSelectedRow(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Side-by-side images */}
              <div className="grid grid-cols-2 gap-2 p-2" style={{ maxHeight: '70vh', overflow: 'auto' }}>
                {/* Base page */}
                <div>
                  <div className="flex items-center justify-between mb-1 px-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Base — Page {selectedRow.basePage || '—'}
                    </div>
                    {selectedRow.basePage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleZoom(baseZoom, setBaseZoom, 'out')}
                          disabled={baseZoom === ZOOM_LEVELS[0]}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Zoom out"
                        >
                          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                          </svg>
                        </button>
                        <span className="text-[10px] text-gray-500 min-w-[36px] text-center">
                          {Math.round(baseZoom * 100)}%
                        </span>
                        <button
                          onClick={() => handleZoom(baseZoom, setBaseZoom, 'in')}
                          disabled={baseZoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Zoom in"
                        >
                          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedRow.basePage ? (
                    <div className="overflow-auto rounded border border-gray-200 bg-gray-50" style={{ maxHeight: '60vh' }}>
                      <img
                        src={getPageImageUrl(baseId, `page_${String(selectedRow.basePage).padStart(3, '0')}.png`)}
                        alt={`Base page ${selectedRow.basePage}`}
                        style={{ width: `${baseZoom * 100}%`, maxWidth: 'none' }}
                        className="rounded"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40 bg-gray-50 rounded border border-gray-200 text-xs text-gray-400">
                      Not in base document
                    </div>
                  )}
                </div>

                {/* Target page */}
                <div>
                  <div className="flex items-center justify-between mb-1 px-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      Target — Page {selectedRow.targetPage || '—'}
                    </div>
                    {selectedRow.targetPage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleZoom(targetZoom, setTargetZoom, 'out')}
                          disabled={targetZoom === ZOOM_LEVELS[0]}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Zoom out"
                        >
                          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                          </svg>
                        </button>
                        <span className="text-[10px] text-gray-500 min-w-[36px] text-center">
                          {Math.round(targetZoom * 100)}%
                        </span>
                        <button
                          onClick={() => handleZoom(targetZoom, setTargetZoom, 'in')}
                          disabled={targetZoom === ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                          className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
                          title="Zoom in"
                        >
                          <svg className="h-3.5 w-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {selectedRow.targetPage ? (
                    <div className="overflow-auto rounded border border-gray-200 bg-gray-50" style={{ maxHeight: '60vh' }}>
                      <img
                        src={getPageImageUrl(targetId, `page_${String(selectedRow.targetPage).padStart(3, '0')}.png`)}
                        alt={`Target page ${selectedRow.targetPage}`}
                        style={{ width: `${targetZoom * 100}%`, maxWidth: 'none' }}
                        className="rounded"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-40 bg-gray-50 rounded border border-gray-200 text-xs text-gray-400">
                      Not in target document
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
