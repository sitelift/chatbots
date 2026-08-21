import { Bot, FlaskConical, MessageSquare, Settings, TrendingUp, Users, Zap } from 'lucide-react'

export type NavKey =
  | 'overview'
  | 'chatbots'
  | 'conversations'
  | 'leads'
  | 'clients'
  | 'playground'
  | 'settings'

const nav: { key: NavKey; label: string; icon: typeof Bot; enabled: boolean }[] = [
  { key: 'overview', label: 'Overview', icon: TrendingUp, enabled: true },
  { key: 'chatbots', label: 'Chatbots', icon: Bot, enabled: false },
  { key: 'conversations', label: 'Conversations', icon: MessageSquare, enabled: false },
  { key: 'leads', label: 'Leads', icon: Zap, enabled: false },
  { key: 'clients', label: 'Clients', icon: Users, enabled: false },
  { key: 'playground', label: 'Playground', icon: FlaskConical, enabled: true },
  { key: 'settings', label: 'Settings', icon: Settings, enabled: true },
]

interface SidebarProps {
  active: NavKey
  onSelect: (key: NavKey) => void
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">SiteLift</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 py-3">
        {nav.map(({ key, label, icon: Icon, enabled }) => (
          <button
            key={key}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onSelect(key)}
            aria-current={active === key ? 'page' : undefined}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
              active === key
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
