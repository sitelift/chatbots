import {
  type BusinessFacts,
  type ChatbotAdminView,
  chatbotInputSchema,
  composeSystemPrompt,
  type FaqPair,
  type ModelOption,
} from '@sitelift/shared'
import { ArrowLeft, Check, ChevronDown, LoaderCircle, Plus, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type AdminApiError, apiFetch } from '../lib/api'

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

interface EditorProps {
  botId: string
  onBack: () => void
  onSaved: (view: ChatbotAdminView) => void
  onDeleted: (id: string) => void
  onPlayground: (id: string) => void
}

interface EditableFaq extends FaqPair {
  _key: string
}

type FactsMode = 'structured' | 'raw'

interface FormState {
  name: string
  websiteUrl: string
  welcomeMessage: string
  brandColor: string
  quickReplies: string
  domains: string
  mode: FactsMode
  facts: Omit<BusinessFacts, 'faqs'> & { faqs?: EditableFaq[] }
  rawPrompt: string
  model: string
  poweredBy: boolean
}

function emptyFacts(): BusinessFacts & { faqs?: never[] } {
  return { overview: '', hours: '', contact: '', products: '', misc: '', faqs: [] }
}

function toForm(v: ChatbotAdminView): FormState {
  const hasStructured =
    v.facts &&
    Boolean(
      v.facts.overview ||
        v.facts.hours ||
        v.facts.contact ||
        v.facts.products ||
        v.facts.misc ||
        (v.facts.faqs && v.facts.faqs.length > 0),
    )
  return {
    name: v.name,
    websiteUrl: v.websiteUrl ?? '',
    welcomeMessage: v.welcomeMessage,
    brandColor: v.brandColor,
    quickReplies: v.quickReplies.join(', '),
    domains: v.allowedDomains.join(', '),
    mode: hasStructured ? 'structured' : 'raw',
    facts: v.facts
      ? {
          ...emptyFacts(),
          ...v.facts,
          faqs: (v.facts.faqs ?? []).map((f) => ({ ...f, _key: crypto.randomUUID() })),
        }
      : emptyFacts(),
    rawPrompt: hasStructured ? '' : v.systemPrompt,
    model: v.model,
    poweredBy: v.poweredBy,
  }
}

