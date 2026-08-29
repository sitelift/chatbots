import type { ConversationFilter, ConversationListItem, ConversationThread } from '@sitelift/shared'
import { ArrowLeft, Inbox, Mail, MessageSquare } from 'lucide-react'
import { type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { type AdminApiError, apiFetch } from '../lib/api'
import { relativeTime } from '../lib/reltime'

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function displayName(item: { visitorName: string | null; visitorEmail: string | null }): string {
  return item.visitorName || item.visitorEmail || 'Visitor'
}

export function ConversationInbox({ botId }: { botId: string }) {
  const [filter, setFilter] = useState<ConversationFilter>('all')
  const [items, setItems] = useState<ConversationListItem[] | null>(null)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [threadLoading, setThreadLoading] = useState(false)
  const [threadError, setThreadError] = useState('')
  const [mobileDetail, setMobileDetail] = useState(false)

  const loadList = useCallback(async () => {
    setError('')
    try {
      const data = await apiFetch<{ conversations: ConversationListItem[] }>(
        `/api/admin/chatbots/${botId}/conversations?filter=${filter}`,
      )
      setItems(data.conversations)
      setSelectedId((prev) => {
        if (prev && data.conversations.some((c) => c.id === prev)) return prev
        return null
      })
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to load conversations')
      setItems([])
    }
  }, [botId, filter])

  useEffect(() => {
    setItems(null)
    void loadList()
  }, [loadList])

  useEffect(() => {
    if (!selectedId) {
      setThread(null)
      setThreadError('')
      return
    }
    let cancelled = false
    setThreadLoading(true)
    setThreadError('')
    apiFetch<ConversationThread>(`/api/admin/chatbots/${botId}/conversations/${selectedId}`)
      .then((data) => {
        if (!cancelled) setThread(data)
      })
      .catch((err: Error & { api?: AdminApiError }) => {
        if (!cancelled) {
          setThread(null)
          setThreadError(err.api?.message ?? 'Failed to load thread')
        }
      })
      .finally(() => {
        if (!cancelled) setThreadLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [botId, selectedId])

  function openThread(id: string) {
    setSelectedId(id)
    setMobileDetail(true)
  }

  function closeMobileDetail() {
    setMobileDetail(false)
  }

  function onListKeyDown(e: KeyboardEvent) {
    if (!items || items.length === 0) return
    const idx = selectedId ? items.findIndex((c) => c.id === selectedId) : -1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = items[Math.min(idx + 1, items.length - 1)]
      if (next) openThread(next.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = items[Math.max(idx - 1, 0)]
      if (prev) openThread(prev.id)
    } else if (e.key === 'Enter' && idx >= 0) {
      e.preventDefault()
      setMobileDetail(true)
    }
  }

  if (items === null) {
    return (
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="skeleton h-7 w-16 rounded-md" />
          <div className="skeleton h-7 w-16 rounded-md" />
        </div>
        <div className="grid min-h-[28rem] lg:grid-cols-[minmax(0,17.5rem)_1fr]">
          <div className="space-y-0 border-b lg:border-b-0 lg:border-r">
            {['a', 'b', 'c', 'd'].map((id) => (
              <div key={id} className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
                <div className="skeleton size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-28 rounded" />
                  <div className="skeleton h-3 w-40 max-w-full rounded" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden place-items-center lg:grid">
            <div className="skeleton h-4 w-40 rounded" />
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div
          className="inline-flex rounded-lg bg-muted p-0.5"
          role="tablist"
          aria-label="Conversation filter"
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'leads', label: 'Leads' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={filter === opt.id}
              onClick={() => {
                setFilter(opt.id)
                setMobileDetail(false)
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                filter === opt.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="tnum text-xs text-muted-foreground">
          {items.length} thread{items.length === 1 ? '' : 's'}
        </p>
      </div>

      {error && (
        <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="grid min-h-[28rem] lg:grid-cols-[minmax(0,17.5rem)_1fr]">
        <div
          className={`border-b lg:border-b-0 lg:border-r ${mobileDetail ? 'hidden lg:block' : ''}`}
        >
          {items.length === 0 ? (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-6 py-12 text-center">
              <div className="grid size-11 place-items-center rounded-full bg-muted">
                <Inbox className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">
                {filter === 'leads' ? 'No leads yet' : 'No conversations yet'}
              </p>
              <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                {filter === 'leads'
                  ? 'When a visitor shares their name or email, the thread is marked as a lead here.'
                  : 'Visitor chats land here once the widget is live on a site.'}
              </p>
            </div>
          ) : (
            <div className="max-h-[28rem] overflow-y-auto lg:max-h-[32rem]">
              {items.map((item) => {
                const selected = item.id === selectedId
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => openThread(item.id)}
                    onKeyDown={onListKeyDown}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                      selected ? 'bg-muted/70' : 'hover:bg-muted/40'
                    }`}
                  >
                    <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
                      {initials(item.visitorName, item.visitorEmail)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{displayName(item)}</p>
                        {item.isLead && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                            Lead
                          </span>
                        )}
                      </div>
                      {item.lastMessage ? (
                        <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
                          {item.lastMessage}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[13px] text-muted-foreground">No messages</p>
                      )}
                    </div>
                    <p
                      className="tnum shrink-0 text-[11px] text-muted-foreground"
                      title={new Date(item.createdAt).toLocaleString()}
                    >
                      {relativeTime(new Date(item.createdAt))}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
          {items.length >= 50 && (
            <p className="tnum border-t px-4 py-2.5 text-xs text-muted-foreground">
              Showing the latest 50 threads.
            </p>
          )}
        </div>

        <div className={`${mobileDetail ? 'block' : 'hidden lg:block'}`}>
          {!selectedId ? (
            <div className="flex h-full min-h-[20rem] flex-col items-center justify-center px-6 text-center">
              <div className="grid size-11 place-items-center rounded-full bg-muted">
                <MessageSquare className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium">Select a conversation</p>
              <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                Open a thread from the list to read the full transcript.
              </p>
            </div>
          ) : threadLoading && !thread ? (
            <div className="space-y-4 p-5">
              <div className="skeleton h-5 w-40 rounded" />
              <div className="skeleton h-4 w-56 rounded" />
              <div className="mt-6 space-y-3">
                <div className="skeleton ml-auto h-12 w-2/3 rounded-2xl" />
                <div className="skeleton h-16 w-3/4 rounded-2xl" />
                <div className="skeleton ml-auto h-10 w-1/2 rounded-2xl" />
              </div>
            </div>
          ) : threadError ? (
            <div className="flex h-full min-h-[20rem] items-center justify-center px-6">
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {threadError}
              </p>
            </div>
          ) : thread ? (
            <ThreadDetail thread={thread} onBack={closeMobileDetail} />
          ) : null}
        </div>
      </div>
    </section>
  )
}

function ThreadDetail({ thread, onBack }: { thread: ConversationThread; onBack: () => void }) {
  return (
    <div className="flex h-full max-h-[32rem] flex-col">
      <div className="flex items-start gap-3 border-b px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
          {initials(thread.visitorName, thread.visitorEmail)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{displayName(thread)}</p>
            {thread.isLead && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                Lead
              </span>
            )}
          </div>
          {thread.visitorEmail && (
            <a
              href={`mailto:${thread.visitorEmail}`}
              className="mt-0.5 inline-flex items-center gap-1 truncate text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              <Mail className="size-3" />
              {thread.visitorEmail}
            </a>
          )}
          {thread.reason && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/80">{thread.reason}</p>
          )}
          <p className="tnum mt-1 text-[11px] text-muted-foreground">
            {thread.messages.length} message{thread.messages.length === 1 ? '' : 's'}
            {' · '}
            <span title={new Date(thread.createdAt).toLocaleString()}>
              {relativeTime(new Date(thread.createdAt))}
            </span>
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {thread.messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No messages in this thread.
          </p>
        ) : (
          thread.messages.map((m) => {
            const visitor = m.role === 'user'
            return (
              <div key={m.id} className={`flex ${visitor ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                    visitor
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md bg-muted text-foreground'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  <p
                    className={`tnum mt-1 text-[10px] ${
                      visitor ? 'text-primary-foreground/60' : 'text-muted-foreground'
                    }`}
                    title={new Date(m.createdAt).toLocaleString()}
                  >
                    {relativeTime(new Date(m.createdAt))}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
