import type { Upload, Page, PageState, PageTables, Schema, SchemaField, ExtractResult, DetectedColumn, FieldMapping } from './types'

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

export async function createSchema(data: { company: string; name: string; fields: SchemaField[] }): Promise<Schema> {
  const res = await fetch('/api/schemas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function updateSchema(id: string, data: { name?: string; company?: string; fields?: SchemaField[] }): Promise<Schema> {
  const res = await fetch(`/api/schemas/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteSchema(id: string): Promise<void> {
  await fetch(`/api/schemas/${id}`, { method: 'DELETE' })
}

// ---------- Extract ----------

export async function fetchDetectedColumns(uploadId: string): Promise<{ columns: DetectedColumn[] }> {
  const res = await fetch(`/api/uploads/${uploadId}/detected-columns`)
  return res.json()
}

export async function resolveColumns(
  uploadId: string,
  body: { schema_id?: string; fields?: SchemaField[] }
): Promise<{ field_mappings: FieldMapping[]; total_output_columns: number }> {
  const res = await fetch(`/api/uploads/${uploadId}/resolve-columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function extractData(uploadId: string, body: { schema_id?: string; fields?: SchemaField[] }): Promise<ExtractResult> {
  const res = await fetch(`/api/uploads/${uploadId}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function extractCsvUrl(uploadId: string, body: { schema_id?: string; fields?: SchemaField[] }): Promise<string> {
  const res = await fetch(`/api/uploads/${uploadId}/extract/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
