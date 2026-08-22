import { useNavigate } from '@tanstack/react-router'
import { Bot, FlaskConical, MessageSquare, Settings, TrendingUp, Users, Zap } from 'lucide-react'

const nav = [
  { path: '/', label: 'Overview', icon: TrendingUp, enabled: true },
  { path: '/chatbots', label: 'Chatbots', icon: Bot, enabled: true },
  { path: '/conversations', label: 'Conversations', icon: MessageSquare, enabled: false },
  { path: '/leads', label: 'Leads', icon: Zap, enabled: false },
  { path: '/clients', label: 'Clients', icon: Users, enabled: false },
  { path: '/playground', label: 'Playground', icon: FlaskConical, enabled: true },
  { path: '/settings', label: 'Settings', icon: Settings, enabled: true },
] as const

export function Sidebar({ pathname }: { pathname: string }) {
  const navigate = useNavigate()

  function isActive(path: string): boolean {
    if (path === '/') return pathname === '/'
    return pathname.startsWith(path)
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">SiteLift</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 py-3">
        {nav.map(({ path, label, icon: Icon, enabled }) => (
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
      <div className="mt-auto px-4 pb-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Open-source chatbots for agencies.
        </p>
      </div>
    </aside>
  )
}
