import { type ChatbotAdminView, chatbotInputSchema } from '@sitelift/shared'
import { ArrowLeft, LoaderCircle, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
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

interface FormState {
  name: string
  websiteUrl: string
  welcomeMessage: string
  brandColor: string
  quickReplies: string
  domains: string
  systemPrompt: string
  model: string
  baseUrl: string
  temperature: string
  maxTokens: string
  poweredBy: boolean
}

function toForm(v: ChatbotAdminView): FormState {
  return {
    name: v.name,
    websiteUrl: v.websiteUrl ?? '',
    welcomeMessage: v.welcomeMessage,
    brandColor: v.brandColor,
    quickReplies: v.quickReplies.join(', '),
    domains: v.allowedDomains.join(', '),
    systemPrompt: v.systemPrompt,
    model: v.model,
    baseUrl: v.baseUrl ?? '',
    temperature: String(v.temperature),
    maxTokens: String(v.maxTokens),
    poweredBy: v.poweredBy,
  }
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

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

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  async function save() {
    if (!form || !view) return
    setValidationError('')
    setSaveError('')

    const temperature = Number.parseFloat(form.temperature)
    const maxTokens = Number.parseInt(form.maxTokens, 10)
    const payload = {
      name: form.name.trim(),
      websiteUrl: form.websiteUrl.trim(),
      welcomeMessage: form.welcomeMessage.trim() || view.welcomeMessage,
      brandColor: form.brandColor,
      quickReplies: splitList(form.quickReplies).slice(0, 6),
      poweredBy: form.poweredBy,
      systemPrompt: form.systemPrompt,
      model: form.model.trim() || view.model,
      baseUrl: form.baseUrl.trim(),
      temperature: Number.isFinite(temperature) ? temperature : view.temperature,
      maxTokens: Number.isFinite(maxTokens) ? maxTokens : view.maxTokens,
      allowedDomains: splitList(form.domains),
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
        body: JSON.stringify(parsed.data),
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

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-3.5" /> All chatbots
        </button>
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
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-3.5" /> All chatbots
      </button>

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
          <div className="mt-4">
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
                <span className="font-normal text-muted-foreground">
                  · comma separated; the widget only answers here
                </span>
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
          <div className="mt-4">
            <label htmlFor="ed-chips" className="text-sm font-medium">
              Quick replies{' '}
              <span className="font-normal text-muted-foreground">· up to 6, comma separated</span>
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
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="text-base font-medium">Business facts</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            Everything the AI knows. Written plainly, injected verbatim as the system prompt — no
            retrieval, no surprises.
          </p>
          <textarea
            id="ed-prompt"
            aria-label="Business facts"
            rows={12}
            value={form.systemPrompt}
            onChange={(e) => set('systemPrompt', e.target.value)}
            placeholder={
              'Family-owned HVAC company in Austin.\nHours: Mon–Fri 8am–6pm.\nEmergency line: (512) 555-0100.\nNever quote prices not listed above.'
            }
            className={`${inputClass} mt-3 resize-y leading-relaxed`}
          />
        </section>

        <details className="group rounded-xl border bg-card p-5 shadow-sm">
          <summary className="cursor-pointer list-none text-base font-medium transition-colors duration-150 [&::-webkit-details-marker]:hidden group-open:mb-4">
            Model & sampling
          </summary>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ed-model" className="text-sm font-medium">
                Model
              </label>
              <input
                id="ed-model"
                type="text"
                value={form.model}
                onChange={(e) => set('model', e.target.value)}
                className={`${inputClass} mt-1.5 font-mono`}
              />
            </div>
            <div>
              <label htmlFor="ed-baseurl" className="text-sm font-medium">
                Base URL override
              </label>
              <input
                id="ed-baseurl"
                type="url"
                value={form.baseUrl}
                onChange={(e) => set('baseUrl', e.target.value)}
                placeholder="Uses the global provider"
                className={`${inputClass} mt-1.5 font-mono`}
              />
            </div>
            <div>
              <label htmlFor="ed-temp" className="text-sm font-medium">
                Temperature
              </label>
              <input
                id="ed-temp"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => set('temperature', e.target.value)}
                className={`${inputClass} mt-1.5 tnum`}
              />
            </div>
            <div>
              <label htmlFor="ed-maxtok" className="text-sm font-medium">
                Max tokens
              </label>
              <input
                id="ed-maxtok"
                type="number"
                min={16}
                max={4000}
                step={16}
                value={form.maxTokens}
                onChange={(e) => set('maxTokens', e.target.value)}
                className={`${inputClass} mt-1.5 tnum`}
              />
            </div>
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
        </details>

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
