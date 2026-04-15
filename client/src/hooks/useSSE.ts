import { useEffect, useRef, useState } from 'react'
import type { StatusUpdate } from '../types'
import { getSSEUrl } from '../api'

export function useSSE(uploadId: string | null) {
  const [status, setStatus] = useState<StatusUpdate | null>(null)
  const srcRef = useRef<EventSource | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (srcRef.current) {
      srcRef.current.close()
      srcRef.current = null
    }
    if (retryRef.current) {
      clearTimeout(retryRef.current)
      retryRef.current = null
    }
    setStatus(null)
    if (!uploadId) return

    let closed = false

    function connect() {
      if (closed) return
      const src = new EventSource(getSSEUrl(uploadId!))
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

      src.onerror = () => {
        src.close()
        // Reconnect after 2s unless the component unmounted
        if (!closed) {
          retryRef.current = setTimeout(connect, 2000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      if (srcRef.current) srcRef.current.close()
      if (retryRef.current) clearTimeout(retryRef.current)
    }
  }, [uploadId])

  return status
}
