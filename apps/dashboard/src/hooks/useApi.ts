import { useState, useEffect } from 'react'
import { requestJson } from '../services/http'

export function useApi<T>(endpoint: string, headers?: Record<string, string>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const headersSignature = JSON.stringify(headers || {})

  useEffect(() => {
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    requestJson<T>(endpoint, { headers, signal: controller.signal })
      .then(json => {
        setData(json)
        setLoading(false)
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setError(err.message)
        setLoading(false)
      })

    return () => {
      controller.abort()
    }
  }, [endpoint, headersSignature])

  return { data, loading, error }
}

export async function apiPost(endpoint: string, body: any, headers?: Record<string, string>) {
  return requestJson(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}
