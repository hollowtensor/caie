import type { StatusUpdate } from '../types'

interface Props {
  status: StatusUpdate | null
  upload: { state: string; message: string; current_page: number; total_pages: number } | null
}

export function ProgressCard({ status, upload }: Props) {
  const s = status || upload
  if (!s) return null

  const pct = s.total_pages > 0 ? Math.round((s.current_page / s.total_pages) * 100) : 0
  const isDone = s.state === 'done'
  const isError = s.state === 'error'

  const title = isDone ? 'Complete'
    : isError ? 'Error'
    : s.state === 'rendering' ? 'Rendering pages...'
    : 'Running OCR...'

  const barColor = isDone ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-blue-500'

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <div className="my-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
        <div className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${isDone || isError ? 100 : pct}%` }} />
      </div>
      <div className="mb-1 text-xs text-gray-500">{s.message}</div>
      <div className="flex gap-5 text-[11px] text-gray-400">
        <span>Page <strong className="text-gray-700">{s.current_page}/{s.total_pages}</strong></span>
        <span>State <strong className="text-gray-700">{s.state}</strong></span>
      </div>
    </div>
  )
}
