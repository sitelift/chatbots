import { Bot, MessageSquare, Settings, TrendingUp, Users, Zap } from 'lucide-react'

const nav = [
  { label: 'Overview', icon: TrendingUp, active: true },
  { label: 'Chatbots', icon: Bot, active: false },
  { label: 'Conversations', icon: MessageSquare, active: false },
  { label: 'Leads', icon: Zap, active: false },
  { label: 'Clients', icon: Users, active: false },
  { label: 'Settings', icon: Settings, active: false },
]

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="flex h-14 items-center gap-2.5 px-5">
        <div className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">SiteLift</span>
      </div>
      <nav className="flex flex-col gap-0.5 px-3 py-3">
        {nav.map(({ label, icon: Icon, active }) => (
          <button
            key={label}
            type="button"
            aria-current={active ? 'page' : undefined}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors duration-150 ${
              active
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
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
