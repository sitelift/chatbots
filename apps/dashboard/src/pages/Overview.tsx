import { type ChatbotAdminView, chatbotStatusLabels } from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, Bot, MessageSquare, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api'

export function Overview() {
  const navigate = useNavigate({ from: '/' })
  const [bots, setBots] = useState<ChatbotAdminView[] | null>(null)

  useEffect(() => {
    let cancelled = false
    apiFetch<{ chatbots: ChatbotAdminView[] }>('/api/admin/chatbots')
      .then((data) => {
        if (!cancelled) setBots(data.chatbots)
      })
      .catch(() => {
        if (!cancelled) setBots([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const total = bots?.length ?? 0
  const active = bots?.filter((b) => b.status === 'active').length ?? 0

  const stats = [
    {
      label: 'Chatbots',
      value: bots === null ? '…' : String(total),
      hint:
        total === 0
          ? 'Create your first chatbot to get started'
          : `${active} active · ${total - active} paused or archived`,
    },
    {
      label: 'Conversations',
      value: '0',
      hint: 'Visitor threads appear here once your widget is live',
    },
    {
      label: 'Leads captured',
      value: '0',
      hint: 'Name + email captured by the AI land in this count',
    },
  ]

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">A live view of every chatbot you run.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, hint }) => (
          <div
            key={label}
            className="rounded-lg border bg-card p-5 transition-colors duration-150 hover:bg-muted/40"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="tnum mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bot className="size-4 text-muted-foreground" />
            <h2 className="text-base font-medium">Recent chatbots</h2>
          </div>
          <button
            type="button"
            onClick={() => navigate({ to: '/chatbots' })}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            View all
            <ArrowRight className="size-3.5" />
          </button>
        </div>

        {bots !== null && bots.length > 0 ? (
          <ul className="divide-y">
            {bots.slice(0, 5).map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/chatbots' })}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      b.status === 'active'
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {chatbotStatusLabels[b.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted">
              <MessageSquare className="size-5 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-[15px] font-medium">
              {bots === null ? 'Loading…' : 'No chatbots yet'}
            </h3>
            {bots !== null && (
              <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                Create your first chatbot, paste one script tag on your client's site, and start
                capturing leads today.
              </p>
            )}
            {bots !== null && (
              <button
                type="button"
                onClick={() => navigate({ to: '/chatbots/new' })}
                className="mt-5 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Zap className="size-3.5" />
                Create chatbot
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
