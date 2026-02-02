import { useCallback, useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { fetchUpload, resumeUpload } from './api'
import type { Upload } from './types'
import { useUploads } from './hooks/useUploads'
import { useSSE } from './hooks/useSSE'
import { Layout } from './components/Layout'
import { UploadForm } from './components/UploadForm'
import { UploadList } from './components/UploadList'
import { PageGrid } from './components/PageGrid'
import { ProgressCard } from './components/ProgressCard'
import { MarkdownViewer } from './components/MarkdownViewer'
import { ExtractPage } from './components/ExtractPage'

function HomePage() {
  const { uploads, refresh } = useUploads()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activePage, setActivePage] = useState<number | null>(null)
  const [activeUpload, setActiveUpload] = useState<Upload | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [sseId, setSseId] = useState<string | null>(null)

  const status = useSSE(sseId)

  useEffect(() => {
    if (status) setRefreshKey((k) => k + 1)
  }, [status?.current_page, status?.state])

  useEffect(() => {
    if (status?.state === 'done' || status?.state === 'error') {
      setSseId(null)
      refresh()
      if (activeId) fetchUpload(activeId).then(setActiveUpload)
    }
  }, [status?.state])

  const handleSelect = useCallback(async (id: string) => {
    setActiveId(id)
    setActivePage(null)
    setSseId(null)
    const u = await fetchUpload(id)
    setActiveUpload(u)
  }, [])

  const handleUploaded = useCallback(async (id: string) => {
    await refresh()
    setActiveId(id)
    setActivePage(null)
    setSseId(id)
    const u = await fetchUpload(id)
    setActiveUpload(u)
  }, [refresh])

  const handleResume = useCallback(async () => {
    if (!activeId) return
    await resumeUpload(activeId)
    setSseId(activeId)
    const u = await fetchUpload(activeId)
    setActiveUpload(u)
  }, [activeId])

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
      <ProgressCard status={status} upload={activeUpload} uploadId={activeId} onResume={handleResume} />
      {activePage && activeId && (
        <MarkdownViewer uploadId={activeId} pageNum={activePage} />
      )}
    </div>
  )

  return <Layout left={left} right={right} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/extract/:uploadId" element={<ExtractPage />} />
    </Routes>
  )
}
