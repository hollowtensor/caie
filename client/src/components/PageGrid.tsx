import { useEffect, useState } from 'react'
import { fetchPages, fetchPageStates } from '../api'
import type { PageState } from '../types'

const BORDER: Record<string, string> = {
  done:    'border-green-300',
  error:   'border-red-300',
  pending: 'border-gray-200',
}

interface Props {
  uploadId: string | null
  activePage: number | null
  onSelectPage: (pageNum: number) => void
  refreshKey: number
}

export function PageGrid({ uploadId, activePage, onSelectPage, refreshKey }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [states, setStates] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!uploadId) { setFiles([]); return }
    let cancelled = false
    const poll = async () => {
      const f = await fetchPages(uploadId)
      if (!cancelled) setFiles(f)
      if (f.length === 0 && !cancelled) setTimeout(poll, 1500)
    }
    poll()
    return () => { cancelled = true }
  }, [uploadId, refreshKey])

  useEffect(() => {
    if (!uploadId) { setStates({}); return }
    const load = async () => {
      const ps = await fetchPageStates(uploadId)
      const m: Record<number, string> = {}
      ps.forEach((s: PageState) => { m[s.page_num] = s.state })
      setStates(m)
    }
    load()
  }, [uploadId, refreshKey])

  if (!uploadId || files.length === 0) return null

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        Pages ({files.length})
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
        {files.map((f, i) => {
          const num = i + 1
          const st = states[num] || 'pending'
          return (
            <div key={f} onClick={() => onSelectPage(num)}
              className={`relative aspect-[0.707] cursor-pointer overflow-hidden rounded border-2 transition-colors
                ${activePage === num ? 'border-blue-500' : BORDER[st] || BORDER.pending}
                hover:border-blue-300`}>
              <img src={`/pages/${uploadId}/${f}`} loading="lazy"
                className="h-full w-full object-cover" alt={`Page ${num}`} />
              {st === 'pending' && (
                <div className="absolute inset-0 bg-white/50" />
              )}
              {st === 'done' && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[9px] leading-none text-white">
                  ✓
                </span>
              )}
              {st === 'error' && (
                <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] leading-none text-white">
                  ✕
                </span>
              )}
              <span className="absolute bottom-0.5 right-1 rounded bg-black/50 px-1 py-px text-[9px] text-white">
                {num}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
