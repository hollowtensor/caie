import type {
  Upload,
  Page,
  PageState,
  PageTables,
  Schema,
  ExtractConfig,
  ScanResult,
  ExtractResult,
  TableRegion,
  AuthResponse,
  MeResponse,
  WorkspaceInfo,
  WorkspaceDetails,
  ComparisonResult,
} from './types'

// Token storage keys
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const WORKSPACE_ID_KEY = 'current_workspace_id'

// Token management
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access)
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getCurrentWorkspaceId(): string | null {
  return localStorage.getItem(WORKSPACE_ID_KEY)
}

export function setCurrentWorkspaceId(id: string): void {
  localStorage.setItem(WORKSPACE_ID_KEY, id)
}

export function clearWorkspaceId(): void {
  localStorage.removeItem(WORKSPACE_ID_KEY)
}

// Refresh token lock to prevent concurrent refreshes
let refreshPromise: Promise<boolean> | null = null

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return false

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${refreshToken}`,
        },
      })

      if (!res.ok) {
        clearTokens()
        return false
      }

      const data = await res.json()
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
      return true
    } catch {
      clearTokens()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

// Authenticated fetch wrapper
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAccessToken()
  const workspaceId = getCurrentWorkspaceId()

  const headers = new Headers(options.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (workspaceId) headers.set('X-Workspace-Id', workspaceId)

  let res = await fetch(url, { ...options, headers })

  // If 401 and we have a refresh token, try refreshing
  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      const newToken = getAccessToken()
      if (newToken) headers.set('Authorization', `Bearer ${newToken}`)
      res = await fetch(url, { ...options, headers })
    }
  }

  return res
}

// ---------- Auth API ----------

export async function loginApi(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Login failed')
  }

  return res.json()
}

export async function registerApi(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Registration failed')
  }

  return res.json()
}

export async function logoutApi(): Promise<void> {
  const token = getAccessToken()
  if (token) {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  }
  clearTokens()
  clearWorkspaceId()
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await authFetch('/api/auth/me')
  if (!res.ok) {
    throw new Error('Not authenticated')
  }
  return res.json()
}

// ---------- Workspace API ----------

export async function fetchWorkspaces(): Promise<WorkspaceInfo[]> {
  const res = await authFetch('/api/workspaces')
  return res.json()
}

export async function createWorkspace(name: string): Promise<WorkspaceInfo> {
  const res = await authFetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create workspace')
  }

  return res.json()
}

export async function fetchWorkspace(id: string): Promise<WorkspaceDetails> {
  const res = await authFetch(`/api/workspaces/${id}`)
  return res.json()
}

export async function inviteToWorkspace(workspaceId: string, email: string): Promise<void> {
  const res = await authFetch(`/api/workspaces/${workspaceId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to invite user')
  }
}

export async function removeFromWorkspace(workspaceId: string, userId: string): Promise<void> {
  const res = await authFetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to remove member')
  }
}

export async function updateWorkspace(id: string, name: string): Promise<WorkspaceInfo> {
  const res = await authFetch(`/api/workspaces/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to update workspace')
  }

  return res.json()
}

export async function deleteWorkspace(id: string): Promise<void> {
  const res = await authFetch(`/api/workspaces/${id}`, {
    method: 'DELETE',
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to delete workspace')
  }
}

// ---------- Uploads API ----------

export async function fetchUploads(): Promise<Upload[]> {
  const res = await authFetch('/api/uploads')
  return res.json()
}

export async function fetchUpload(id: string): Promise<Upload> {
  const res = await authFetch(`/api/uploads/${id}`)
  return res.json()
}

export async function deleteUpload(id: string): Promise<void> {
  await authFetch(`/api/uploads/${id}`, { method: 'DELETE' })
}

export async function updateUpload(
  id: string,
  data: { company?: string; year?: number | null; month?: number | null }
): Promise<Upload> {
  const res = await authFetch(`/api/uploads/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to update upload')
  }
  return res.json()
}

export async function uploadPdf(formData: FormData): Promise<{ id: string }> {
  const token = getAccessToken()
  const workspaceId = getCurrentWorkspaceId()

  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId

  const res = await fetch('/upload', { method: 'POST', body: formData, headers })
  return res.json()
}

export async function fetchPages(id: string): Promise<string[]> {
  const res = await authFetch(`/api/uploads/${id}/pages`)
  return res.json()
}

export async function fetchPageStates(id: string): Promise<PageState[]> {
  const res = await authFetch(`/api/uploads/${id}/page-states`)
  return res.json()
}

