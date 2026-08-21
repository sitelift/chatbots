import { useEffect, useState } from 'react'
import { type NavKey, Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { Overview } from './pages/Overview'
import { PlaygroundPage } from './pages/Playground'
import { SettingsPage } from './pages/Settings'

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [page, setPage] = useState<NavKey>('overview')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar active={page} onSelect={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar dark={dark} onToggleTheme={() => setDark((d) => !d)} />
        <main className="flex-1 overflow-y-auto">
          {page === 'overview' && <Overview />}
          {page === 'playground' && <PlaygroundPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}
