import type { ChatbotAdminView } from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import { Bot, LoaderCircle, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { StatusBadge } from '../components/StatusBadge'
import { type AdminApiError, apiFetch } from '../lib/api'
import { useSession } from '../lib/session'

export function ChatbotsPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const agencyControls = !user || user.role === 'agency'
  const [bots, setBots] = useState<ChatbotAdminView[] | null>(null)
  const [error, setError] = useState('')
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await apiFetch<{ chatbots: ChatbotAdminView[] }>('/api/admin/chatbots')
      setBots(data.chatbots)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to load chatbots')
      setBots([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleStatus(bot: ChatbotAdminView) {
    setRowBusyId(bot.id)
    setError('')
    try {
      const next = bot.status === 'active' ? ('paused' as const) : ('active' as const)
      const updated = await apiFetch<ChatbotAdminView>(`/api/admin/chatbots/${bot.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: next }),
      })
      setBots((list) => list?.map((b) => (b.id === updated.id ? updated : b)) ?? list)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to update')
    } finally {
      setRowBusyId(null)
      setArmedDeleteId(null)
    }
  }

  async function remove(id: string) {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id)
      setTimeout(() => setArmedDeleteId((current) => (current === id ? null : current)), 3000)
      return
    }
    setRowBusyId(id)
    setError('')
    try {
      await apiFetch(`/api/admin/chatbots/${id}`, { method: 'DELETE' })
      setBots((list) => list?.filter((b) => b.id !== id) ?? list)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to delete')
    } finally {
      setRowBusyId(null)
      setArmedDeleteId(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Chatbots</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {agencyControls
          ? 'One chatbot per client website. Pause one to stop token spend instantly.'
          : 'What your chatbot knows, how it looks on your site, and the leads it captures.'}
      </p>

      <div className="mt-8 overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bot className="size-4 text-muted-foreground" />
            <h2 className="text-base font-medium">Your chatbots</h2>
            {bots && bots.length > 0 && (
              <span className="tnum rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {bots.length}
              </span>
            )}
          </div>
          {agencyControls && (
            <button
              type="button"
              onClick={() => navigate({ to: '/chatbots/new' })}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-3.5" />
              New chatbot
            </button>
          )}
        </div>

        {error && (
          <p className="mx-5 mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {bots === null ? (
          <div className="space-y-3 px-5 py-5">
            {['acme', 'bella', 'nova'].map((id) => (
              <div key={id} className="flex items-center gap-6">
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-44 rounded" />
                  <div className="skeleton h-3 w-32 rounded" />
                </div>
                <div className="skeleton h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : bots.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted">
              <Bot className="size-5 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-[15px] font-medium">No chatbots yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {agencyControls
                ? "Create your first chatbot, paste one script tag on your client's site, and start capturing leads today."
                : 'Your agency has not connected a chatbot to your account yet.'}
            </p>
            {agencyControls && (
              <button
                type="button"
                onClick={() => navigate({ to: '/chatbots/new' })}
                className="mt-5 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Plus className="size-3.5" />
                Create chatbot
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y">
            {bots.map((bot) => (
              <li
                key={bot.id}
                className="flex w-full cursor-pointer flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 transition-colors duration-150 hover:bg-muted/40"
              >
                <button
                  type="button"
                  aria-label={`Edit ${bot.name}`}
                  onClick={() => {
                    navigate({
                      to: '/chatbots/$botId',
                      params: { botId: bot.id },
                    })
                  }}
                  className="flex min-w-0 flex-1 basis-48 flex-wrap items-center gap-x-6 gap-y-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-sm font-medium">{bot.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {bot.websiteUrl ?? 'No website set'}
                    </span>
                  </span>
                  <StatusBadge status={bot.status} />
                  {agencyControls && (
                    <>
                      <span className="hidden font-mono text-xs text-muted-foreground md:inline">
                        {bot.model ?? 'Default'}
                      </span>
                      <span className="tnum hidden text-xs text-muted-foreground lg:inline">
                        {new Date(bot.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </>
                  )}
                </button>
                {agencyControls && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={rowBusyId === bot.id}
                      onClick={() => {
                        void toggleStatus(bot)
                      }}
                      aria-label={
                        bot.status === 'active' ? `Pause ${bot.name}` : `Activate ${bot.name}`
                      }
                      title={bot.status === 'active' ? 'Pause — stops token spend' : 'Activate'}
                      className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                    >
                      {rowBusyId === bot.id ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : bot.status === 'active' ? (
                        <Pause className="size-3.5" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusyId === bot.id}
                      onClick={() => {
                        void remove(bot.id)
                      }}
                      aria-label={
                        armedDeleteId === bot.id ? `Confirm delete ${bot.name}` : `Delete ${bot.name}`
                      }
                      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 ${
                        armedDeleteId === bot.id
                          ? 'bg-destructive text-white hover:opacity-90'
                          : 'text-muted-foreground hover:bg-muted hover:text-destructive'
                      }`}
                    >
                      <Trash2 className="size-3.5" />
                      {armedDeleteId === bot.id ? 'Confirm?' : 'Delete'}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
