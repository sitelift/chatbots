import {
  type BusinessFacts,
  type ChatbotAdminView,
  type ChatbotStats,
  type ChatbotTestReply,
  chatbotInputSchema,
  composeSystemPrompt,
  type FaqPair,
  type ImportResult,
  type LeadView,
  type ModelOption,
} from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Image as ImageIcon,
  Inbox,
  LoaderCircle,
  Mail,
  Plus,
  Send,
  Settings as SettingsIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ColorField } from '../components/ColorField'
import { ActivityCard, ActivityCardSkeleton } from '../components/charts'
import { StatusBadge } from '../components/StatusBadge'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass, textareaClass } from '../lib/ui'
import { uid } from '../lib/uid'

interface EditorProps {
  botId: string
}

interface EditableFaq extends FaqPair {
  _key: string
}

interface EditableDomain {
  _key: string
  value: string
}

interface FormState {
  name: string
  websiteUrl: string
  welcomeMessage: string
  brandColor: string
  avatarUrl: string
  quickReplies: string
  domains: EditableDomain[]
  status: ChatbotAdminView['status']
  facts: Omit<BusinessFacts, 'faqs'> & { faqs?: EditableFaq[] }
  model: string
  showLogo: boolean
  showName: boolean
  showOnlineStatus: boolean
  poweredBy: boolean
}

function emptyFacts(): BusinessFacts & { faqs?: never[] } {
  return {
    overview: '',
    hours: '',
    location: '',
    contact: '',
    services: '',
    pricing: '',
    policies: '',
    misc: '',
    faqs: [],
  }
}

function toForm(v: ChatbotAdminView): FormState {
  return {
    name: v.name,
    websiteUrl: v.websiteUrl ?? '',
    welcomeMessage: v.welcomeMessage,
    brandColor: v.brandColor,
    avatarUrl: v.avatarUrl ?? '',
    quickReplies: v.quickReplies.join(', '),
    domains: (v.allowedDomains ?? []).map((d) => ({ _key: uid(), value: d })),
    status: v.status,
    facts: v.facts
      ? {
          ...emptyFacts(),
          ...v.facts,
          faqs: (v.facts.faqs ?? []).map((f) => ({ ...f, _key: uid() })),
        }
      : emptyFacts(),
    model: v.model,
    showLogo: v.showLogo,
    showName: v.showName,
    showOnlineStatus: v.showOnlineStatus,
    poweredBy: v.poweredBy,
  }
}

function cleanFacts(facts: BusinessFacts): BusinessFacts {
  return {
    overview: facts.overview?.trim() || undefined,
    hours: facts.hours?.trim() || undefined,
    location: facts.location?.trim() || undefined,
    contact: facts.contact?.trim() || undefined,
    services: facts.services?.trim() || undefined,
    pricing: facts.pricing?.trim() || undefined,
    policies: facts.policies?.trim() || undefined,
    misc: facts.misc?.trim() || undefined,
    faqs: (facts.faqs ?? []).filter((f) => f.q.trim() && f.a.trim()),
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

const LOGO_MAX_EDGE = 256

function readLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read the file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Not a valid image'))
      img.onload = () => {
        const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('Could not process the image'))
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/png'))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split('@')[0] || '?'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
  }
  return source.slice(0, 2).toUpperCase()
}

function focusFact(key: string) {
  const el = document.getElementById(`fact-${key}`)
  if (!el) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  const field = el.querySelector('textarea')
  if (field instanceof HTMLElement) field.focus({ preventScroll: true })
}

function isColorLight(hex: string): boolean {
  const m = hex.replace('#', '')
  const full =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  if (full.length !== 6) return false
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7
}

type Tab = 'leads' | 'knowledge' | 'test' | 'settings'

