import type { ChatbotAdminView } from '@sitelift/shared'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type NavKey, Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { type AppUser, authClient } from './lib/auth-client'
import { ChatbotEditor } from './pages/ChatbotEditor'
import { ChatbotsPage } from './pages/Chatbots'
import { LoginPage } from './pages/Login'
import { Overview } from './pages/Overview'
import { PlaygroundPage } from './pages/Playground'
import { SettingsPage } from './pages/Settings'

type Page = NavKey | 'chatbot-detail'

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [page, setPage] = useState<Page>('overview')
  const [editingBotId, setEditingBotId] = useState<string | null>(null)
  const [playgroundBotId, setPlaygroundBotId] = useState('ch_demo')
  const [createIntent, setCreateIntent] = useState(false)
  const [chatbotListKey, setChatbotListKey] = useState(0)
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

  function navigate(next: Page) {
    setEditingBotId(next === 'chatbot-detail' ? editingBotId : null)
    setPage(next)
  }

  function openEditor(id: string) {
    setEditingBotId(id)
    setPage('chatbot-detail')
  }

  function openNewChatbot() {
    setEditingBotId(null)
    setCreateIntent(true)
    setChatbotListKey((k) => k + 1)
    setPage('chatbots')
  }

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
      <Sidebar
        active={page === 'chatbot-detail' ? 'chatbots' : page}
        onSelect={(key) => navigate(key)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar dark={dark} user={user} onToggleTheme={() => setDark((d) => !d)} />
        <main className="flex-1 overflow-y-auto">
          {page === 'overview' && (
            <Overview onNewChatbot={openNewChatbot} onViewChatbots={() => navigate('chatbots')} />
          )}
          {page === 'chatbots' && (
            <ChatbotsPage
              key={chatbotListKey}
              initialCreateOpen={createIntent}
              onEdit={openEditor}
            />
          )}
          {page === 'chatbot-detail' && editingBotId && (
            <ChatbotEditor
              botId={editingBotId}
              onBack={() => navigate('chatbots')}
              onSaved={(updated: ChatbotAdminView) => {
                setEditingBotId(updated.id)
              }}
              onDeleted={() => navigate('chatbots')}
              onPlayground={(id) => {
                setPlaygroundBotId(id)
                setPage('playground')
              }}
            />
          )}
          {page === 'playground' && (
            <PlaygroundPage botId={playgroundBotId} onBotChange={setPlaygroundBotId} />
          )}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  )
}
