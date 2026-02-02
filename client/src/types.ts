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

export interface SchemaField {
  key: string
  label: string
  source: 'column' | 'heading' | 'page'
  match_parent: string
  match_child: string
  melt?: boolean
}

export interface Schema {
  id: string
  company: string
  name: string
  fields: SchemaField[]
  created_at: string
}

export interface DetectedColumn {
  normalized: string
  display: string
  parent: string
  child: string
}

export interface ExtractResult {
  columns: string[]
  rows: string[][]
  page_count: number
  row_count: number
}

export interface ParentGroup {
  parent: string
  children: string[]
  is_flat: boolean
}

export interface FieldMapping {
  field: SchemaField
  mode: 'melt' | 'pin' | 'flat' | 'auto'
  matched_children: string[]
  output_columns: string[]
  output_count: number
}
