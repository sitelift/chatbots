import {
  PROVIDER_PRESETS,
  presetForBaseUrl,
  ROUTING_MODES,
  type RoutingMode,
} from '@sitelift/shared'
import { Check, KeyRound, LoaderCircle, Mail, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ModelPicker } from '../components/chatbot/ModelPicker'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass } from '../lib/ui'

const ROUTING_MODE_LABELS: Record<RoutingMode, { label: string; hint: string }> = {
  auto: {
    label: 'Auto',
    hint: 'OpenRouter balances across providers by price and uptime. Cheapest, but speed varies.',
  },
  latency: {
    label: 'Fastest replies',
    hint: 'Prefer providers with the lowest measured latency over the last few minutes.',
  },
  throughput: {
    label: 'Max throughput',
    hint: 'Prefer the highest tokens-per-second endpoints — best for long answers.',
  },
  pin: {
    label: 'Pin to provider',
    hint: 'Send every request to exactly one provider slug. Most consistent, no fallbacks.',
  },
}

interface SmtpView {
  host: string
  port: number
  secure: boolean
  user: string
  hasPass: boolean
  passHint: string
  from: string
  alsoNotify: string
  configured: boolean
}

interface SettingsView {
  hasKey: boolean
  keyHint: string
  keySource: 'settings' | 'env' | 'none'
  baseUrl: string
  defaultModel: string
  providerPin: string
  routingMode: RoutingMode
  encryptionAvailable: boolean
  encryptionSource: 'env' | 'file' | 'generated'
  encryptionFilePath: string | null
  smtp: SmtpView
}

