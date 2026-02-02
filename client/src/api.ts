import type { Upload, Page, PageState, PageTables } from './types'

export async function fetchUploads(): Promise<Upload[]> {
  const res = await fetch('/api/uploads')
  return res.json()
}

export async function fetchUpload(id: string): Promise<Upload> {
  const res = await fetch(`/api/uploads/${id}`)
  return res.json()
}

export async function deleteUpload(id: string): Promise<void> {
  await fetch(`/api/uploads/${id}`, { method: 'DELETE' })
}

export async function uploadPdf(formData: FormData): Promise<{ id: string }> {
  const res = await fetch('/upload', { method: 'POST', body: formData })
  return res.json()
}

export async function fetchPages(id: string): Promise<string[]> {
  const res = await fetch(`/api/uploads/${id}/pages`)
  return res.json()
}

export async function fetchPageStates(id: string): Promise<PageState[]> {
  const res = await fetch(`/api/uploads/${id}/page-states`)
  return res.json()
}

export async function resumeUpload(id: string): Promise<void> {
  await fetch(`/api/uploads/${id}/resume`, { method: 'POST' })
}

export async function fetchPageMarkdown(id: string, pageNum: number): Promise<Page> {
  const res = await fetch(`/api/uploads/${id}/page/${pageNum}`)
  return res.json()
}

export async function fetchPageTables(id: string, pageNum: number): Promise<PageTables> {
  const res = await fetch(`/api/uploads/${id}/page/${pageNum}/tables`)
  return res.json()
}
