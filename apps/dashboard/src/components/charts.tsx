import type { ChatbotStats, ChatbotStatsDay } from '@sitelift/shared'
import { MessageSquare } from 'lucide-react'
import { useState } from 'react'

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="tnum mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}

export function ActivityCardSkeleton() {
  return (
    <section className="rounded-xl border bg-card p-5" aria-hidden="true">
      <div className="skeleton h-5 w-28 rounded" />
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        {['conversations', 'leads', 'rate', 'messages'].map((id) => (
          <div key={id} className="space-y-2">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-7 w-14 rounded" />
          </div>
        ))}
      </div>
      <div className="skeleton mt-6 h-44 rounded-lg" />
      <div className="skeleton mt-3 h-3 w-full rounded" />
    </section>
  )
}

const TICK_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]

function axisScale(dataMax: number): { max: number; ticks: number[] } {
  const step = TICK_STEPS.find((s) => dataMax / s <= 3) ?? 10 ** Math.ceil(Math.log10(dataMax / 3))
  const max = (Math.floor(dataMax / step) + 1) * step
  const ticks: number[] = []
  for (let v = 0; v <= max; v += step) ticks.push(v)
  return { max, ticks }
}

function Bar({ value, max, tone }: { value: number; max: number; tone: 'conv' | 'lead' }) {
  const empty = value === 0
  return (
    <div
      className={[
        'w-1/3 min-w-[3px] max-w-[10px] rounded-t-[2px] transition-[height] duration-200',
        empty ? 'bg-border' : tone === 'conv' ? 'bg-chart-1' : 'bg-chart-2',
      ].join(' ')}
      style={{ height: empty ? 2 : `max(3px, ${(value / max) * 100}%)` }}
    />
  )
}

function Tooltip({ day, left }: { day: ChatbotStatsDay; left: number }) {
  return (
    <div
      className="pointer-events-none absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
      style={{ left: `min(max(${left}%, 80px), calc(100% - 80px))` }}
    >
      <p className="font-medium">{formatDate(day.date)}</p>
      <p className="tnum mt-0.5 text-muted-foreground">
        <span className="font-medium text-chart-1">{day.conversations}</span> conversation
        {day.conversations === 1 ? '' : 's'}
        {' · '}
        <span className="font-medium text-chart-2">{day.leads}</span> lead
        {day.leads === 1 ? '' : 's'}
      </p>
    </div>
  )
}

export function ActivityCard({ stats }: { stats: ChatbotStats }) {
  const [hover, setHover] = useState<number | null>(null)
  const days = stats.days
  const empty = stats.totals.conversations === 0
  const dataMax = Math.max(1, ...days.map((d) => Math.max(d.conversations, d.leads)))
  const { max, ticks } = axisScale(dataMax)
  const labelStep = Math.max(1, Math.ceil(days.length / 6))
  const hovered = hover !== null ? days[hover] : undefined

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <h2 className="text-base font-medium">Last {stats.windowDays} days</h2>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-chart-1" />
            Conversations
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-chart-2" />
            Leads
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        <Stat label="Conversations" value={stats.totals.conversations.toLocaleString()} />
        <Stat label="Leads captured" value={stats.totals.leads.toLocaleString()} />
        <Stat label="Lead rate" value={`${Math.round(stats.totals.conversionRate * 100)}%`} />
        <Stat
          label="Msgs / conversation"
          value={stats.totals.avgMessagesPerConversation.toFixed(1)}
        />
      </div>

      {empty ? (
        <div className="mt-6 flex h-44 flex-col items-center justify-center rounded-lg border border-dashed text-center">
          <div className="grid size-10 place-items-center rounded-full bg-muted">
            <MessageSquare className="size-4 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No conversations yet</p>
          <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            Activity shows up here once the widget is live on a site and visitors start chatting.
          </p>
        </div>
      ) : (
        <div className="mt-6 pl-8">
          <div className="relative h-44">
            {ticks.map((tick) => (
              <div
                key={tick}
                className={`absolute inset-x-0 h-px ${tick === 0 ? 'bg-border' : 'bg-border/50'}`}
                style={{ bottom: `${(tick / max) * 100}%` }}
              >
                <span className="tnum absolute right-full -translate-y-1/2 pr-2 text-[10px] leading-none text-muted-foreground">
                  {tick}
                </span>
              </div>
            ))}

            {hover !== null && hovered && (
              <Tooltip day={hovered} left={((hover + 0.5) / days.length) * 100} />
            )}

            <div
              className="absolute inset-0 flex items-end"
              role="img"
              aria-label={`Daily conversations and leads over the last ${stats.windowDays} days`}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const ratio = (e.clientX - rect.left) / rect.width
                const i = Math.floor(ratio * days.length)
                setHover(Math.min(days.length - 1, Math.max(0, i)))
              }}
            >
              {days.map((day, i) => (
                <div key={day.date} className="relative h-full flex-1 px-px">
                  {hover === i && (
                    <div className="absolute inset-x-0 inset-y-[-4px] rounded bg-muted/70" />
                  )}
                  <div className="relative flex h-full items-end justify-center gap-[2px]">
                    <Bar value={day.conversations} max={max} tone="conv" />
                    <Bar value={day.leads} max={max} tone="lead" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 flex">
            {days.map((day, i) => (
              <div key={day.date} className="min-w-0 flex-1 text-center">
                {i % labelStep === 0 || i === days.length - 1 ? (
                  <span className="tnum whitespace-nowrap text-[10px] text-muted-foreground">
                    {formatDate(day.date)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
