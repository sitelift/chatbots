import { type ChatbotAdminView, chatbotInputSchema } from '@sitelift/shared'
import { Bot, LoaderCircle, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ColorField } from '../components/ColorField'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass } from '../lib/ui'

function StatusBadge({ status }: { status: ChatbotAdminView['status'] }) {
  const styles = {
    active: 'bg-success/10 text-success',
    paused: 'bg-warning/10 text-warning',
    archived: 'bg-muted text-muted-foreground',
  }[status]
  const dot = {
    active: 'bg-success',
    paused: 'bg-warning',
    archived: 'bg-muted-foreground/50',
  }[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  )
}

interface CreateFormProps {
  busy: boolean
  onCancel: () => void
  onCreated: (view: ChatbotAdminView) => void
  onError: (message: string) => void
}

export function CreateForm({ busy, onCancel, onCreated, onError }: CreateFormProps) {
  const [name, setName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [brandColor, setBrandColor] = useState('#18181b')
  const [domains, setDomains] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [validationError, setValidationError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError('')
    const payload = {
      name,
      websiteUrl,
      welcomeMessage: welcomeMessage || undefined,
      brandColor,
      allowedDomains: domains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean),
      systemPrompt: systemPrompt || undefined,
    }
    const parsed = chatbotInputSchema.safeParse(payload)
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    try {
      const view = await apiFetch<ChatbotAdminView>('/api/admin/chatbots', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })
      onCreated(view)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      onError(api?.message ?? 'Failed to create chatbot')
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 border-b bg-muted/30 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="bot-name" className={labelClass}>
            Name
          </label>
          <input
            id="bot-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme HVAC"
            className={`${inputClass} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="bot-url" className={labelClass}>
            Website URL <span className="font-normal text-muted-foreground">· optional</span>
          </label>
          <input
            id="bot-url"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://acme.com"
            className={`${inputClass} mt-1.5`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="bot-welcome" className={labelClass}>
          Welcome message <span className="font-normal text-muted-foreground">· optional</span>
        </label>
        <input
          id="bot-welcome"
          type="text"
          value={welcomeMessage}
          onChange={(e) => setWelcomeMessage(e.target.value)}
          placeholder="Hi! How can I help?"
          className={`${inputClass} mt-1.5`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
        <div>
          <span className={labelClass}>Brand color</span>
          <div className="mt-1.5">
            <ColorField value={brandColor} onChange={setBrandColor} />
          </div>
        </div>
        <div>
          <label htmlFor="bot-domains" className={labelClass}>
            Allowed domains{' '}
            <span className="font-normal text-muted-foreground">· comma separated</span>
          </label>
          <input
            id="bot-domains"
            type="text"
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="acme.com, www.acme.com"
            className={`${inputClass} mt-1.5 font-mono`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="bot-prompt" className={labelClass}>
          Business facts{' '}
          <span className="font-normal text-muted-foreground">· the system prompt</span>
        </label>
        <textarea
          id="bot-prompt"
          rows={4}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={
            'Family-owned HVAC company in Austin.\nHours: Mon–Fri 8am–6pm.\nEmergency line: (512) 555-0100.'
          }
          className={`${inputClass} mt-1.5 resize-y leading-relaxed`}
        />
      </div>

      {validationError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError}
        </p>
      )}

      <div className="flex justify-end gap-2 border-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        >
          {busy && <LoaderCircle className="size-3.5 animate-spin" />}
          Create chatbot
        </button>
      </div>
    </form>
  )
}

interface ChatbotsPageProps {
  initialCreateOpen?: boolean
  onEdit: (id: string) => void
}

export function ChatbotsPage({ initialCreateOpen, onEdit }: ChatbotsPageProps) {
  const [bots, setBots] = useState<ChatbotAdminView[] | null>(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(Boolean(initialCreateOpen))
  const [creatingBusy, setCreatingBusy] = useState(false)
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null)
  const [rowBusyId, setRowBusyId] = useState<string | null>(null)

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

  function replaceWithCreated(view: ChatbotAdminView) {
    setBots((list) => [view, ...(list ?? [])])
    setCreating(false)
    setCreatingBusy(false)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Chatbots</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        One chatbot per client website. Pause one to stop token spend instantly.
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
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Plus className="size-3.5" />
              New chatbot
            </button>
          )}
        </div>

        {creating && (
          <CreateForm
            busy={creatingBusy}
            onCancel={() => setCreating(false)}
            onError={(m) => {
              setError(m)
              setCreatingBusy(false)
            }}
            onCreated={replaceWithCreated}
          />
        )}

        {error && (
          <p className="mx-5 mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {bots === null ? (
          <div className="grid place-items-center py-16 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : bots.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted">
              <Bot className="size-5 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-[15px] font-medium">No chatbots yet</h3>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Create your first chatbot, paste one script tag on your client's site, and start
              capturing leads today.
            </p>
            {!creating && (
              <button
                type="button"
                onClick={() => setCreating(true)}
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
              <li key={bot.id} className="list-none">
                <button
                  type="button"
                  aria-label={`Edit ${bot.name}`}
                  onClick={() => onEdit(bot.id)}
                  className="flex w-full cursor-pointer flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5 text-left transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate text-sm font-medium">{bot.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {bot.websiteUrl ?? 'No website set'}
                    </p>
                  </div>
                  <StatusBadge status={bot.status} />
                  <span className="hidden font-mono text-xs text-muted-foreground md:inline">
                    {bot.model}
                  </span>
                  <span className="tnum hidden text-xs text-muted-foreground lg:inline">
                    {new Date(bot.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={rowBusyId === bot.id}
                      onClick={(e) => {
                        e.stopPropagation()
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
                      onClick={(e) => {
                        e.stopPropagation()
                        void remove(bot.id)
                      }}
                      aria-label={
                        armedDeleteId === bot.id
                          ? `Confirm delete ${bot.name}`
                          : `Delete ${bot.name}`
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
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
