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
}

export interface Schema {
  id: string
  company: string
  name: string
  fields: ExtractConfig
  is_default: boolean
  created_at: string
}

export interface ScanResult {
  tables_found: number
  pages_found: number
  value_columns: string[]
  extra_columns: string[]
}

export interface CellFlag {
  row: number
  col: number
  reason: string
}

export interface ExtractResult {
  columns: string[]
  rows: string[][]
  flags: CellFlag[]
  flagged_count: number
  page_count: number
  row_count: number
}
