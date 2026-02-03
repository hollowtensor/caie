import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { fetchUpload, resumeUpload, updateUpload, deleteUpload } from './api'
import type { Upload } from './types'
import { useAuth } from './contexts/AuthContext'
import { useUploads } from './hooks/useUploads'
import { useSSE } from './hooks/useSSE'
import { Layout } from './components/Layout'
import { UploadForm } from './components/UploadForm'
import { UploadList } from './components/UploadList'
import { PageGrid } from './components/PageGrid'
import { ProgressCard } from './components/ProgressCard'
import { MarkdownViewer } from './components/MarkdownViewer'
import { DocumentInfo } from './components/DocumentInfo'
import { ExtractPage } from './components/ExtractPage'
import { ComparisonPage } from './components/ComparisonPage'
import { SettingsPage } from './components/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { WorkspaceSettingsPage } from './pages/WorkspaceSettingsPage'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading, currentWorkspace } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (!currentWorkspace) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="text-sm text-gray-500">Setting up workspace...</div>
      </div>
    )
  }

  return <>{children}</>
}

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
  }, [status?.current_page, status?.state, status?.extract_state])

  useEffect(() => {
    const isDone = status?.state === 'done' || status?.state === 'error'
    const extractDone = status?.extract_state !== 'running'
    if (isDone && extractDone) {
      setSseId(null)
      refresh()
      if (activeId) fetchUpload(activeId).then(setActiveUpload)
    }
  }, [status?.state, status?.extract_state])

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

  const handleReparse = useCallback(async () => {
    if (!activeId) return
    setSseId(activeId)
    setActivePage(null)
    await refresh()
    const u = await fetchUpload(activeId)
    setActiveUpload(u)
  }, [activeId, refresh])

  const handleDelete = useCallback(async () => {
    if (activeId) {
      if (!confirm('Delete this upload?')) return
      await deleteUpload(activeId)
      setActiveId(null)
      setActivePage(null)
      setActiveUpload(null)
      refresh()
    }
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
      {/* Document Info */}
      {activeUpload && (
        <DocumentInfo
          upload={activeUpload}
          onUpdate={(updated) => { setActiveUpload(updated); refresh() }}
          onReparse={handleReparse}
        />
      )}
      <ProgressCard status={status} upload={activeUpload} uploadId={activeId} onResume={handleResume} onDelete={handleDelete} />
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
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/extract/:uploadId"
        element={
          <ProtectedRoute>
            <ExtractPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/compare"
        element={
          <ProtectedRoute>
            <ComparisonPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/workspace/settings"
        element={
          <ProtectedRoute>
            <WorkspaceSettingsPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
