import { useNavigate } from '@tanstack/react-router'
import { Bot, MessageSquare, Settings, TrendingUp, Users, Zap } from 'lucide-react'
import { useSession } from '../lib/session'
import { Logo } from './Logo'

const nav = [
  {
    path: '/',
    label: 'Overview',
    icon: TrendingUp,
    enabled: true,
    roles: ['agency', 'client'] as const,
  },
  {
    path: '/chatbots',
    label: 'Chatbots',
    icon: Bot,
    enabled: true,
    roles: ['agency', 'client'] as const,
  },
  {
    path: '/conversations',
    label: 'Conversations',
    icon: MessageSquare,
    enabled: false,
    roles: ['agency', 'client'] as const,
  },
  {
    path: '/leads',
    label: 'Leads',
    icon: Zap,
    enabled: false,
    roles: ['agency', 'client'] as const,
  },
  { path: '/clients', label: 'Clients', icon: Users, enabled: true, roles: ['agency'] as const },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    enabled: true,
    roles: ['agency'] as const,
  },
] as const

export function Sidebar({ pathname }: { pathname: string }) {
  const navigate = useNavigate()
  const { user } = useSession()
  const role = user?.role ?? 'agency'

  function isActive(path: string): boolean {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center px-5">
        <Logo className="h-[22px] w-auto text-foreground" />
      </div>
      <nav className="flex flex-col gap-0.5 px-3 py-3">
        {nav
          .filter((item) => (item.roles as readonly string[]).includes(role))
          .map(({ path, label, icon: Icon, enabled }) => (
            <button
              key={label}
              type="button"
              disabled={!enabled}
              onClick={() => enabled && navigate({ to: path })}
              aria-current={isActive(path) ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
                isActive(path)
                  ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                  : enabled
                    ? 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                    : 'cursor-default text-muted-foreground/50'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
      </nav>
      {role === 'agency' && (
        <div className="mt-auto px-4 pb-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Open-source chatbots for agencies.
          </p>
        </div>
      )}
    </aside>
  )
}