const FACT_FIELDS = [
  {
    key: 'overview',
    question: 'Who are you?',
    label: 'About us',
    hint: 'What you do, since when, what makes you different.',
    example: 'Family-owned HVAC company in Austin since 1998. NATE-certified, licensed and bonded.',
    rows: 4,
  },
  {
    key: 'hours',
    question: 'When are you open?',
    label: 'Hours',
    hint: 'Opening hours, including exceptions and emergency lines.',
    example: 'Mon–Fri 8am–6pm\nSat 9am–1pm\nClosed Sundays',
    rows: 3,
  },
  {
    key: 'location',
    question: 'Where are you, and who do you serve?',
    label: 'Location & service area',
    hint: 'Address plus the areas you cover.',
    example: '123 Main St, Austin TX\nServing Travis, Hays and Williamson counties',
    rows: 3,
  },
  {
    key: 'contact',
    question: 'How do I reach you?',
    label: 'Contact',
    hint: 'Phone, email, booking links.',
    example: 'Phone: (512) 555-0100\nEmail: hello@acme.com\nBook online: acmehvac.com',
    rows: 3,
  },
  {
    key: 'services',
    question: 'What do you do?',
    label: 'Services',
    hint: 'Products and services you offer.',
    example:
      'AC repair, installation, seasonal tune-ups, duct cleaning, air-quality testing. Free estimates on new installs.',
    rows: 4,
  },
  {
    key: 'pricing',
    question: 'What do you charge?',
    label: 'Pricing & payment',
    hint: 'Prices, packages and payment methods — only what you want public.',
    example: 'Free estimates. Service calls from $89. Financing available.',
    rows: 3,
  },
  {
    key: 'policies',
    question: 'What are your policies?',
    label: 'Policies & notes',
    hint: 'Warranties, returns, guarantees, languages spoken.',
    example: '1-year workmanship warranty on repairs. Spanish spoken. 10% military discount.',
    rows: 3,
  },
] as const

