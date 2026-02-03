import { useEffect, useRef, useState } from 'react'
import type { StatusUpdate } from '../types'
import { getSSEUrl } from '../api'

export function useSSE(uploadId: string | null) {
  const [status, setStatus] = useState<StatusUpdate | null>(null)
  const srcRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (srcRef.current) {
      srcRef.current.close()
      srcRef.current = null
    }
    setStatus(null)
    if (!uploadId) return

    const src = new EventSource(getSSEUrl(uploadId))
    srcRef.current = src

    src.onmessage = (e) => {
      const data: StatusUpdate = JSON.parse(e.data)
      setStatus(data)
      if (data.state === 'error') {
        src.close()
      } else if (data.state === 'done' && data.extract_state !== 'running') {
        src.close()
      }
    }
    src.onerror = () => src.close()

    return () => src.close()
  }, [uploadId])

  return status
}
