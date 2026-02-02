import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { fetchPageMarkdown } from '../api'
import type { Page } from '../types'

interface Props {
  uploadId: string
  pageNum: number
}

export function MarkdownViewer({ uploadId, pageNum }: Props) {
  const [page, setPage] = useState<Page | null>(null)
  const [mode, setMode] = useState<'rendered' | 'split' | 'raw'>('rendered')

  useEffect(() => {
    setPage(null)
    fetchPageMarkdown(uploadId, pageNum).then(setPage)
  }, [uploadId, pageNum])

  if (!page) {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-300">Loading...</div>
  }

  if (page.state === 'pending') {
    return <div className="flex flex-1 items-center justify-center text-sm text-gray-300">Waiting to parse...</div>
  }

  if (page.state === 'error') {
    return <div className="flex flex-1 items-center justify-center text-sm text-red-400">Parse error: {page.error}</div>
  }

  return (
    <div className="flex flex-1 flex-col rounded-lg bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold">Page {pageNum}</h3>
        <div className="flex gap-1">
          {(['rendered', 'split', 'raw'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded px-3 py-1 text-[11px] font-medium transition-colors
                ${mode === m ? 'bg-blue-500 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {mode === 'split' ? (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto border-r border-gray-100 bg-gray-50 p-2">
            <img src={`/pages/${uploadId}/page_${String(pageNum).padStart(3, '0')}.png`}
              className="w-full" alt={`Page ${pageNum}`} />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="md-content prose prose-sm max-w-none overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {page.markdown || ''}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          {mode === 'rendered' ? (
            <div className="md-content prose prose-sm max-w-none overflow-x-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {page.markdown || ''}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-gray-700">
              {page.markdown}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
