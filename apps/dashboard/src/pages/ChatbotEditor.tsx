import {
  type ChatbotAdminView,
  type ChatbotStats,
  type ChatbotTestReply,
  chatbotInputSchema,
  composeSystemPrompt,
  type LeadView,
} from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Inbox,
  LoaderCircle,
  Mail,
  Send,
  Settings as SettingsIcon,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ColorField } from '../components/ColorField'
import { ActivityCard, ActivityCardSkeleton } from '../components/charts'
import { DomainsList } from '../components/chatbot/DomainsList'
import { KnowledgeEditor } from '../components/chatbot/KnowledgeEditor'
import { ModelPicker } from '../components/chatbot/ModelPicker'
import { cleanFacts, type FormSetter, type FormState, toForm } from '../components/chatbot/state'
import { WidgetFields } from '../components/chatbot/WidgetFields'
import { WidgetSim } from '../components/chatbot/WidgetSim'
import { StatusBadge } from '../components/StatusBadge'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass } from '../lib/ui'
import { uid } from '../lib/uid'

interface EditorProps {
  botId: string
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

type Tab = 'leads' | 'knowledge' | 'test' | 'settings'

export function ChatbotEditor({ botId }: EditorProps) {
  const navigate = useNavigate()

  const [view, setView] = useState<ChatbotAdminView | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [baseline, setBaseline] = useState('')
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [armedDelete, setArmedDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [tab, setTabState] = useState<Tab>('leads')
  const tabChosenRef = useRef(false)

  const serializedForm = form ? JSON.stringify(form) : ''
  const dirty = Boolean(form) && serializedForm !== baseline

  const onBack = () => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    navigate({ to: '/chatbots' })
  }
  const onDeleted = () => navigate({ to: '/chatbots' })

  function setTab(next: Tab) {
    tabChosenRef.current = true
    setTabState(next)
  }

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ChatbotAdminView>(`/api/admin/chatbots/${botId}`)
      setView(data)
      const nextForm = toForm(data)
      setForm(nextForm)
      setBaseline(JSON.stringify(nextForm))
      if (!tabChosenRef.current) {
        setTabState(data.facts ? 'leads' : 'knowledge')
      }
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setLoadError(api?.message ?? 'Failed to load chatbot')
    }
  }, [botId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  const preview = useMemo(() => {
    if (!form) return ''
    return composeSystemPrompt(cleanFacts(form.facts))
  }, [form])

  async function save() {
    if (!form || !view) return
    setValidationError('')
    setSaveError('')

    const payload = {
      name: form.name.trim(),
      websiteUrl: form.websiteUrl.trim(),
      welcomeMessage: form.welcomeMessage.trim() || view.welcomeMessage,
      brandColor: form.brandColor,
      avatarUrl: form.avatarUrl.trim(),
      quickReplies: form.quickReplies
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 6),
      showLogo: form.showLogo,
      showName: form.showName,
      showOnlineStatus: form.showOnlineStatus,
      poweredBy: form.poweredBy,
      model: form.model.trim() || view.model,
      allowedDomains: form.domains.map((d) => d.value.trim()).filter(Boolean),
      status: form.status,
      facts: cleanFacts(form.facts),
      systemPrompt: undefined,
    }

    const parsed = chatbotInputSchema.safeParse(payload)
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }

    setSaving(true)
    try {
      const updated = await apiFetch<ChatbotAdminView>(`/api/admin/chatbots/${botId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setView(updated)
      const nextForm = toForm(updated)
      setForm(nextForm)
      setBaseline(JSON.stringify(nextForm))
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setSaveError(api?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    if (!view) return
    const nextForm = toForm(view)
    setForm(nextForm)
    setBaseline(JSON.stringify(nextForm))
    setValidationError('')
    setSaveError('')
  }

  async function remove() {
    if (!armedDelete) {
      setArmedDelete(true)
      setTimeout(() => setArmedDelete(false), 3000)
      return
    }
    setDeleting(true)
    try {
      await apiFetch(`/api/admin/chatbots/${botId}`, { method: 'DELETE' })
      onDeleted()
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setSaveError(api?.message ?? 'Failed to delete')
      setDeleting(false)
      setArmedDelete(false)
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <BackLink onClick={onBack} />
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      </div>
    )
  }

  if (!view || !form) {
    return (
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton mt-6 h-8 w-64 rounded" />
        <div className="mt-8 flex gap-3 border-b pb-3">
          {['leads', 'knowledge', 'test', 'settings'].map((id) => (
            <div key={id} className="skeleton h-5 w-20 rounded" />
          ))}
        </div>
        <div className="skeleton mt-6 h-72 w-full rounded-xl" />
      </div>
    )
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'leads', label: 'Leads', icon: <Inbox className="size-3.5" /> },
    { id: 'knowledge', label: 'Knowledge', icon: <BookOpen className="size-3.5" /> },
    { id: 'test', label: 'Test', icon: <Send className="size-3.5" /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon className="size-3.5" /> },
  ]

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <BackLink onClick={onBack} />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{view.name}</h1>
        <StatusBadge status={view.status} />
      </div>

      {savedFlash && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg duration-200 animate-in fade-in slide-in-from-bottom-2"
        >
          <Check className="size-4 text-success" />
          Saved
        </div>
      )}
      {(validationError || saveError) && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError || saveError}
        </p>
      )}

      <div
        className="mt-6 flex items-center gap-1 border-b"
        role="tablist"
        aria-label="Editor sections"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'leads' && <LeadsTab botId={botId} />}
        {tab === 'knowledge' && <KnowledgeEditor form={form} set={set} preview={preview} />}
        {tab === 'test' && <TestTab botId={botId} form={form} />}
        {tab === 'settings' && (
          <SettingsTab
            view={view}
            form={form}
            set={set}
            armedDelete={armedDelete}
            deleting={deleting}
            onDelete={() => void remove()}
          />
        )}
      </div>

      {dirty && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-card py-2 pl-5 pr-2 shadow-lg duration-200 animate-in fade-in slide-in-from-bottom-2">
            <p className="text-sm text-muted-foreground">Unsaved changes</p>
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ArrowLeft className="size-3.5" /> All chatbots
    </button>
  )
}

function LeadsTab({ botId }: { botId: string }) {
  const [leads, setLeads] = useState<LeadView[] | null>(null)
  const [stats, setStats] = useState<ChatbotStats | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [leadsResult, statsResult] = await Promise.allSettled([
      apiFetch<{ leads: LeadView[] }>(`/api/admin/chatbots/${botId}/leads`),
      apiFetch<ChatbotStats>(`/api/admin/chatbots/${botId}/stats`),
    ])
    if (leadsResult.status === 'fulfilled') {
      setLeads(leadsResult.value.leads)
    } else {
      const api = (leadsResult.reason as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to load leads')
      setLeads([])
    }
    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value)
    }
  }, [botId])

  useEffect(() => {
    void load()
  }, [load])

  if (leads === null) {
    return (
      <div className="space-y-5">
        <ActivityCardSkeleton />
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="skeleton h-5 w-36 rounded" />
          <div className="mt-1.5 skeleton h-4 w-80 max-w-full rounded" />
          <div className="mt-5 space-y-4">
            {['first', 'second', 'third'].map((id) => (
              <div key={id} className="flex items-center gap-3">
                <div className="skeleton size-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-4 w-40 rounded" />
                  <div className="skeleton h-3 w-64 max-w-full rounded" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {stats !== null && <ActivityCard stats={stats} />}

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-medium">Captured leads</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          When a visitor shares their name or email, it lands here with the last thing they said.
          These are your calls to make.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {leads.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-lg border border-dashed py-12 text-center">
            <div className="grid size-11 place-items-center rounded-full bg-muted">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium">No leads captured yet</p>
            <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
              The bot naturally asks visitors for their name and email when they seem ready to buy.
              Captured leads appear here and trigger an email notification.
            </p>
          </div>
        ) : (
          <>
            <ul className="mt-4 divide-y">
              {leads.map((lead) => (
                <li key={lead.id} className="flex items-start gap-3 py-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium uppercase text-muted-foreground">
                    {initials(lead.visitorName, lead.visitorEmail)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {lead.visitorName || lead.visitorEmail || 'Unknown visitor'}
                    </p>
                    {lead.visitorEmail && (
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="size-3" />
                        {lead.visitorEmail}
                      </p>
                    )}
                    {lead.lastMessage && (
                      <p className="mt-1 line-clamp-2 text-[13px] text-muted-foreground">
                        “{lead.lastMessage}”
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-xs text-muted-foreground">
                      {new Date(lead.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="tnum mt-1 text-xs text-muted-foreground">
                      {lead.messageCount} messages
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {leads.length >= 25 && (
              <p className="tnum mt-3 border-t pt-3 text-xs text-muted-foreground">
                Showing the latest 25 leads.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function TestTab({ botId, form }: { botId: string; form: FormState }) {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<
    Array<{ id: string; role: 'user' | 'bot'; text: string }>
  >([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function send(preset?: string) {
    const content = (preset ?? input).trim()
    if (!content || busy) return
    setInput('')
    setMessages((m) => [...m, { id: uid(), role: 'user', text: content }])
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch<ChatbotTestReply>(`/api/admin/chatbots/${botId}/test`, {
        method: 'POST',
        body: JSON.stringify({ content, facts: cleanFacts(form.facts) }),
      })
      setMessages((m) => [...m, { id: uid(), role: 'bot', text: res.reply }])
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'The bot could not answer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <WidgetSim
          form={form}
          messages={messages}
          busy={busy}
          open={open}
          onToggleOpen={() => setOpen((o) => !o)}
          input={input}
          onInput={setInput}
          onSend={(preset) => void send(preset)}
        />

        {error && (
          <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-5">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium">Live preview</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            This is exactly how a visitor sees the widget — your brand color, welcome message and
            quick replies, answering from the knowledge above. Nothing here is saved.
          </p>
          <button
            type="button"
            onClick={() => {
              setMessages([])
              setError('')
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Reset conversation
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_OPTIONS = [
  {
    value: 'active',
    label: 'Active',
    description: 'Answering visitors',
  },
  {
    value: 'paused',
    label: 'Paused',
    description: 'Stops token spend',
  },
  {
    value: 'archived',
    label: 'Archived',
    description: 'Hidden from the widget',
  },
] as const satisfies ReadonlyArray<{
  value: ChatbotAdminView['status']
  label: string
  description: string
}>

interface SettingsTabProps {
  view: ChatbotAdminView
  form: FormState
  set: FormSetter
  armedDelete: boolean
  deleting: boolean
  onDelete: () => void
}

function SettingsTab({ view, form, set, armedDelete, deleting, onDelete }: SettingsTabProps) {
  const [copied, setCopied] = useState(false)
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const statusPickerRef = useRef<HTMLDivElement>(null)
  const snippet = `<script src="${window.location.origin}/embed.js" data-chatbot-id="${view.id}"></script>`

  useEffect(() => {
    if (!statusPickerOpen) return
    function onPointerDown(e: MouseEvent) {
      if (statusPickerRef.current && !statusPickerRef.current.contains(e.target as Node)) {
        setStatusPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [statusPickerOpen])

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-medium">Basics</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Identity and widget behavior.</p>
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ed-name" className={labelClass}>
                Name
              </label>
              <input
                id="ed-name"
                type="text"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="ed-url" className={labelClass}>
                Website URL
              </label>
              <input
                id="ed-url"
                type="text"
                inputMode="url"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck="false"
                value={form.websiteUrl}
                onChange={(e) => set('websiteUrl', e.target.value)}
                placeholder="acme.com"
                className={`${inputClass} mt-1.5`}
              />
            </div>
          </div>

          <DomainsList domains={form.domains} onChange={(domains) => set('domains', domains)} />

          <div>
            <span className={labelClass}>Brand color</span>
            <div className="mt-1.5">
              <ColorField value={form.brandColor} onChange={(v) => set('brandColor', v)} />
            </div>
          </div>

          <div>
            <span className={labelClass}>Status</span>
            <div className="relative mt-1.5" ref={statusPickerRef}>
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={statusPickerOpen}
                aria-label={`Status: ${form.status}`}
                onClick={() => setStatusPickerOpen((o) => !o)}
                className="flex h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 text-left text-sm transition-[border-color,box-shadow] duration-150 hover:border-ring/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              >
                <span className="flex items-center gap-2">
                  <StatusBadge status={form.status} />
                  <span className="text-muted-foreground">
                    {STATUS_OPTIONS.find((o) => o.value === form.status)?.description}
                  </span>
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${statusPickerOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {statusPickerOpen && (
                <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
                  <ul className="divide-y">
                    {STATUS_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.value === form.status}
                          onClick={() => {
                            set('status', option.value)
                            setStatusPickerOpen(false)
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                        >
                          <StatusBadge status={option.value} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm">{option.label}</span>
                            <span className="block text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          </span>
                          {option.value === form.status && (
                            <Check className="size-4 shrink-0 text-primary" />
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <WidgetFields form={form} set={set} />

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-medium">Embed on your client's site</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Paste this before{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">&lt;/body&gt;</code> on
          any allowed domain.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {snippet}
        </pre>
        <button
          type="button"
          onClick={() => void copySnippet()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-medium">Model</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Served through the provider configured in Settings.
        </p>
        <div className="mt-3">
          <ModelPicker model={form.model} onSelect={(id) => set('model', id)} />
        </div>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-card p-5 shadow-sm">
        <h2 className="text-base font-medium text-destructive">Danger zone</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          Deleting removes the chatbot and all of its conversations immediately. This cannot be
          undone.
        </p>
        <button
          type="button"
          disabled={deleting}
          onClick={onDelete}
          aria-label={armedDelete ? 'Confirm delete' : `Delete ${view.name}`}
          className={`mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive disabled:opacity-40 ${
            armedDelete
              ? 'bg-destructive text-white'
              : 'border border-destructive/40 text-destructive hover:bg-destructive/10'
          }`}
        >
          {deleting && <LoaderCircle className="size-3.5 animate-spin" />}
          <Trash2 className="size-3.5" />
          {armedDelete ? 'Confirm delete' : 'Delete chatbot'}
        </button>
      </section>
    </div>
  )
}
