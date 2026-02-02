import { Link } from 'react-router-dom'
import type { Upload, StatusUpdate } from '../types'

interface Props {
  status: StatusUpdate | null
  upload: Upload | null
  uploadId: string | null
  onResume?: () => void
}

export function ProgressCard({ status, upload, uploadId, onResume }: Props) {
  const s = status || upload
  if (!s) return null

  const pct = s.total_pages > 0 ? Math.round((s.current_page / s.total_pages) * 100) : 0
  const isDone = s.state === 'done'
  const isError = s.state === 'error'
  const isStale = !status && !isDone && s.state !== 'queued'

  // Extraction state from SSE or upload object
  const extractState = ('extract_state' in s ? s.extract_state : null) as string | null

  const title = isDone ? 'Parsing Complete'
    : isError ? 'Error'
    : s.state === 'rendering' ? 'Rendering pages...'
    : isStale ? 'Interrupted'
    : 'Parsing pages...'

  const barColor = isDone ? 'bg-green-500' : isError || isStale ? 'bg-red-500' : 'bg-blue-500'

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <div className="flex gap-1.5">
          {isStale && onResume && (
            <button onClick={onResume}
              className="rounded bg-blue-500 px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-600">
              Resume
            </button>
          )}
        </div>
      </div>
      <div className="my-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${isDone || isError ? 100 : pct}%` }} />
      </div>
      <div className="mb-2 text-xs text-gray-500">{s.message}</div>
      <div className="mb-3 flex gap-5 text-[11px] text-gray-400">
        <span>Page <strong className="text-gray-700">{s.current_page}/{s.total_pages}</strong></span>
        <span>State <strong className="text-gray-700">{s.state}</strong></span>
      </div>

      {/* Extraction status + actions */}
      {isDone && uploadId && (
        <div className="border-t border-gray-100 pt-3">
          {extractState === 'done' ? (
            <div className="flex items-center gap-2">
              <Link
                to={`/extract/${uploadId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                View Results
              </Link>
              <Link
                to={`/extract/${uploadId}?custom=1`}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                Custom Extract
              </Link>
              <a href={`/api/uploads/${uploadId}/markdown`}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                Download Parsed
              </a>
            </div>
          ) : extractState === 'running' ? (
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Auto-extracting...
            </div>
          ) : extractState === 'no_config' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-amber-600">No default extraction config.</span>
              <Link
                to="/settings"
                className="text-xs font-medium text-blue-500 hover:text-blue-600"
              >
                Set up in Settings
              </Link>
              <span className="text-xs text-gray-300">|</span>
              <Link
                to={`/extract/${uploadId}`}
                className="text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                Custom Extract
              </Link>
              <span className="text-xs text-gray-300">|</span>
              <a href={`/api/uploads/${uploadId}/markdown`}
                className="text-xs font-medium text-gray-500 hover:text-gray-700">
                Download Parsed
              </a>
            </div>
          ) : extractState === 'error' ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-500">Auto-extraction failed.</span>
              <Link
                to={`/extract/${uploadId}`}
                className="text-xs font-medium text-blue-500 hover:text-blue-600"
              >
                Try Custom Extract
              </Link>
              <span className="text-xs text-gray-300">|</span>
              <a href={`/api/uploads/${uploadId}/markdown`}
                className="text-xs font-medium text-gray-500 hover:text-gray-700">
                Download Parsed
              </a>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to={`/extract/${uploadId}`}
                className="rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-600"
              >
                Extract Pricelist
              </Link>
              <a href={`/api/uploads/${uploadId}/markdown`}
                className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                Download Parsed
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
