export interface AdminApiError {
  code: string
  message: string
  status: number
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, { ...init, headers })
  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const err = new Error('API error') as Error & { api?: AdminApiError }
    err.api = {
      code: (body as { error?: { code?: string } }).error?.code ?? 'UNKNOWN',
      message: (body as { error?: { message?: string } }).error?.message ?? res.statusText,
      status: res.status,
    }
    throw err
  }
  return body as T
}
