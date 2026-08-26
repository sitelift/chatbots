import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
  useNavigate,
  useParams,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { fetchMe, SessionProvider, useSession } from './lib/session'
import { AcceptInvitePage } from './pages/AcceptInvite'
import { ChatbotEditor } from './pages/ChatbotEditor'
import { ChatbotsPage } from './pages/Chatbots'
import { ClientsPage } from './pages/Clients'
import { LoginPage } from './pages/Login'
import { NewChatbotPage } from './pages/NewChatbot'
import { Overview } from './pages/Overview'
import { SettingsPage } from './pages/Settings'

function Shell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <SessionProvider>
      <div className="flex h-screen bg-background text-foreground">
        <Sidebar pathname={pathname} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar dark={dark} onToggleTheme={() => setDark((d) => !d)} />
          <main className="flex-1 overflow-y-auto bg-muted/20">{children}</main>
        </div>
      </div>
    </SessionProvider>
  )
}

function AgencyOnly({ children }: { children: React.ReactNode }) {
  const { user, status } = useSession()
  const navigate = useNavigate()

  useEffect(() => {
    if (status === 'ready' && user && user.role !== 'agency') {
      navigate({ to: '/' })
    }
  }, [status, user, navigate])

  if (user?.role !== 'agency') return null
  return <>{children}</>
}

function EditorRoute() {
  const params = useParams({ strict: false }) as { botId?: string }
  const search = useRouterState({ select: (s) => s.location.search }) as { as?: string }
  if (!params.botId) return null
  return <ChatbotEditor botId={params.botId} previewOwner={search.as === 'owner'} />
}

function AcceptInviteRoute() {
  const params = useParams({ strict: false }) as { token?: string }
  return <AcceptInvitePage token={params.token ?? ''} />
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

  const acceptInviteRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/accept/$token',
    component: AcceptInviteRoute,
  })

  const layoutRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: 'layout',
    beforeLoad: async () => {
      if (!guardEnabled) return
      const me = await fetchMe()
      if (!me) throw redirect({ to: '/login' })
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
    component: ChatbotsPage,
  })

  const newChatbotRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/chatbots/new',
    component: () => (
      <AgencyOnly>
        <NewChatbotPage />
      </AgencyOnly>
    ),
  })

  const chatbotEditRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/chatbots/$botId',
    validateSearch: (search: Record<string, unknown>) => ({
      as: typeof search.as === 'string' ? search.as : undefined,
    }),
    component: EditorRoute,
  })

  const clientsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/clients',
    component: () => (
      <AgencyOnly>
        <ClientsPage />
      </AgencyOnly>
    ),
  })

  const settingsRoute = createRoute({
    getParentRoute: () => layoutRoute,
    path: '/settings',
    component: () => (
      <AgencyOnly>
        <SettingsPage />
      </AgencyOnly>
    ),
  })

  return rootRoute.addChildren([
    loginRoute,
    acceptInviteRoute,
    layoutRoute.addChildren([
      indexRoute,
      chatbotsRoute,
      newChatbotRoute,
      chatbotEditRoute,
      clientsRoute,
      settingsRoute,
    ]),
  ])
}

const routeTree = buildRouteTree()

const basepath = import.meta.env.PROD ? '/admin' : '/'

const router = createRouter({ routeTree, basepath, defaultPreload: 'intent' })

export function App() {
  return <RouterProvider router={router} />
}
