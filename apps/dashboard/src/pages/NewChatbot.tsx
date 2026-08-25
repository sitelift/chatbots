import {
  type ChatbotAdminView,
  chatbotInputSchema,
  chatbotStatusLabels,
  composeSystemPrompt,
} from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, BookOpen, Bot, Check, LoaderCircle, Palette, Rocket } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ColorField } from '../components/ColorField'
import { DomainsList } from '../components/chatbot/DomainsList'
import { GreetingFields } from '../components/chatbot/GreetingFields'
import { KnowledgeEditor } from '../components/chatbot/KnowledgeEditor'
import { ModelPicker } from '../components/chatbot/ModelPicker'
import { cleanFacts, emptyForm, type FormState, splitList } from '../components/chatbot/state'
import { WidgetFields } from '../components/chatbot/WidgetFields'
import { WidgetSim } from '../components/chatbot/WidgetSim'
import { StatusBadge } from '../components/StatusBadge'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass } from '../lib/ui'

const STEPS = [
  { id: 1, label: 'Basics', icon: <Bot className="size-3.5" /> },
  { id: 2, label: 'Knowledge', icon: <BookOpen className="size-3.5" /> },
  { id: 3, label: 'Look & greet', icon: <Palette className="size-3.5" /> },
  { id: 4, label: 'Launch', icon: <Rocket className="size-3.5" /> },
] as const

type StepId = (typeof STEPS)[number]['id']