export function SettingsPage() {
  const [view, setView] = useState<SettingsView | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [defaultModelInput, setDefaultModelInput] = useState('')
  const [providerPinInput, setProviderPinInput] = useState('')
  const [routingModeInput, setRoutingModeInput] = useState<RoutingMode>('auto')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpAlsoNotify, setSmtpAlsoNotify] = useState('')
  const [replacingSmtpPass, setReplacingSmtpPass] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SettingsView>('/api/admin/settings')
      setView(data)
      setBaseUrlInput(data.baseUrl)
      setDefaultModelInput(data.defaultModel)
      setProviderPinInput(data.providerPin)
      setRoutingModeInput(data.routingMode)
      setSmtpHost(data.smtp.host)
      setSmtpPort(String(data.smtp.port))
      setSmtpSecure(data.smtp.secure)
      setSmtpUser(data.smtp.user)
      setSmtpFrom(data.smtp.from)
      setSmtpAlsoNotify(data.smtp.alsoNotify)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to load settings')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    setSmtpTestResult('')
    try {
      const body: {
        apiKey?: string
        baseUrl?: string
        defaultModel?: string
        providerPin?: string
        routingMode?: RoutingMode
        smtp?: {
          host?: string
          port?: number
          secure?: boolean
          user?: string
          pass?: string
          from?: string
          alsoNotify?: string
        }
      } = {
        baseUrl: baseUrlInput,
        defaultModel: defaultModelInput,
        providerPin: providerPinInput,
        routingMode: routingModeInput,
        smtp: {
          host: smtpHost,
          port: Number(smtpPort) || 587,
          secure: smtpSecure,
          user: smtpUser,
          from: smtpFrom,
          alsoNotify: smtpAlsoNotify,
        },
      }
      if (replacing || view?.keySource === 'none') body.apiKey = apiKeyInput
      if ((replacingSmtpPass || !view?.smtp.hasPass) && smtpPass) {
        body.smtp = { ...body.smtp, pass: smtpPass }
      }
      const data = await apiFetch<SettingsView>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setView(data)
      setApiKeyInput('')
      setSmtpPass('')
      setReplacing(false)
      setReplacingSmtpPass(false)
      setProviderPinInput(data.providerPin)
      setRoutingModeInput(data.routingMode)
      setSmtpHost(data.smtp.host)
      setSmtpPort(String(data.smtp.port))
      setSmtpSecure(data.smtp.secure)
      setSmtpUser(data.smtp.user)
      setSmtpFrom(data.smtp.from)
      setSmtpAlsoNotify(data.smtp.alsoNotify)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function testSmtp() {
    setTestingSmtp(true)
    setSmtpTestResult('')
    setError('')
    try {
      const res = await apiFetch<{ ok: true; to: string }>('/api/admin/settings/smtp/test', {
        method: 'POST',
        body: '{}',
      })
      setSmtpTestResult(`Test email sent to ${res.to}`)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'SMTP test failed')
    } finally {
      setTestingSmtp(false)
    }
  }

  const connected = view?.hasKey ?? false
  const dirty =
    (baseUrlInput ?? '') !== (view?.baseUrl ?? '') ||
    (defaultModelInput ?? '') !== (view?.defaultModel ?? '') ||
    (providerPinInput ?? '') !== (view?.providerPin ?? '') ||
    routingModeInput !== (view?.routingMode ?? 'auto') ||
    smtpHost !== (view?.smtp.host ?? '') ||
    smtpPort !== String(view?.smtp.port ?? 587) ||
    smtpSecure !== (view?.smtp.secure ?? false) ||
    smtpUser !== (view?.smtp.user ?? '') ||
    smtpFrom !== (view?.smtp.from ?? '') ||
    smtpAlsoNotify !== (view?.smtp.alsoNotify ?? '') ||
    Boolean(smtpPass)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        One AI provider powers every chatbot on this installation.
      </p>

      <div className="mt-8 rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <KeyRound className="size-4 text-muted-foreground" />
          <h2 className="text-base font-medium">AI provider</h2>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              connected ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground/50'}`}
            />
            {!view
              ? 'Checking…'
              : connected
                ? `Connected via ${view.keySource === 'settings' ? 'stored key' : 'environment'}`
                : 'Not connected'}
          </span>
        </div>

        <div className="space-y-6 px-5 py-6">
          <div>
            <label htmlFor="apikey" className={labelClass}>
              API key
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {view?.keySource === 'settings'
                ? `Stored encrypted — ends in “${view.keyHint}”.`
                : view?.keySource === 'env'
                  ? 'Currently inherited from the OPENAI_API_KEY environment variable.'
                  : 'Any OpenAI-compatible key works: OpenAI, OpenRouter, Groq, Ollama…'}
            </p>
            <input
              id="apikey"
              type="password"
              autoComplete="off"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              disabled={connected && !replacing}
              placeholder={connected && !replacing ? '••••••••••••' : 'sk-…'}
              className={`${inputClass} mt-2.5 font-mono disabled:opacity-50`}
            />
            {connected && (
              <button
                type="button"
                onClick={() => setReplacing((r) => !r)}
                className="mt-2 text-[13px] font-medium text-primary transition-colors duration-150 hover:text-primary/80"
              >
                {replacing ? 'Cancel replace' : 'Replace stored key…'}
              </button>
            )}
          </div>

          <div className="border-t pt-5">
            <div className={labelClass}>Provider</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PROVIDER_PRESETS.map((p) => {
                const selected =
                  p.id === 'openai'
                    ? presetForBaseUrl(baseUrlInput) === undefined
                    : presetForBaseUrl(baseUrlInput)?.id === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setBaseUrlInput(p.baseUrl)}
                    aria-pressed={selected}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>

            <label htmlFor="baseurl" className="mt-4 block text-sm font-medium">
              Base URL
            </label>
            <input
              id="baseurl"
              type="url"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder={presetForBaseUrl(baseUrlInput)?.baseUrl || 'https://api.openai.com/v1'}
              className={`${inputClass} mt-1.5 font-mono`}
            />
            {presetForBaseUrl(baseUrlInput)?.hint && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {presetForBaseUrl(baseUrlInput)?.hint}
              </p>
            )}

            {presetForBaseUrl(baseUrlInput)?.id === 'openrouter' && (
              <>
                <div className="mt-4">
                  <div className={labelClass}>Routing</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    How OpenRouter picks the upstream provider that serves each request.
                  </p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {ROUTING_MODES.map((mode) => {
                      const selected = routingModeInput === mode
                      const meta = ROUTING_MODE_LABELS[mode]
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setRoutingModeInput(mode)}
                          aria-pressed={selected}
                          className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                            selected ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted'
                          }`}
                        >
                          <span
                            className={`block text-sm font-medium ${
                              selected ? 'text-primary' : 'text-foreground'
                            }`}
                          >
                            {meta.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                            {meta.hint}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {routingModeInput === 'pin' && (
                  <>
                    <label htmlFor="providerpin" className="mt-4 block text-sm font-medium">
                      Provider slug
                    </label>
                    <input
                      id="providerpin"
                      type="text"
                      autoComplete="off"
                      value={providerPinInput}
                      onChange={(e) => setProviderPinInput(e.target.value)}
                      placeholder="deepseek, deepinfra, google-vertex…"
                      className={`${inputClass} mt-1.5 font-mono`}
                    />
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                      Route every request to one specific provider for consistent speed (e.g.{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        deepseek
                      </code>
                      ,{' '}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        deepinfra
                      </code>
                      ). If that provider is unavailable requests fail rather than fall back.
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          <div className="border-t pt-5">
            <div className={labelClass}>Default model</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Used by every chatbot that doesn't have its own model selected. Bots without any model
              cannot answer visitors until one is configured here or on the bot. Contact forms need a
              tool-capable chat model.
            </p>
            <div className="mt-2.5">
              <ModelPicker
                model={defaultModelInput}
                onSelect={(id) => setDefaultModelInput(id)}
                emptyLabel="No default model set"
                clearLabel="No default (bots must pick a model)"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {view && !view.encryptionAvailable && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              ENCRYPTION_KEY is not set on the server — keys cannot be stored until it is.
            </p>
          )}
          {view?.encryptionAvailable && view.encryptionSource === 'generated' && (
            <p className="rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
              Keys are encrypted with a key generated on first launch and stored in the data volume
              ({view.encryptionFilePath}). No environment setup needed.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Check className="size-3.5" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={
                saving || (!replacing && !apiKeyInput && view?.keySource !== 'none' && !dirty)
              }
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-card shadow-sm">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <Mail className="size-4 text-muted-foreground" />
          <h2 className="text-base font-medium">Email notifications</h2>
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              view?.smtp.configured
                ? 'bg-success/10 text-success'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                view?.smtp.configured ? 'bg-success' : 'bg-muted-foreground/50'
              }`}
            />
            {view?.smtp.configured ? 'Configured' : 'Not configured'}
          </span>
        </div>

        <div className="space-y-5 px-5 py-6">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            When the bot offers a contact form and the visitor submits, assigned owners get an email
            with the details and chat context.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="smtphost" className={labelClass}>
                SMTP host
              </label>
              <input
                id="smtphost"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                placeholder="smtp.example.com"
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="smtpport" className={labelClass}>
                Port
              </label>
              <input
                id="smtpport"
                inputMode="numeric"
                value={smtpPort}
                onChange={(e) => setSmtpPort(e.target.value)}
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div className="flex items-end pb-2">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                  className="size-4 rounded border"
                />
                Use TLS (secure)
              </label>
            </div>
            <div>
              <label htmlFor="smtpuser" className={labelClass}>
                Username
              </label>
              <input
                id="smtpuser"
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div>
              <label htmlFor="smtppass" className={labelClass}>
                Password
              </label>
              <input
                id="smtppass"
                type="password"
                autoComplete="new-password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                disabled={Boolean(view?.smtp.hasPass) && !replacingSmtpPass}
                placeholder={
                  view?.smtp.hasPass && !replacingSmtpPass
                    ? `••••${view.smtp.passHint}`
                    : 'SMTP password'
                }
                className={`${inputClass} mt-1.5 disabled:opacity-50`}
              />
              {view?.smtp.hasPass && (
                <button
                  type="button"
                  onClick={() => setReplacingSmtpPass((r) => !r)}
                  className="mt-2 text-[13px] font-medium text-primary transition-colors duration-150 hover:text-primary/80"
                >
                  {replacingSmtpPass ? 'Cancel replace' : 'Replace password…'}
                </button>
              )}
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="smtpfrom" className={labelClass}>
                From address
              </label>
              <input
                id="smtpfrom"
                type="email"
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder="leads@youragency.com"
                className={`${inputClass} mt-1.5`}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="smtpalso" className={labelClass}>
                Also notify
              </label>
              <input
                id="smtpalso"
                type="email"
                value={smtpAlsoNotify}
                onChange={(e) => setSmtpAlsoNotify(e.target.value)}
                placeholder="agency@example.com (optional)"
                className={`${inputClass} mt-1.5`}
              />
              <p className="mt-1.5 text-[13px] text-muted-foreground">
                Optional CC for the agency. Assigned business owners always receive the email.
              </p>
            </div>
          </div>

          {smtpTestResult && (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{smtpTestResult}</p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={() => void testSmtp()}
              disabled={testingSmtp || !view?.smtp.configured}
              className="inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {testingSmtp && <LoaderCircle className="size-3.5 animate-spin" />}
              Send test email
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Keys and SMTP passwords are encrypted with AES-256-GCM before storage and never sent back to
        the browser — only a four-character hint is ever displayed.
      </p>
    </div>
  )
}