export async function resumeUpload(id: string): Promise<void> {
  await authFetch(`/api/uploads/${id}/resume`, { method: 'POST' })
}

export async function reparseUpload(id: string): Promise<void> {
  await authFetch(`/api/uploads/${id}/reparse`, { method: 'POST' })
}

export async function fetchPageMarkdown(id: string, pageNum: number): Promise<Page> {
  const res = await authFetch(`/api/uploads/${id}/page/${pageNum}`)
  return res.json()
}

export async function fetchPageTables(id: string, pageNum: number): Promise<PageTables> {
  const res = await authFetch(`/api/uploads/${id}/page/${pageNum}/tables`)
  return res.json()
}

// ---------- Schemas ----------

export async function fetchSchemas(company?: string): Promise<Schema[]> {
  const url = company ? `/api/schemas?company=${encodeURIComponent(company)}` : '/api/schemas'
  const res = await authFetch(url)
  return res.json()
}

export async function createSchema(data: {
  company: string
  name: string
  fields: ExtractConfig
}): Promise<Schema> {
  const res = await authFetch('/api/schemas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return res.json()
}

export async function deleteSchema(id: string): Promise<void> {
  await authFetch(`/api/schemas/${id}`, { method: 'DELETE' })
}

export async function setDefaultSchema(id: string): Promise<void> {
  await authFetch(`/api/schemas/${id}/set-default`, { method: 'POST' })
}

// ---------- Extract ----------

export async function scanColumns(
  uploadId: string,
  body: { row_anchor: string; value_anchor: string }
): Promise<ScanResult> {
  const res = await authFetch(`/api/uploads/${uploadId}/scan-columns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function extractData(uploadId: string, config: ExtractConfig): Promise<ExtractResult> {
  const res = await authFetch(`/api/uploads/${uploadId}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return res.json()
}

export async function extractCsvUrl(uploadId: string, config: ExtractConfig): Promise<string> {
  const res = await authFetch(`/api/uploads/${uploadId}/extract/csv`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function fetchTableRegions(uploadId: string, pageNum: number): Promise<TableRegion[]> {
  const res = await authFetch(`/api/uploads/${uploadId}/page/${pageNum}/table-regions`)
  return res.json()
}

export async function validateTable(
  uploadId: string,
  pageNum: number,
  tableIndex: number,
  method: 'vlm' | 'llm' = 'vlm'
): Promise<{ original: string; corrected: string }> {
  const res = await authFetch(`/api/uploads/${uploadId}/page/${pageNum}/validate-table`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_index: tableIndex, method }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Validation failed')
  }
  return res.json()
}

export async function applyCorrection(
  uploadId: string,
  pageNum: number,
  tableIndex: number,
  correctedTable: string
): Promise<void> {
  const res = await authFetch(`/api/uploads/${uploadId}/page/${pageNum}/apply-correction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_index: tableIndex, corrected_table: correctedTable }),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Apply correction failed')
  }
}

// ---------- Page image URL with auth ----------

export function getPageImageUrl(uploadId: string, filename: string): string {
  const token = getAccessToken()
  const workspaceId = getCurrentWorkspaceId()
  const params = new URLSearchParams()
  if (token) params.set('token', token)
  if (workspaceId) params.set('workspace_id', workspaceId)
  return `/pages/${uploadId}/${filename}?${params.toString()}`
}

// SSE URL with auth token
export function getSSEUrl(uploadId: string): string {
  const token = getAccessToken()
  return token
    ? `/api/uploads/${uploadId}/status?token=${encodeURIComponent(token)}`
    : `/api/uploads/${uploadId}/status`
}

// ---------- Comparison API ----------

export async function fetchComparableUploads(uploadId: string): Promise<Upload[]> {
  const res = await authFetch(`/api/uploads/${uploadId}/comparable`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to fetch comparable uploads')
  }
  return res.json()
}

export async function compareExtractions(
  baseId: string,
  targetId: string,
  config?: ExtractConfig
): Promise<ComparisonResult> {
  const body: Record<string, unknown> = {
    base_upload_id: baseId,
    target_upload_id: targetId,
  }
  if (config) {
    body.config = config
  }
  const res = await authFetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Comparison failed')
  }
  return res.json()
}

export async function downloadComparisonCsv(
  baseId: string,
  targetId: string,
  config?: ExtractConfig
): Promise<string> {
  const body: Record<string, unknown> = {
    base_upload_id: baseId,
    target_upload_id: targetId,
  }
  if (config) {
    body.config = config
  }
  const res = await authFetch('/api/compare/csv', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'CSV download failed')
  }
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}
