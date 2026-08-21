const TOKEN_STORAGE_KEY = 'sitelift_admin_token'

export function getAdminToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? ''
}

export function setAdminToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export interface AdminApiError {
  code: string
  message: string
  status: number
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getAdminToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
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
