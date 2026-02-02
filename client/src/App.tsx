import { useCallback, useEffect, useState } from 'react'
import { fetchUpload } from './api'
import type { Upload } from './types'
import { useUploads } from './hooks/useUploads'
import { useSSE } from './hooks/useSSE'
import { Layout } from './components/Layout'
import { UploadForm } from './components/UploadForm'
import { UploadList } from './components/UploadList'
import { PageGrid } from './components/PageGrid'
import { ProgressCard } from './components/ProgressCard'
import { MarkdownViewer } from './components/MarkdownViewer'

export default function App() {
  const { uploads, refresh } = useUploads()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<number | null>(null)
  const [activeUpload, setActiveUpload] = useState<Upload | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Only listen to SSE for in-progress uploads
  const needsSSE = activeUpload && !['done', 'error'].includes(activeUpload.state)
  const status = useSSE(needsSSE ? activeId : null)

  // Bump refreshKey when SSE updates (so PageGrid re-fetches states)
  useEffect(() => {
    if (status) setRefreshKey((k) => k + 1)
  }, [status?.current_page, status?.state])

  // When SSE reports done/error, refresh upload list and re-fetch the active upload
  useEffect(() => {
    if (status?.state === 'done' || status?.state === 'error') {
      refresh()
      if (activeId) fetchUpload(activeId).then(setActiveUpload)
    }
  }, [status?.state])

  const handleSelect = useCallback(async (id: string) => {
    setActiveId(id)
    setActivePage(null)
    const u = await fetchUpload(id)
    setActiveUpload(u)
  }, [])

  const handleUploaded = useCallback(async (id: string) => {
    await refresh()
    handleSelect(id)
  }, [refresh, handleSelect])

  const handleDelete = useCallback(() => {
    if (activeId) {
      setActiveId(null)
      setActivePage(null)
      setActiveUpload(null)
    }
    refresh()
  }, [activeId, refresh])

  const left = (
    <>
      <UploadForm serverUrl="" onUploaded={handleUploaded} />
      <UploadList uploads={uploads} activeId={activeId} onSelect={handleSelect} onRefresh={handleDelete} />
      <PageGrid uploadId={activeId} activePage={activePage} onSelectPage={setActivePage} refreshKey={refreshKey} />
    </>
  )

  const right = !activeId ? (
    <div className="flex flex-1 items-center justify-center text-sm text-gray-300">
      Select or upload a PDF to begin
    </div>
  ) : (
    <div className="flex flex-1 flex-col gap-3">
      <ProgressCard status={status} upload={activeUpload} />
      {activePage && activeId && (
        <MarkdownViewer uploadId={activeId} pageNum={activePage} />
      )}
    </div>
  )

  return <Layout left={left} right={right} />
}