export function NewChatbotPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [step, setStep] = useState<StepId>(1)
  const [stepError, setStepError] = useState('')
  const [creating, setCreating] = useState(false)

  const preview = useMemo(() => composeSystemPrompt(cleanFacts(form.facts)), [form])

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const dirty = useMemo(() => {
    const f = form
    return Boolean(
      f.name.trim() ||
        f.websiteUrl.trim() ||
        f.welcomeMessage.trim() ||
        f.quickReplies.trim() ||
        f.domains.some((d) => d.value.trim()) ||
        f.model ||
        Object.values(f.facts).some(
          (v) => (typeof v === 'string' && v.trim() !== '') || (Array.isArray(v) && v.length > 0),
        ),
    )
  }, [form])

  const onExit = () => {
    if (dirty && !window.confirm('Leave the setup — nothing is saved yet?')) return
    navigate({ to: '/chatbots' })
  }

  function goTo(next: StepId) {
    setStepError('')
    if (next === 2 && !form.name.trim()) {
      setStepError('Give the chatbot a name before moving on.')
      return
    }
    setStep(next)
  }

  async function create() {
    setStepError('')
    const payload = {
      name: form.name.trim(),
      websiteUrl: form.websiteUrl.trim(),
      welcomeMessage: form.welcomeMessage.trim() || undefined,
      brandColor: form.brandColor,
      avatarUrl: form.avatarUrl.trim(),
      quickReplies: splitList(form.quickReplies).slice(0, 6),
      showLogo: form.showLogo,
      showName: form.showName,
      showOnlineStatus: form.showOnlineStatus,
      poweredBy: form.poweredBy,
      model: form.model.trim() || undefined,
      allowedDomains: form.domains.map((d) => d.value.trim()).filter(Boolean),
      status: form.status,
      facts: cleanFacts(form.facts),
      systemPrompt: undefined,
    }
    const parsed = chatbotInputSchema.safeParse(payload)
    if (!parsed.success) {
      setStepError(parsed.error.issues[0]?.message ?? 'Invalid input')
      return
    }
    setCreating(true)
    try {
      const view = await apiFetch<ChatbotAdminView>('/api/admin/chatbots', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      })
      navigate({ to: '/chatbots/$botId', params: { botId: view.id }, replace: true })
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setStepError(api?.message ?? 'Failed to create chatbot')
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-10">
      <button
        type="button"
        onClick={onExit}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-3.5" /> All chatbots
      </button>

      <div className="mt-4">
        <h1 className="text-3xl font-semibold tracking-tight">Create a chatbot</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Four quick steps — you can change everything later in the editor.
        </p>
      </div>

      <ol
        className="mt-6 flex items-center gap-1 overflow-x-auto border-b pb-3"
        aria-label="Setup steps"
      >
        {STEPS.map((s) => {
          const complete = step > s.id
          const current = step === s.id
          return (
            <li key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goTo(s.id)}
                aria-current={current ? 'step' : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  current
                    ? 'bg-muted text-foreground'
                    : complete
                      ? 'text-muted-foreground hover:text-foreground'
                      : 'text-muted-foreground/50 hover:text-muted-foreground'
                }`}
              >
                {complete ? <Check className="size-3.5 text-success" /> : s.icon}
                {s.label}
              </button>
              {s.id < STEPS.length && <span className="text-muted-foreground/30">/</span>}
            </li>
          )
        })}
      </ol>

      {(stepError || creating) && (
        <div className="mt-4 flex items-center gap-2">
          {stepError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {stepError}
            </p>
          )}
        </div>
      )}

      <div className="mt-6">
        {step === 1 && (
          <section className="max-w-2xl rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-base font-medium">Tell us who it is for</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              The name appears in the widget header and your list. The website is used for the
              import tool next.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="nb-name" className={labelClass}>
                  Name <span className="font-normal text-muted-foreground">· required</span>
                </label>
                <input
                  id="nb-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Acme HVAC"
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor="nb-url" className={labelClass}>
                  Website URL <span className="font-normal text-muted-foreground">· optional</span>
                </label>
                <input
                  id="nb-url"
                  type="text"
                  inputMode="url"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  value={form.websiteUrl}
                  onChange={(e) => set('websiteUrl', e.target.value)}
                  placeholder="https://acme.com"
                  className={`${inputClass} mt-1.5`}
                />
              </div>
            </div>
          </section>
        )}

        {step === 2 && (
          <KnowledgeEditor
            form={form}
            set={set}
            preview={preview}
            showGreeting={false}
            keepImportVisible
          />
        )}

        {step === 3 && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">
              <GreetingFields form={form} set={set} />

              <section className="rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="text-base font-medium">Brand color</h2>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Colors the floating button and your messages in the widget.
                </p>
                <div className="mt-3">
                  <ColorField value={form.brandColor} onChange={(v) => set('brandColor', v)} />
                </div>
              </section>

              <WidgetFields form={form} set={set} />
            </div>

            <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
              <WidgetSim
                form={form}
                messages={[]}
                busy={false}
                open
                onToggleOpen={() => {}}
                input=""
                onInput={() => {}}
                onSend={() => {}}
                interactive={false}
              />
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Live preview of the widget on your client's site.
              </p>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-base font-medium">Allowed domains</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                The widget only answers on the sites you list here. Add your client's domain before
                pasting the embed script.
              </p>
              <div className="mt-4">
                <DomainsList
                  domains={form.domains}
                  onChange={(domains) => set('domains', domains)}
                />
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="text-base font-medium">Model</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Served through the provider configured in Settings. Skip to use the global default
                from Settings.
              </p>
              <div className="mt-3">
                <ModelPicker model={form.model} onSelect={(id) => set('model', id)} />
              </div>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium">Status</h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Start answering visitors right away, or stay paused until you are ready.
                  </p>
                </div>
                <StatusBadge status={form.status} />
              </div>
              <div className="mt-4 flex gap-2">
                {(['active', 'paused', 'archived'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('status', s)}
                    aria-pressed={form.status === s}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      form.status === s
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {chatbotStatusLabels[s]}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-between border-t pt-5">
        <button
          type="button"
          onClick={() => (step === 1 ? onExit() : setStep((step - 1) as StepId))}
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </button>
        {step < 4 ? (
          <button
            type="button"
            onClick={() => goTo((step + 1) as StepId)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void create()}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
          >
            {creating && <LoaderCircle className="size-3.5 animate-spin" />}
            Create chatbot
          </button>
        )}
      </div>
    </div>
  )
}
