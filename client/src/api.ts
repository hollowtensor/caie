import type { Upload, Page, PageState, PageTables, Schema, ExtractConfig, ScanResult, ExtractResult, TableRegion } from './types'

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

// ---------- Schemas ----------

export async function fetchSchemas(company?: string): Promise<Schema[]> {
  const url = company ? `/api/schemas?company=${encodeURIComponent(company)}` : '/api/schemas'
  const res = await fetch(url)
  return res.json()
}

export async function createSchema(data: { company: string; name: string; fields: ExtractConfig }): Promise<Schema> {
  const res = await fetch('/api/schemas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteSchema(id: string): Promise<void> {
  await fetch(`/api/schemas/${id}`, { method: 'DELETE' })
}

export async function setDefaultSchema(id: string): Promise<void> {
  await fetch(`/api/schemas/${id}/set-default`, { method: 'POST' })
}

// ---------- Extract ----------

export async function scanColumns(
  uploadId: string,
  body: { row_anchor: string; value_anchor: string },
): Promise<ScanResult> {
  const res = await fetch(`/api/uploads/${uploadId}/scan-columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function extractData(uploadId: string, config: ExtractConfig): Promise<ExtractResult> {
  const res = await fetch(`/api/uploads/${uploadId}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return res.json()
}

export async function extractCsvUrl(uploadId: string, config: ExtractConfig): Promise<string> {
  const res = await fetch(`/api/uploads/${uploadId}/extract/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function fetchTableRegions(uploadId: string, pageNum: number): Promise<TableRegion[]> {
  const res = await fetch(`/api/uploads/${uploadId}/page/${pageNum}/table-regions`)
  return res.json()
}
