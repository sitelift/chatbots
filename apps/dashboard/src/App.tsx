import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type NavKey, Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { type AppUser, authClient } from './lib/auth-client'
import { ChatbotsPage } from './pages/Chatbots'
import { LoginPage } from './pages/Login'
import { Overview } from './pages/Overview'
import { PlaygroundPage } from './pages/Playground'
import { SettingsPage } from './pages/Settings'

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [page, setPage] = useState<NavKey>('overview')
  const [user, setUser] = useState<AppUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    authClient
      .getSession()
      .then(async ({ data }) => {
        if (!data?.user) return
        const res = await fetch('/api/auth/me')
        if (res.ok) setUser((await res.json()) as AppUser)
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar active={page} onSelect={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar dark={dark} user={user} onToggleTheme={() => setDark((d) => !d)} />
        <main className="flex-1 overflow-y-auto">
          {page === 'overview' && <Overview />}
          {page === 'chatbots' && <ChatbotsPage />}
          {page === 'playground' && <PlaygroundPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}
