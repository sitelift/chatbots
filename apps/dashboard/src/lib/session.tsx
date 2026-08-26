import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import type { AppUser } from './auth-client'

interface SessionValue {
  user: AppUser | null
  status: 'loading' | 'ready'
}

let inflightMe: Promise<AppUser | null> | null = null

export function fetchMe(): Promise<AppUser | null> {
  inflightMe ??= fetch('/api/auth/me').then(async (res) =>
    res.ok ? ((await res.json()) as AppUser) : null,
  )
  return inflightMe
}

export function resetSessionCache(): void {
  inflightMe = null
}

const SessionContext = createContext<SessionValue>({ user: null, status: 'loading' })

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionValue>({ user: null, status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetchMe()
      .then((u) => {
        if (!cancelled) setState({ user: u, status: 'ready' })
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, status: 'ready' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  return useContext(SessionContext)
}

export function isAgency(user: AppUser | null | undefined): boolean {
  return !user || user.role === 'agency'
}