type FactKey = (typeof FACT_FIELDS)[number]['key']

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
  const [modelOptions, setModelOptions] = useState<ModelOption[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [globalBaseUrl, setGlobalBaseUrl] = useState<string>('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const tabChosenRef = useRef(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const modelSearchRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!modelPickerOpen) return
    function onPointerDown(e: MouseEvent) {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [modelPickerOpen])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  function setFact<K extends FactKey>(key: K, value: string) {
    setForm((f) => (f ? { ...f, facts: { ...f.facts, [key]: value } } : f))
  }

  function setMisc(value: string) {
    setForm((f) => (f ? { ...f, facts: { ...f.facts, misc: value } } : f))
  }

  function setFaq(index: number, patch: { q?: string; a?: string }) {
    setForm((f) => {
      if (!f) return f
      const faqs = [...(f.facts.faqs ?? [])]
      const current = faqs[index]
      if (!current) return f
      faqs[index] = { q: patch.q ?? current.q, a: patch.a ?? current.a, _key: current._key }
      return { ...f, facts: { ...f.facts, faqs } }
    })
  }

  function addFaq() {
    setForm((f) =>
      f
        ? {
            ...f,
            facts: {
              ...f.facts,
              faqs: [...(f.facts.faqs ?? []), { q: '', a: '', _key: uid() }],
            },
          }
        : f,
    )
  }

  function removeFaq(index: number) {
    setForm((f) => {
      if (!f) return f
      return {
        ...f,
        facts: { ...f.facts, faqs: (f.facts.faqs ?? []).filter((_, i) => i !== index) },
      }
    })
  }

  const filteredModels = useMemo(() => {
    if (!modelOptions) return []
    const q = modelFilter.toLowerCase()
    return modelOptions.filter((m) => `${m.id} ${m.name}`.toLowerCase().includes(q))
  }, [modelOptions, modelFilter])

  useEffect(() => {
    if (modelPickerOpen) modelSearchRef.current?.focus()
  }, [modelPickerOpen])

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
      quickReplies: splitList(form.quickReplies).slice(0, 6),
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

  async function loadModels() {
    setModelsLoading(true)
    setModelsError('')
    try {
      let settingsBaseUrl = globalBaseUrl
      if (settingsBaseUrl === '') {
        const settings = await apiFetch<{ baseUrl: string }>('/api/admin/settings')
        settingsBaseUrl = settings.baseUrl ?? ''
        setGlobalBaseUrl(settingsBaseUrl)
      }
      // provider is global-only: Settings base URL, else OpenAI default
      const effectiveBaseUrl = settingsBaseUrl || 'https://api.openai.com/v1'
      const data = await apiFetch<{ models: ModelOption[] }>(
        `/api/admin/models?baseUrl=${encodeURIComponent(effectiveBaseUrl)}`,
      )
      setModelOptions(
        [...data.models].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
      )
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setModelsError(api?.message ?? 'Could not load models')
    } finally {
      setModelsLoading(false)
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
        {tab === 'knowledge' && (
          <KnowledgeTab
            form={form}
            setForm={setForm}
            setFact={setFact}
            setMisc={setMisc}
            setFaq={setFaq}
            addFaq={addFaq}
            removeFaq={removeFaq}
            preview={preview}
          />
        )}
        {tab === 'test' && <TestTab botId={botId} form={form} />}
        {tab === 'settings' && (
          <SettingsTab
            view={view}
            form={form}
            set={set}
            modelOptions={modelOptions}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            modelFilter={modelFilter}
            setModelFilter={setModelFilter}
            modelPickerOpen={modelPickerOpen}
            setModelPickerOpen={setModelPickerOpen}
            modelPickerRef={modelPickerRef}
            modelSearchRef={modelSearchRef}
            filteredModels={filteredModels}
            loadModels={loadModels}
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

interface KnowledgeTabProps {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState | null>>
  setFact: <K extends FactKey>(key: K, value: string) => void
  setMisc: (value: string) => void
  setFaq: (index: number, patch: { q?: string; a?: string }) => void
  addFaq: () => void
  removeFaq: (index: number) => void
  preview: string
}

function KnowledgeTab({
  form,
  setForm,
  setFact,
  setMisc,
  setFaq,
  addFaq,
  removeFaq,
  preview,
}: KnowledgeTabProps) {
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState<BusinessFacts | null>(null)
  const [previewCopied, setPreviewCopied] = useState(false)
  const [armedClear, setArmedClear] = useState(false)

  async function copyPreview() {
    await navigator.clipboard.writeText(preview)
    setPreviewCopied(true)
    setTimeout(() => setPreviewCopied(false), 2000)
  }

  async function runImport() {
    const url = importUrl.trim()
    if (!url) {
      setImportError('Enter a website URL to import from')
      return
    }
    setImporting(true)
    setImportError('')
    setPendingImport(null)
    try {
      const result = await apiFetch<ImportResult>('/api/admin/import', {
        method: 'POST',
        body: JSON.stringify({ url, model: form.model.trim() || undefined }),
      })
      setPendingImport(result.facts)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setImportError(api?.message ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function applyImport(facts: BusinessFacts) {
    setForm((f) =>
      f
        ? {
            ...f,
            facts: {
              ...f.facts,
              overview: facts.overview ?? '',
              hours: facts.hours ?? '',
              location: facts.location ?? '',
              contact: facts.contact ?? '',
              services: facts.services ?? '',
              pricing: facts.pricing ?? '',
              policies: facts.policies ?? '',
              misc: facts.misc ?? '',
              faqs: (facts.faqs ?? []).map((pair) => ({ ...pair, _key: uid() })),
            },
          }
        : f,
    )
    setPendingImport(null)
  }

  const coveredCount = FACT_FIELDS.filter((f) => (form.facts[f.key] ?? '').trim() !== '').length
  const hasFacts =
    coveredCount > 0 ||
    Boolean((form.facts.misc ?? '').trim()) ||
    (form.facts.faqs?.length ?? 0) > 0

  function clearFacts() {
    if (!armedClear) {
      setArmedClear(true)
      setTimeout(() => setArmedClear(false), 3000)
      return
    }
    setForm((f) => (f ? { ...f, facts: emptyFacts() } : f))
    setPendingImport(null)
    setArmedClear(false)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-5">
        {!hasFacts && (
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-medium">Import a website</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  Paste your site URL and we read it, then fill as many of the fields below as we
                  can. You confirm and adjust — nothing is invented.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                aria-label="Website URL to import"
                type="text"
                inputMode="url"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck="false"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder={form.websiteUrl || 'acme.com'}
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={importing}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                {importing ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                Import
              </button>
            </div>
            {importError && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importError}
              </p>
            )}
            {pendingImport && <ImportReview facts={pendingImport} onApply={applyImport} />}
          </section>
        )}

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium">How it greets visitors</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The welcome message and quick replies show before anyone types.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="ed-welcome" className={labelClass}>
                Welcome message
              </label>
              <input
                id="ed-welcome"
                type="text"
                value={form.welcomeMessage}
                onChange={(e) => setForm((f) => (f ? { ...f, welcomeMessage: e.target.value } : f))}
                placeholder="Hi! How can I help?"
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="ed-chips" className={labelClass}>
                Quick replies{' '}
                <span className="font-normal text-muted-foreground/80">· up to 6</span>
              </label>
              <input
                id="ed-chips"
                type="text"
                value={form.quickReplies}
                onChange={(e) => setForm((f) => (f ? { ...f, quickReplies: e.target.value } : f))}
                placeholder="Opening hours, Pricing, Book a visit"
                className={`${inputClass} mt-1.5`}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-base font-medium">What the bot knows</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Answer the questions visitors actually ask. Filled sections are woven into the bot's
              instructions — it never invents the rest.
            </p>
          </div>

          <div className="mt-6 space-y-6">
            {FACT_FIELDS.map((field) => {
              const filled = ((form.facts[field.key] ?? '') as string).trim() !== ''
              return (
                <div
                  key={field.key}
                  id={`fact-${field.key}`}
                  className="border-t border-border/60 pt-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-medium">{field.label}</h3>
                    {!filled && (
                      <button
                        type="button"
                        onClick={() => setFact(field.key, field.example)}
                        className="shrink-0 text-[12px] font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        title="Fill with a sample you can edit"
                      >
                        Show example
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {field.question} — {field.hint}
                  </p>
                  <textarea
                    aria-label={field.label}
                    rows={field.rows}
                    value={(form.facts[field.key] ?? '') as string}
                    onChange={(e) => setFact(field.key, e.target.value)}
                    className={`${textareaClass} mt-2`}
                  />
                </div>
              )
            })}

            <div className="border-t border-border/60 pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-medium">FAQ pairs</h3>
                  <p className="tnum mt-1 text-[13px] text-muted-foreground">
                    Question → answer pairs that steer answers hardest ·{' '}
                    {form.facts.faqs?.length ?? 0}/50
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addFaq}
                  disabled={(form.facts.faqs?.length ?? 0) >= 50}
                  title={
                    (form.facts.faqs?.length ?? 0) >= 50 ? 'FAQ limit reached (50)' : undefined
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                >
                  <Plus className="size-3" /> Add FAQ
                </button>
              </div>
              {(form.facts.faqs ?? []).length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Nothing yet — add the pairs visitors actually type.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {(form.facts.faqs ?? []).map((faq, i) => (
                    <div key={faq._key} className="flex items-start gap-3">
                      <span className="tnum mt-2.5 w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <input
                          aria-label={`FAQ ${i + 1} question`}
                          value={faq.q}
                          onChange={(e) => setFaq(i, { q: e.target.value })}
                          placeholder="Do you offer emergency service?"
                          className={inputClass}
                        />
                        <textarea
                          aria-label={`FAQ ${i + 1} answer`}
                          rows={2}
                          value={faq.a}
                          onChange={(e) => setFaq(i, { a: e.target.value })}
                          placeholder="Yes — 24/7 for maintenance plan members."
                          className={`${textareaClass} mt-0 resize-y`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFaq(i)}
                        aria-label={`Remove FAQ ${i + 1}`}
                        className="mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border/60 pt-6">
              <h3 className="text-base font-medium">Misc</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Anything else the bot should know — pasted About pages, policies, extra details.
                Added word-for-word to the bot's instructions.
              </p>
              <textarea
                aria-label="Misc"
                rows={4}
                value={form.facts.misc ?? ''}
                onChange={(e) => setMisc(e.target.value)}
                placeholder="Paste additional content here — the more context, the better."
                className={`${textareaClass} mt-2`}
              />
            </div>
          </div>
        </section>

        {hasFacts && (
          <section className="rounded-xl border border-destructive/30 bg-card p-5 shadow-sm">
            <h2 className="text-base font-medium text-destructive">Clear all facts</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Removes everything the bot knows — the sections above, FAQ pairs and misc. The import
              option returns so you can start over.
            </p>
            <button
              type="button"
              onClick={clearFacts}
              aria-label={armedClear ? 'Confirm clear all facts' : 'Clear all facts'}
              className={`mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive ${
                armedClear
                  ? 'bg-destructive text-white'
                  : 'border border-destructive/40 text-destructive hover:bg-destructive/10'
              }`}
            >
              {armedClear ? 'Confirm clear all facts' : 'Clear all facts'}
            </button>
          </section>
        )}
      </div>

      <div className="min-w-0 space-y-5 lg:sticky lg:top-0 lg:self-start">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium">Visitors will ask</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {coveredCount === FACT_FIELDS.length
              ? 'Everything covered. Nice.'
              : `${coveredCount} of ${FACT_FIELDS.length} covered — add the rest so it never blanks.`}
          </p>
          <ul className="mt-3 space-y-1">
            {FACT_FIELDS.map((field) => {
              const filled = (form.facts[field.key] ?? '').trim() !== ''
              return (
                <li key={field.key}>
                  <button
                    type="button"
                    onClick={() => focusFact(field.key)}
                    title={filled ? `Edit “${field.label}”` : `Add “${field.label}”`}
                    className="-mx-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded-full ${
                        filled ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground/60'
                      }`}
                    >
                      {filled ? (
                        <Check className="size-3" />
                      ) : (
                        <span className="size-1 rounded-full bg-current" />
                      )}
                    </span>
                    <span className={filled ? '' : 'text-muted-foreground'}>{field.question}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-medium">Final prompt</h2>
            <button
              type="button"
              onClick={() => void copyPreview()}
              disabled={!preview}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {previewCopied ? (
                <Check className="size-3 text-success" />
              ) : (
                <Copy className="size-3" />
              )}
              {previewCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Exactly what the bot reads each message — facts as JSON, live.
          </p>
          <pre className="mt-3 max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {preview || 'Fill in any field to see the assembled prompt.'}
          </pre>
        </section>
      </div>
    </div>
  )
}

function ImportReview({
  facts,
  onApply,
}: {
  facts: BusinessFacts
  onApply: (facts: BusinessFacts) => void
}) {
  const filled = FACT_FIELDS.filter((f) => (facts[f.key] ?? '').trim() !== '').length
  const miscFilled = Boolean((facts.misc ?? '').trim())
  const faqCount = facts.faqs?.length ?? 0
  const total = FACT_FIELDS.length + 1
  return (
    <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Read {filled + (miscFilled ? 1 : 0)} of {total} sections from your site
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {faqCount > 0 ? `Including ${faqCount} FAQ pair${faqCount === 1 ? '' : 's'}. ` : ''}
            Use them as a starting point — you can edit anything before saving.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onApply(facts)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Check className="size-3.5" /> Use these facts
        </button>
      </div>
    </div>
  )
}

const WIDGET = {
  bg: '#ffffff',
  ink: '#18181b',
} as const

function TestTab({ botId, form }: { botId: string; form: FormState }) {
  const [open, setOpen] = useState(true)
  const [messages, setMessages] = useState<
    Array<{ id: string; role: 'user' | 'bot'; text: string }>
  >([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const brand = form.brandColor || WIDGET.ink
  const onBrand = isColorLight(brand) ? WIDGET.ink : WIDGET.bg
  const name = form.name.trim() || 'Your bot'
  const quickReplies = splitList(form.quickReplies)
  const showWelcome = messages.length === 0 && !busy

  useEffect(() => {
    const el = scrollRef.current
    if (el && (messages.length > 0 || busy)) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, busy])

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
        <div className="relative h-[560px] overflow-hidden rounded-xl border bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${open ? 'Close' : 'Open'} chat with ${name}`}
            style={{ background: brand, color: onBrand }}
            className="absolute bottom-6 right-6 grid size-14 place-items-center rounded-full shadow-xl transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {open ? <X className="size-6" /> : <Bot className="size-6" />}
          </button>

          {open && (
            <div
              className="absolute bottom-[104px] right-6 flex h-[420px] w-[340px] flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl ring-1 ring-black/5"
              style={{ '--sl-brand': brand } as React.CSSProperties}
            >
              <div
                className={`flex items-center gap-3 ${
                  !form.showLogo && !form.showName && !form.showOnlineStatus
                    ? 'pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-2'
                    : 'border-b border-[#f1f1f3] px-4 py-3.5'
                }`}
              >
                {form.showLogo && (
                  <div
                    className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold"
                    style={{ background: `${brand}22`, color: brand }}
                  >
                    {form.avatarUrl.trim() ? (
                      <img src={form.avatarUrl.trim()} alt="" className="size-full object-cover" />
                    ) : (
                      name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                )}
                {(form.showName || form.showOnlineStatus) && (
                  <div className="min-w-0 flex-1">
                    {form.showName && (
                      <p className="truncate text-[15px] font-semibold text-[#111113]">{name}</p>
                    )}
                    {form.showOnlineStatus && (
                      <p className="flex items-center gap-1.5 text-xs text-[#8f8f96]">
                        <span className="size-1.5 rounded-full bg-[#34c759]" /> Online now
                      </p>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  aria-label="Close chat"
                  onClick={() => setOpen(false)}
                  className="pointer-events-auto ml-auto grid size-7 place-items-center rounded-full text-[#a5a5ad] transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#52525b]"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>

              <div
                ref={scrollRef}
                className={`flex-1 space-y-3 overflow-y-auto bg-white px-4 ${
                  !form.showLogo && !form.showName && !form.showOnlineStatus ? 'pb-4 pt-[11px]' : 'py-4'
                }`}
              >
                {showWelcome && form.welcomeMessage && (
                  <div className="text-sm leading-relaxed text-[#3a3a40]">
                    {form.welcomeMessage}
                  </div>
                )}
                {showWelcome && quickReplies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quickReplies.map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => void send(chip)}
                        className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[13px] text-[#3f3f46] transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--sl-brand)_45%,#ffffff)] hover:text-[var(--sl-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`max-w-[84%] whitespace-pre-wrap text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'ml-auto rounded-2xl rounded-br-md px-3 py-2 text-[#232326]'
                        : 'text-[#3a3a40]'
                    }`}
                    style={m.role === 'user' ? { background: `${brand}1c` } : undefined}
                  >
                    {m.text}
                  </div>
                ))}
                {busy && (
                  <div className="inline-flex gap-1 p-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-1.5 animate-bounce rounded-full bg-[#c9c9cf]"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {form.poweredBy && (
                <p className="pb-1.5 text-center text-[11px] text-[#b3b3ba]">Powered by SiteLift</p>
              )}

              <div className="flex items-center gap-2 border-t border-[#f1f1f3] px-3 py-2.5">
                <input
                  aria-label="Test message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void send()
                  }}
                  placeholder="Write a message…"
                  className="flex-1 rounded-xl bg-[#f4f4f5] px-3.5 py-2.5 text-sm text-[#18181b] outline-none placeholder:text-[#a5a5ad] focus-visible:ring-2"
                  style={
                    {
                      '--tw-ring-color': brand,
                    } as React.CSSProperties
                  }
                />
                <button
                  type="button"
                  aria-label="Send message"
                  onClick={() => void send()}
                  disabled={busy || !input.trim()}
                  style={{ background: brand, color: onBrand }}
                  className="grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:scale-100"
                >
                  {busy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

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
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void
  modelOptions: ModelOption[] | null
  modelsLoading: boolean
  modelsError: string
  modelFilter: string
  setModelFilter: (value: string) => void
  modelPickerOpen: boolean
  setModelPickerOpen: (open: boolean) => void
  modelPickerRef: React.RefObject<HTMLDivElement | null>
  modelSearchRef: React.RefObject<HTMLInputElement | null>
  filteredModels: ModelOption[]
  loadModels: () => void
  armedDelete: boolean
  deleting: boolean
  onDelete: () => void
}

function SettingsTab({
  view,
  form,
  set,
  modelOptions,
  modelsLoading,
  modelsError,
  modelFilter,
  setModelFilter,
  modelPickerOpen,
  setModelPickerOpen,
  modelPickerRef,
  modelSearchRef,
  filteredModels,
  loadModels,
  armedDelete,
  deleting,
  onDelete,
}: SettingsTabProps) {
  const [copied, setCopied] = useState(false)
  const [statusPickerOpen, setStatusPickerOpen] = useState(false)
  const statusPickerRef = useRef<HTMLDivElement>(null)
  const [logoBusy, setLogoBusy] = useState(false)
  const [logoError, setLogoError] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)
  const snippet = `<script src="${window.location.origin}/embed.js" data-chatbot-id="${view.id}"></script>`

  async function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoBusy(true)
    setLogoError('')
    try {
      const dataUrl = await readLogoFile(file)
      set('avatarUrl', dataUrl)
    } catch (err) {
      setLogoError((err as Error).message)
    } finally {
      setLogoBusy(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

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

          <div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="ed-domains" className={labelClass}>
                Allowed domains{' '}
                <span className="font-normal text-muted-foreground/80">
                  · widget only answers here
                </span>
              </label>
              <button
                type="button"
                onClick={() => set('domains', [...form.domains, { _key: uid(), value: '' }])}
                disabled={form.domains.length >= 20}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                <Plus className="size-3" /> Add domain
              </button>
            </div>
            <div className="mt-1.5 space-y-2">
              {form.domains.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No domains yet — add the sites that may embed this widget.
                </p>
              ) : (
                form.domains.map((domain, i) => (
                  <div key={domain._key} className="flex items-center gap-2">
                    <input
                      id={i === 0 ? 'ed-domains' : undefined}
                      aria-label={`Allowed domain ${i + 1}`}
                      type="text"
                      value={domain.value}
                      onChange={(e) => {
                        const next = [...form.domains]
                        next[i] = { _key: domain._key, value: e.target.value }
                        set('domains', next)
                      }}
                      placeholder="acme.com"
                      className={`${inputClass} font-mono`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        set(
                          'domains',
                          form.domains.filter((d) => d._key !== domain._key),
                        )
                      }
                      aria-label={`Remove domain ${i + 1}`}
                      className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

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

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-base font-medium">Widget Settings</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          What visitors see in the chat widget on your client's site.
        </p>

        <div className="mt-5 flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          {form.showLogo ? (
            <div
              className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-background text-sm font-semibold ring-1 ring-border"
              style={{ color: form.brandColor }}
            >
              {form.avatarUrl.trim() ? (
                <img src={form.avatarUrl.trim()} alt="" className="size-full object-contain p-1" />
              ) : (
                form.name.trim().slice(0, 1).toUpperCase() || '?'
              )}
            </div>
          ) : (
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background ring-1 ring-border">
              <ImageIcon className="size-4 text-muted-foreground/50" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {form.showName ? (
              <p className="truncate text-sm font-medium">{form.name.trim() || 'Business name'}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Name hidden</p>
            )}
            {form.showOnlineStatus ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-[#34c759]" /> Online now
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/70">Status hidden</p>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-5">
          <div className="border-b border-border/60 pb-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.showLogo}
                onChange={(e) => set('showLogo', e.target.checked)}
                className="size-4 accent-current"
              />
              Show logo
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {form.showLogo
                ? 'Show a logo or image in the header. Falls back to the bot’s initial if none set.'
                : 'Hide the logo from the widget header.'}
            </p>
            {form.showLogo && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoBusy}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                >
                  {logoBusy ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  {form.avatarUrl.trim() ? 'Replace logo' : 'Upload logo'}
                </button>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label="Upload logo image"
                  onChange={(e) => void onLogoFile(e)}
                />
                {form.avatarUrl.trim() && (
                  <button
                    type="button"
                    onClick={() => set('avatarUrl', '')}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Trash2 className="size-3" /> Remove
                  </button>
                )}
                {logoError && <p className="w-full text-[13px] text-destructive">{logoError}</p>}
              </div>
            )}
          </div>

          <div className="border-b border-border/60 pb-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.showName}
                onChange={(e) => set('showName', e.target.checked)}
                className="size-4 accent-current"
              />
              Show business name
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {form.showName
                ? 'Displays the business name in the header.'
                : 'Hide the business name from the widget header.'}
            </p>
          </div>

          <div className="border-b border-border/60 pb-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.showOnlineStatus}
                onChange={(e) => set('showOnlineStatus', e.target.checked)}
                className="size-4 accent-current"
              />
              Show “Online now” status
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {form.showOnlineStatus
                ? 'Displays a green dot and “Online now” under the name.'
                : 'Hide the online status from the widget header.'}
            </p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.poweredBy}
                onChange={(e) => set('poweredBy', e.target.checked)}
                className="size-4 accent-current"
              />
              Show “Powered by SiteLift” badge
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Adds a small link back to SiteLift under the chat.
            </p>
          </div>
        </div>
      </section>

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

        <div className="relative mt-3" ref={modelPickerRef}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={modelPickerOpen}
            aria-label={`Model: ${form.model || 'none selected'}`}
            onClick={() => {
              const next = !modelPickerOpen
              setModelPickerOpen(next)
              if (next && !modelOptions) void loadModels()
            }}
            className="flex w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-2.5 text-left transition-[border-color,box-shadow] duration-150 hover:border-ring/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          >
            <span className="min-w-0">
              {(() => {
                const selected = modelOptions?.find((m) => m.id === form.model)
                return (
                  <>
                    <span className="block truncate text-sm">{selected?.name ?? form.model}</span>
                    {selected && (
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {selected.id}
                      </span>
                    )}
                  </>
                )
              })()}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${modelPickerOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {modelPickerOpen && (
            <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
              <div className="border-b bg-muted/40 p-2">
                <input
                  ref={modelSearchRef}
                  type="text"
                  value={modelFilter}
                  onChange={(e) => setModelFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setModelPickerOpen(false)
                    if (e.key === 'Enter' && filteredModels.length > 0) {
                      const first = filteredModels[0]
                      if (!first) return
                      set('model', first.id)
                      setModelPickerOpen(false)
                    }
                  }}
                  placeholder={
                    modelsLoading
                      ? 'Loading models…'
                      : `Search ${modelOptions?.length ?? 0} models…`
                  }
                  aria-label="Search models"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
                />
              </div>
              <ul className="max-h-72 divide-y overflow-y-auto">
                {modelsError && (
                  <li className="px-3 py-3 text-sm text-destructive">{modelsError}</li>
                )}
                {modelsLoading &&
                  ['a', 'b', 'c', 'd', 'e'].map((id) => (
                    <li key={id} className="px-3 py-2.5">
                      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                      <div className="mt-1.5 h-3 w-56 animate-pulse rounded bg-muted" />
                    </li>
                  ))}
                {!modelsLoading &&
                  filteredModels.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={m.id === form.model}
                        onClick={() => {
                          set('model', m.id)
                          setModelPickerOpen(false)
                          setModelFilter('')
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{m.name}</span>
                          <span className="block truncate font-mono text-xs text-muted-foreground">
                            {m.id}
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-right text-xs text-muted-foreground">
                          {m.promptPricePerM !== null && (
                            <span className="block">in ${fmtPrice(m.promptPricePerM)} / M</span>
                          )}
                          {m.completionPricePerM !== null && (
                            <span className="block">
                              out ${fmtPrice(m.completionPricePerM)} / M
                            </span>
                          )}
                        </span>
                        {m.id === form.model && <Check className="size-4 shrink-0 text-primary" />}
                      </button>
                    </li>
                  ))}
                {!modelsLoading && !modelsError && filteredModels.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No models match “{modelFilter}”.
                  </li>
                )}
              </ul>
            </div>
          )}
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

function fmtPrice(perMillion: number): string {
  if (perMillion === 0) return '0'
  if (perMillion < 0.01) return String(Number.parseFloat(perMillion.toPrecision(3)))
  return perMillion.toFixed(2)
}
