import { useCallback, useEffect, useState } from 'react'
import type { Upload } from '../types'
import { fetchUploads } from '../api'

export function useUploads() {
  const [uploads, setUploads] = useState<Upload[]>([])

  const refresh = useCallback(async () => {
    const list = await fetchUploads()
    setUploads(list)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return { uploads, refresh }
}