function cleanFacts(facts: BusinessFacts): BusinessFacts {
  return {
    overview: facts.overview?.trim() || undefined,
    hours: facts.hours?.trim() || undefined,
    contact: facts.contact?.trim() || undefined,
    products: facts.products?.trim() || undefined,
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

const FACT_PLACEHOLDERS = {
  overview: 'Family-owned HVAC company serving Austin since 1998.',
  hours: 'Mon–Fri 8am–6pm\nSaturday 9am–1pm\nClosed Sundays',
  contact: 'Phone: (512) 555-0100\nEmail: hello@acme.com\n123 Main St, Austin TX',
  products: 'AC repair, installation, seasonal tune-ups.\nFree estimates on installs.',
} as const

export function ChatbotEditor({ botId, onBack, onSaved, onDeleted, onPlayground }: EditorProps) {
  const [view, setView] = useState<ChatbotAdminView | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [validationError, setValidationError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [armedDelete, setArmedDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [modelOptions, setModelOptions] = useState<ModelOption[] | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [globalBaseUrl, setGlobalBaseUrl] = useState<string>('')
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const modelSearchRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<ChatbotAdminView>(`/api/admin/chatbots/${botId}`)
      setView(data)
      setForm(toForm(data))
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setLoadError(api?.message ?? 'Failed to load chatbot')
    }
  }, [botId])

  useEffect(() => {
    void load()
  }, [load])

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

  function setFact<K extends keyof BusinessFacts>(key: K, value: BusinessFacts[K]) {
    setForm((f) => (f ? { ...f, facts: { ...f.facts, [key]: value } } : f))
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
              faqs: [...(f.facts.faqs ?? []), { q: '', a: '', _key: crypto.randomUUID() }],
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
    if (form.mode === 'raw') return form.rawPrompt
    return composeSystemPrompt(cleanFacts(form.facts))
  }, [form])

  async function save() {
    if (!form || !view) return
    setValidationError('')
    setSaveError('')

    const base = {
      name: form.name.trim(),
      websiteUrl: form.websiteUrl.trim(),
      welcomeMessage: form.welcomeMessage.trim() || view.welcomeMessage,
      brandColor: form.brandColor,
      quickReplies: splitList(form.quickReplies).slice(0, 6),
      poweredBy: form.poweredBy,
      model: form.model.trim() || view.model,
      allowedDomains: splitList(form.domains),
    }

    let payload: Record<string, unknown>
    if (form.mode === 'structured') {
      payload = { ...base, facts: cleanFacts(form.facts), systemPrompt: undefined }
    } else {
      payload = { ...base, facts: null, systemPrompt: form.rawPrompt }
    }

    const parsed = chatbotInputSchema.safeParse(payload)
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    // drop keys the server must not overwrite
    delete (parsed.data as Record<string, unknown>).systemPrompt
    if (form.mode === 'structured') parsed.data.systemPrompt = undefined

    setSaving(true)
    try {
      const updated = await apiFetch<ChatbotAdminView>(`/api/admin/chatbots/${botId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      setView(updated)
      setForm(toForm(updated))
      onSaved(updated)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setSaveError(api?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
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
      onDeleted(botId)
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
      <div className="mx-auto max-w-3xl px-6 py-10">
        <BackLink onClick={onBack} />
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      </div>
    )
  }

  if (!view || !form) {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <BackLink onClick={onBack} />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{view.name}</h1>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            view.status === 'active'
              ? 'bg-success/10 text-success'
              : view.status === 'paused'
                ? 'bg-warning/10 text-warning'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {view.status}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPlayground(view.id)}
            className="rounded-md border px-3 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Test in playground
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
          >
            {saving && <LoaderCircle className="size-3.5 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>

      {savedFlash && (
        <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">Saved.</p>
      )}
      {(validationError || saveError) && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {validationError || saveError}
        </p>
      )}

      <div className="mt-6 space-y-5">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium">Basics</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ed-name" className="text-sm font-medium">
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
              <label htmlFor="ed-url" className="text-sm font-medium">
                Website URL
              </label>
              <input
                id="ed-url"
                type="url"
                value={form.websiteUrl}
                onChange={(e) => set('websiteUrl', e.target.value)}
                placeholder="https://acme.com"
                className={`${inputClass} mt-1.5`}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[120px_1fr]">
            <div>
              <label htmlFor="ed-color" className="text-sm font-medium">
                Brand color
              </label>
              <input
                id="ed-color"
                type="color"
                value={form.brandColor}
                onChange={(e) => set('brandColor', e.target.value)}
                className="mt-1.5 h-9 w-full cursor-pointer rounded-md border border-input bg-background p-1"
              />
            </div>
            <div>
              <label htmlFor="ed-domains" className="text-sm font-medium">
                Allowed domains{' '}
                <span className="font-normal text-muted-foreground">· comma separated</span>
              </label>
              <input
                id="ed-domains"
                type="text"
                value={form.domains}
                onChange={(e) => set('domains', e.target.value)}
                placeholder="acme.com, www.acme.com"
                className={`${inputClass} mt-1.5 font-mono`}
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ed-welcome" className="text-sm font-medium">
                Welcome message
              </label>
              <input
                id="ed-welcome"
                type="text"
                value={form.welcomeMessage}
                onChange={(e) => set('welcomeMessage', e.target.value)}
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="ed-chips" className="text-sm font-medium">
                Quick replies <span className="font-normal text-muted-foreground">· up to 6</span>
              </label>
              <input
                id="ed-chips"
                type="text"
                value={form.quickReplies}
                onChange={(e) => set('quickReplies', e.target.value)}
                placeholder="Hours?, Pricing?, Book a visit"
                className={`${inputClass} mt-1.5`}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-medium">Business facts</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Everything the AI knows. Filled sections are woven into its instructions — nothing
                more, nothing invented.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (form.mode === 'structured') {
                  set('rawPrompt', preview)
                  set('mode', 'raw')
                } else {
                  set('mode', 'structured')
                }
              }}
              className="shrink-0 text-[13px] font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {form.mode === 'structured' ? 'Edit as plain prompt' : 'Use guided fields'}
            </button>
          </div>

          {form.mode === 'structured' ? (
            <div className="mt-4 space-y-4">
              <FactField
                id="facts-overview"
                label="Business overview"
                value={form.facts.overview ?? ''}
                onChange={(v) => setFact('overview', v)}
                placeholder={FACT_PLACEHOLDERS.overview}
                rows={3}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FactField
                  id="facts-hours"
                  label="Hours"
                  value={form.facts.hours ?? ''}
                  onChange={(v) => setFact('hours', v)}
                  placeholder={FACT_PLACEHOLDERS.hours}
                  rows={3}
                />
                <FactField
                  id="facts-contact"
                  label="Contact"
                  value={form.facts.contact ?? ''}
                  onChange={(v) => setFact('contact', v)}
                  placeholder={FACT_PLACEHOLDERS.contact}
                  rows={3}
                />
              </div>
              <FactField
                id="facts-products"
                label="Products & services"
                value={form.facts.products ?? ''}
                onChange={(v) => setFact('products', v)}
                placeholder={FACT_PLACEHOLDERS.products}
                rows={3}
              />

              <div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">FAQ pairs</div>
                  <button
                    type="button"
                    onClick={addFaq}
                    disabled={(form.facts.faqs?.length ?? 0) >= 50}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                  >
                    <Plus className="size-3" /> Add FAQ
                  </button>
                </div>
                {(form.facts.faqs ?? []).length === 0 ? (
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    Question → answer pairs. These steer answers hardest.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {(form.facts.faqs ?? []).map((faq, i) => (
                      <div key={faq._key} className="flex items-start gap-2">
                        <div className="grid flex-1 gap-1.5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                          <input
                            aria-label={`FAQ ${i + 1} question`}
                            value={faq.q}
                            onChange={(e) => setFaq(i, { q: e.target.value })}
                            placeholder="Do you offer emergency service?"
                            className={`${inputClass} mt-0`}
                          />
                          <input
                            aria-label={`FAQ ${i + 1} answer`}
                            value={faq.a}
                            onChange={(e) => setFaq(i, { a: e.target.value })}
                            placeholder="Yes — 24/7 for maintenance plan members."
                            className={`${inputClass} mt-0`}
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

              <FactField
                id="facts-misc"
                label="Additional notes"
                value={form.facts.misc ?? ''}
                onChange={(v) => setFact('misc', v)}
                placeholder="Service area: within 30 miles of downtown. Spanish spoken."
                rows={2}
              />

              <details className="group">
                <summary className="cursor-pointer list-none text-[13px] font-medium text-primary [&::-webkit-details-marker]:hidden group-open:mb-2">
                  Preview final prompt
                </summary>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
                  {preview || 'Fill in any field to see the assembled prompt.'}
                </pre>
              </details>
            </div>
          ) : (
            <textarea
              aria-label="Raw system prompt"
              rows={14}
              value={form.rawPrompt}
              onChange={(e) => set('rawPrompt', e.target.value)}
              className={`${inputClass} mt-4 resize-y font-mono leading-relaxed`}
            />
          )}
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
                    Array.from({ length: 5 }).map((_, i) => (
                      <li key={i} className="px-3 py-2.5">
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
                          {m.id === form.model && (
                            <Check className="size-4 shrink-0 text-primary" />
                          )}
                        </button>
                      </li>
                    ))}
                  {!modelsLoading && !modelsError && filteredModels.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No models match “{modelFilter}” — clear the search or type a custom id in the
                      field above after closing.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.poweredBy}
              onChange={(e) => set('poweredBy', e.target.checked)}
              className="size-4 accent-current"
            />
            Show “Powered by SiteLift” badge on the widget
          </label>
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
            onClick={() => void remove()}
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

interface FactFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}

function FactField({ id, label, value, onChange, placeholder, rows = 3 }: FactFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} mt-1.5 resize-y leading-relaxed`}
      />
    </div>
  )
}

function fmtPrice(perMillion: number): string {
  if (perMillion === 0) return '0'
  if (perMillion < 0.01) return String(Number.parseFloat(perMillion.toPrecision(3)))
  return perMillion.toFixed(2)
}
