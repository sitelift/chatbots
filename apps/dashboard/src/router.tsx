import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import type { AppUser } from './lib/auth-client'
import { ChatbotEditor } from './pages/ChatbotEditor'
import { ChatbotsPage } from './pages/Chatbots'
import { LoginPage } from './pages/Login'
import { Overview } from './pages/Overview'
import { SettingsPage } from './pages/Settings'

function Shell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [user, setUser] = useState<AppUser | null>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    const cancelled = false
    fetch('/api/auth/me')
      .then(async (res) => (res.ok ? ((await res.json()) as AppUser) : null))
      .then((u) => {
        if (!cancelled) setUser(u)
      })
  }, [])

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar dark={dark} user={user} onToggleTheme={() => setDark((d) => !d)} />
        <main className="flex-1 overflow-y-auto bg-muted/20">{children}</main>
      </div>
    </div>
  )
}

function EditorRoute() {
  const params = useParams({ strict: false }) as { botId?: string }
  if (!params.botId) return null
  return <ChatbotEditor botId={params.botId} />
}

export function buildRouteTree(options?: { authGuard?: boolean }) {
  const guardEnabled = options?.authGuard ?? true

  const rootRoute = createRootRoute({
    component: () => <Outlet />,
    notFoundComponent: () => (
      <div className="grid h-screen place-items-center text-sm text-muted-foreground">
        Not found
      </div>
    ),
  })

  const loginRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'layout',
    beforeLoad: async () => {
      if (!guardEnabled) return
      const res = await fetch('/api/auth/me')
      if (!res.ok) throw redirect({ to: '/login' })
    },
    component: () => (
      <Shell>
        <Outlet />
      </Shell>
    ),
  })

  const indexRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/',
    component: Overview,
  })

  const chatbotsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/chatbots',
    validateSearch: (search: Record<string, unknown>) => ({
      new: search.new === '1' ? ('1' as const) : undefined,
    }),
    component: ChatbotsPage,
  })

  const chatbotEditRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/chatbots/$botId',
    component: EditorRoute,
  })

  const settingsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/settings',
    component: SettingsPage,
  })

  return rootRoute.addChildren([
    loginRoute,
    layoutRoute.addChildren([indexRoute, chatbotsRoute, chatbotEditRoute, settingsRoute]),
  ])
}

const routeTree = buildRouteTree()

const basepath = import.meta.env.PROD ? '/admin' : '/'

const router = createRouter({ routeTree, basepath, defaultPreload: 'intent' })

export function App() {
  return <RouterProvider router={router} />
}
