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
