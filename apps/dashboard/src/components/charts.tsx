import type { ChatbotStats } from '@sitelift/shared'
import { MessageSquare } from 'lucide-react'

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

export function ActivityCardSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm" aria-hidden="true">
      <div className="skeleton h-5 w-28 rounded" />
      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {['conversations', 'leads', 'rate', 'messages'].map((id) => (
          <div key={id} className="space-y-2.5">
            <div className="skeleton h-3 w-24 rounded" />
            <div className="skeleton h-7 w-16 rounded" />
          </div>
        ))}
      </div>
      <div className="skeleton mt-7 h-36 rounded-lg" />
    </section>
  )
}

export function ActivityCard({ stats }: { stats: ChatbotStats }) {
  const max = Math.max(1, ...stats.days.map((d) => Math.max(d.conversations, d.leads)))
  const labelStep = Math.ceil(stats.days.length / 5)
  const empty = stats.totals.conversations === 0

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-base font-medium">Last {stats.windowDays} days</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px] bg-muted-foreground/30" />
            Conversations
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[3px] bg-primary" />
            Leads
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        <Stat label="Conversations" value={stats.totals.conversations.toLocaleString()} />
        <Stat label="Leads captured" value={stats.totals.leads.toLocaleString()} />
        <Stat label="Lead rate" value={`${Math.round(stats.totals.conversionRate * 100)}%`} />
        <Stat
          label="Msgs / conversation"
          value={stats.totals.avgMessagesPerConversation.toFixed(1)}
        />
      </div>

      <div className="mt-8">
        {empty ? (
          <div className="flex h-40 flex-col items-center justify-center rounded-lg border border-dashed text-center">
            <div className="grid size-10 place-items-center rounded-full bg-muted">
              <MessageSquare className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-sm font-medium">No conversations yet</p>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              Activity shows up here once the widget is live on a site and visitors start chatting.
            </p>
          </div>
        ) : (
          <>
            <div className="flex h-36 items-end gap-[3px]">
              {stats.days.map((day) => (
                <div
                  key={day.date}
                  className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center gap-[2px]"
                >
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-left text-xs shadow-md group-hover:block">
                    <span className="font-medium">{formatDate(day.date)}</span>
                    <span className="tnum text-muted-foreground">
                      {' '}
                      · {day.conversations} conversations · {day.leads} lead
                      {day.leads === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span
                    className="w-full max-w-3 rounded-t-[3px] bg-muted-foreground/25 transition-colors duration-150 group-hover:bg-muted-foreground/45"
                    style={{
                      height: `${Math.max(day.conversations / max, day.conversations > 0 ? 0.02 : 0) * 100}%`,
                    }}
                  />
                  <span
                    className="w-full max-w-3 rounded-t-[3px] bg-primary transition-opacity duration-150 group-hover:opacity-75"
                    style={{
                      height: `${Math.max(day.leads / max, day.leads > 0 ? 0.02 : 0) * 100}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              className="mt-2.5 grid"
              style={{ gridTemplateColumns: `repeat(${stats.days.length}, minmax(0, 1fr))` }}
            >
              {stats.days.map((day, i) => {
                const show = i % labelStep === 0 || i === stats.days.length - 1
                return (
                  <span
                    key={day.date}
                    className={`tnum text-center text-[11px] text-muted-foreground ${show ? '' : 'invisible'}`}
                  >
                    {formatDate(day.date)}
                  </span>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
