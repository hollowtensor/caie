export interface Upload {
  id: string
  filename: string
  company: string
  year: number | null
  month: number | null
  state: string
  message: string
  total_pages: number
  current_page: number
  extract_state: string | null
  extract_csv: string | null
  created_at: string
  workspace_id?: string
  user_id?: string
}

export interface Page {
  upload_id: string
  page_num: number
  markdown: string
  state: string
  error: string | null
}

export interface PageState {
  page_num: number
  state: string
}

export interface StatusUpdate {
  state: string
  message: string
  current_page: number
  total_pages: number
  extract_state: string | null
}

export interface ColumnInfo {
  parent: string
  child: string
  display: string
  normalized: string
}

export interface PageTable {
  index: number
  columns: string[]
  display_columns: string[]
  column_info: ColumnInfo[]
  rows: string[][]
}

export interface PageTables {
  page_num: number
  headings: string[]
  tables: PageTable[]
}

export interface ExtractConfig {
  row_anchor: string
  value_anchor: string
  extras: string[]
  include_page: boolean
  include_heading: boolean
  fill_down_value?: boolean
}

export interface Schema {
  id: string
  company: string
  name: string
  fields: ExtractConfig
  is_default: boolean
  created_at: string
  workspace_id?: string
}

export interface ScanResult {
  tables_found: number
  pages_found: number
  row_columns: string[]
  value_columns: string[]
  extra_columns: string[]
}

export interface CellFlag {
  row: number
  col: number
  reason: string
}

export interface TableRegion {
  index: number
  top: number
  height: number
}

export interface ExtractResult {
  columns: string[]
  rows: string[][]
  flags: CellFlag[]
  flagged_count: number
  page_count: number
  row_count: number
  row_table_indices: number[]
}

// Auth types
export interface User {
  id: string
  email: string
  name: string
  created_at?: string
}

export interface WorkspaceInfo {
  id: string
  name: string
  role: string
}

export interface WorkspaceMember {
  user_id: string
  email: string
  name: string
  role: string
  joined_at: string
}

export interface WorkspaceDetails extends WorkspaceInfo {
  owner_id: string
  members: WorkspaceMember[]
  created_at: string
}

export interface AuthResponse {
  user: User
  workspace?: WorkspaceInfo
  workspaces?: WorkspaceInfo[]
  access_token: string
  refresh_token: string
}

export interface MeResponse {
  user: User
  workspaces: WorkspaceInfo[]
}

// Comparison types
export interface ComparisonSummary {
  total_base: number
  total_target: number
  matched: number
  added: number
  removed: number
  price_increased: number
  price_decreased: number
  price_unavailable: number
  price_available: number
  unchanged: number
}

export interface ComparisonUpload {
  id: string
  filename: string
  company: string
  year: number | null
  month: number | null
}

export interface ComparisonConfig {
  row_anchor: string
  value_anchor: string
}

export interface ComparisonDebug {
  base_sample_refs: string[]
  target_sample_refs: string[]
  row_anchor: string
  value_anchor: string
}

export interface ComparisonResult {
  base_upload: ComparisonUpload
  target_upload: ComparisonUpload
  config: ComparisonConfig
  debug: ComparisonDebug
  summary: ComparisonSummary
  columns: string[]
  rows: string[][] // [status, ref, desc, base_price, target_price, change, pct_change]
}
