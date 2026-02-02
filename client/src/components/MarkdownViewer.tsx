import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { fetchPageMarkdown, fetchPageTables } from '../api'
import type { Page, PageTables } from '../types'

interface Props {
  uploadId: string
  pageNum: number
}

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function MarkdownViewer({ uploadId, pageNum }: Props) {
  const [page, setPage] = useState<Page | null>(null)
  const [mode, setMode] = useState<'rendered' | 'split' | 'raw' | 'tables'>('rendered')
  const [tables, setTables] = useState<PageTables | null>(null)

  useEffect(() => {
    setPage(null)
    setTables(null)
    fetchPageMarkdown(uploadId, pageNum).then(setPage)
  }, [uploadId, pageNum])

  useEffect(() => {
    if (mode === 'tables' && !tables) {
      fetchPageTables(uploadId, pageNum).then(setTables)
    }
  }, [mode, tables, uploadId, pageNum])

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
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['rendered', 'split', 'raw', 'tables'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`rounded px-3 py-1 text-[11px] font-medium transition-colors
                  ${mode === m ? 'bg-blue-500 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => downloadText(page.markdown || '', `page_${pageNum}.md`)}
            className="rounded border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
            title="Download page markdown">
            Download
          </button>
        </div>
      </div>
      {mode === 'tables' ? (
        <div className="flex-1 overflow-y-auto p-4">
          {!tables ? (
            <div className="text-sm text-gray-300">Loading tables...</div>
          ) : tables.tables.length === 0 ? (
            <div className="text-sm text-gray-400">No tables found on this page</div>
          ) : (
            <div className="space-y-6">
              {tables.headings.length > 0 && (
                <div className="text-xs text-gray-400">
                  {tables.headings.map((h, i) => <div key={i}>{h}</div>)}
                </div>
              )}
              {tables.tables.map((t) => (
                <div key={t.index}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-600">Table {t.index + 1}</span>
                    <a href={`/api/uploads/${uploadId}/page/${pageNum}/tables/csv?table=${t.index}`}
                      className="rounded border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-50">
                      CSV
                    </a>
                  </div>
                  <div className="md-content overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          {t.display_columns.map((col, ci) => <th key={ci}>{col}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => <td key={ci}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : mode === 'split' ? (
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
