import type { Upload } from '../types'
import { deleteUpload } from '../api'

const MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const BADGE: Record<string, string> = {
  done:      'bg-green-100 text-green-800',
  error:     'bg-red-100 text-red-800',
  ocr:       'bg-blue-100 text-blue-800',
  rendering: 'bg-blue-100 text-blue-800',
  queued:    'bg-gray-100 text-gray-500',
}

interface Props {
  uploads: Upload[]
  activeId: string | null
  onSelect: (id: string) => void
  onRefresh: () => void
}

export function UploadList({ uploads, activeId, onSelect, onRefresh }: Props) {
  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Delete this upload and all its pages?')) return
    await deleteUpload(id)
    onRefresh()
  }

  return (
    <div className="flex-1 overflow-y-auto border-b border-gray-100 p-4">
      <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        Uploads
      </div>
      {uploads.length === 0 && (
        <div className="py-6 text-center text-xs text-gray-300">No uploads yet</div>
      )}
      <ul className="space-y-0.5">
        {uploads.map((u) => (
          <li key={u.id} onClick={() => onSelect(u.id)}
            className={`group flex cursor-pointer items-center justify-between rounded px-2.5 py-2 text-xs transition-colors
              ${u.id === activeId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{u.filename}</div>
              <div className="text-[10px] text-gray-400">
                {u.company} &middot; {MONTHS[u.month ?? 0] || '?'} {u.year || '?'}
              </div>
            </div>
            <div className="ml-2 flex items-center gap-1.5">
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${BADGE[u.state] || BADGE.queued}`}>
                {u.state}
              </span>
              <button onClick={(e) => handleDelete(e, u.id)}
                className="hidden text-gray-300 hover:text-red-500 group-hover:block"
                title="Delete">&times;</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
