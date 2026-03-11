const RAW_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'

export const API_BASE = RAW_API_BASE.replace(/\/+$/, '')

function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function resolveApiPath(endpoint: string): string {
  if (isAbsoluteUrl(endpoint)) return endpoint

  const normalized = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  if (normalized === '/api' || normalized.startsWith('/api/')) {
    return normalized
  }

  return `${API_BASE}${normalized}`
}

async function parseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null)
  }

  const text = await response.text().catch(() => '')
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function extractErrorMessage(status: number, body: unknown): string {
  if (typeof body === 'string' && body.trim()) return body

  if (body && typeof body === 'object') {
    const maybeError = body as { error?: unknown; message?: unknown }
    if (typeof maybeError.error === 'string') return maybeError.error
    if (typeof maybeError.message === 'string') return maybeError.message
  }

  return `HTTP ${status}`
}

export async function requestJson<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiPath(endpoint), init)
  const body = await parseBody(response)

  if (!response.ok) {
    throw new Error(extractErrorMessage(response.status, body))
  }

  return body as T
}
