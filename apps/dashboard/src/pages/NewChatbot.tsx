import {
  type ChatbotAdminView,
  chatbotInputSchema,
  chatbotStatusLabels,
  composeSystemPrompt,
} from '@sitelift/shared'
import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ChevronDown, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ColorField } from '../components/ColorField'
import { DomainsList } from '../components/chatbot/DomainsList'
import { GreetingFields } from '../components/chatbot/GreetingFields'
import { FACT_FIELDS, KnowledgeEditor } from '../components/chatbot/KnowledgeEditor'
import { ModelPicker } from '../components/chatbot/ModelPicker'
import { cleanFacts, emptyForm, type FormState, splitList } from '../components/chatbot/state'
import { WidgetFields } from '../components/chatbot/WidgetFields'
import { WidgetSim } from '../components/chatbot/WidgetSim'
import { StatusBadge } from '../components/StatusBadge'
import { type AdminApiError, apiFetch } from '../lib/api'
import { labelClass } from '../lib/ui'

type StepId = 1 | 2 | 3 | 4

const STEP_IDS: StepId[] = [1, 2, 3, 4]

const STEP_META: Record<StepId, { title: string; subtitle: string }> = {
  1: {
    title: 'Who’s this bot for?',
    subtitle: 'The name visitors see, and the site it lives on.',
  },
  2: {
    title: 'What should it know?',
    subtitle: 'Import from their website or write it out — the bot never invents the rest.',
  },
  3: {
    title: 'What does it look like?',
    subtitle: 'Brand color, greeting and header.',
  },
  4: {
    title: 'Where can it live?',
    subtitle: 'Only answer on the sites you list.',
  },
}

const bigInputClass =
  'mt-2 w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-muted-foreground/40 hover:border-ring/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/15'

const cardClass = 'rounded-xl border bg-card p-5 shadow-sm'

function deriveName(value: string): string {
  try {
    const u = new URL(/^https?:\/\//.test(value) ? value : `https://${value}`)
    const host = u.hostname.replace(/^www\./, '')
    const segment = host.split('.')[0]
    if (!segment) return ''
    return segment.charAt(0).toUpperCase() + segment.slice(1)
  } catch {
    return ''
  }
}

export function NewChatbotPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(emptyForm)
  const [step, setStep] = useState<StepId>(1)
  const [stepError, setStepError] = useState('')
  const [creating, setCreating] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  const preview = useMemo(() => composeSystemPrompt(cleanFacts(form.facts)), [form])
  const coveredCount = useMemo(
    () => FACT_FIELDS.filter((f) => ((form.facts[f.key] ?? '') as string).trim() !== '').length,
    [form.facts],
  )
  const current = STEP_META[step]

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function setWebsite(value: string) {
    set('websiteUrl', value)
    const derived = deriveName(value)
    if (!form.name.trim() && derived) set('name', derived)
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

  function submitBasics() {
    if (form.name.trim()) goTo(2)
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
    <div className="min-h-full px-6 py-8 lg:px-10">
      <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          <div className="mx-auto mt-6 w-full max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight">{current.title}</h1>
            <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
              {current.subtitle}
            </p>

            <div className="mt-7 flex items-center gap-3">
              <span className="tnum text-[13px] font-medium text-muted-foreground">
                Step {step} of {STEP_IDS.length}
              </span>
              <div className="flex items-center gap-1.5">
                {STEP_IDS.map((id) => {
                  const selected = id === step
                  const complete = id < step
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-label={`Step ${id}`}
                      aria-current={selected ? 'step' : undefined}
                      onClick={() => {
                        if (id < step) goTo(id)
                      }}
                      disabled={id > step}
                      className={`h-1.5 rounded-full transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        selected
                          ? 'w-8 bg-foreground'
                          : complete
                            ? 'w-4 bg-foreground/50 hover:bg-foreground'
                            : 'w-4 bg-foreground/15'
                      }`}
                    />
                  )
                })}
              </div>
            </div>

            {stepError && (
              <div className="mt-6" role="alert">
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm text-destructive">
                  {stepError}
                </p>
              </div>
            )}

            <div className="mt-8">
              {step === 1 && (
                <section className="space-y-7" aria-label="Basics">
                  <div>
                    <label htmlFor="nb-name" className={labelClass}>
                      Name <span className="font-normal text-muted-foreground/70">· required</span>
                    </label>
                    <input
                      id="nb-name"
                      ref={nameRef}
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => set('name', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitBasics()
                      }}
                      placeholder="Acme HVAC"
                      className={bigInputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="nb-url" className={labelClass}>
                      Website URL{' '}
                      <span className="font-normal text-muted-foreground/70">· optional</span>
                    </label>
                    <input
                      id="nb-url"
                      type="text"
                      inputMode="url"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck="false"
                      value={form.websiteUrl}
                      onChange={(e) => setWebsite(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitBasics()
                      }}
                      placeholder="https://acme.com"
                      className={`${bigInputClass} font-mono`}
                    />
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="space-y-5" aria-label="Knowledge">
                  <ReviewPanel preview={preview} coveredCount={coveredCount} />
                  <KnowledgeEditor
                    form={form}
                    set={set}
                    preview={preview}
                    showGreeting={false}
                    keepImportVisible
                    aside={false}
                  />
                </section>
              )}

              {step === 3 && (
                <section className="space-y-5" aria-label="Look & greet">
                  <GreetingFields form={form} set={set} />

                  <section className={cardClass}>
                    <h2 className="text-base font-medium">Brand color</h2>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Colors the floating button and your messages in the widget.
                    </p>
                    <div className="mt-3">
                      <ColorField value={form.brandColor} onChange={(v) => set('brandColor', v)} />
                    </div>
                  </section>

                  <WidgetFields form={form} set={set} />
                </section>
              )}

              {step === 4 && (
                <section className="space-y-5" aria-label="Launch">
                  <section className={cardClass}>
                    <h2 className="text-base font-medium">Allowed domains</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      The widget only answers on the sites you list here. Add your client's domain
                      before pasting the embed script.
                    </p>
                    <div className="mt-4">
                      <DomainsList
                        domains={form.domains}
                        onChange={(domains) => set('domains', domains)}
                      />
                    </div>
                  </section>

                  <section className={cardClass}>
                    <h2 className="text-base font-medium">Model</h2>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      Served through the provider configured in Settings. Skip to use the global
                      default from Settings.
                    </p>
                    <div className="mt-3">
                      <ModelPicker model={form.model} onSelect={(id) => set('model', id)} />
                    </div>
                  </section>

                  <section className={cardClass}>
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
                </section>
              )}
            </div>

            <div className="mt-12 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => (step === 1 ? onExit() : setStep((step - 1) as StepId))}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ArrowLeft className="size-3.5" />
                {step === 1 ? 'Cancel' : 'Back'}
              </button>
              <div className="flex items-center gap-3">
                {step !== 4 && form.name.trim() && (
                  <button
                    type="button"
                    onClick={() => void create()}
                    className="text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Skip — finish later
                  </button>
                )}
                {step === 4 ? (
                  <button
                    type="button"
                    onClick={() => void create()}
                    disabled={creating}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                  >
                    {creating && <LoaderCircle className="size-4 animate-spin" />}
                    Create chatbot
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => goTo((step + 1) as StepId)}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <aside className="min-w-0">
          <div className="lg:sticky lg:top-10">
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
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReviewPanel({ preview, coveredCount }: { preview: string; coveredCount: number }) {
  const pct = Math.min(100, Math.round((coveredCount / FACT_FIELDS.length) * 100))
  return (
    <details className="group overflow-hidden rounded-xl border border-border/80 bg-card">
      <summary className="flex w-full cursor-pointer select-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="flex items-center gap-3">
          Review what it knows
          <span
            className={`tnum text-[13px] font-normal ${
              coveredCount === FACT_FIELDS.length
                ? 'text-success'
                : coveredCount
                  ? 'text-muted-foreground'
                  : 'text-destructive'
            }`}
          >
            {coveredCount} of {FACT_FIELDS.length} topics
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border/60 px-5 py-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
          {preview || 'Fill in a field to see the assembled prompt.'}
        </pre>
      </div>
    </details>
  )
}
