import { PROVIDER_PRESETS, presetForBaseUrl } from '@sitelift/shared'
import { Check, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { ModelPicker } from '../components/chatbot/ModelPicker'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass, labelClass } from '../lib/ui'

interface SettingsView {
  hasKey: boolean
  keyHint: string
  keySource: 'settings' | 'env' | 'none'
  baseUrl: string
  defaultModel: string
  encryptionAvailable: boolean
  encryptionSource: 'env' | 'file' | 'generated'
  encryptionFilePath: string | null
}

export function SettingsPage() {
  const [view, setView] = useState<SettingsView | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [defaultModelInput, setDefaultModelInput] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<SettingsView>('/api/admin/settings')
      setView(data)
      setBaseUrlInput(data.baseUrl)
      setDefaultModelInput(data.defaultModel)
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
    try {
      const body: { apiKey?: string; baseUrl?: string; defaultModel?: string } = {
        baseUrl: baseUrlInput,
        defaultModel: defaultModelInput,
      }
      if (replacing || view?.keySource === 'none') body.apiKey = apiKeyInput
      const data = await apiFetch<SettingsView>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setView(data)
      setApiKeyInput('')
      setReplacing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setError(api?.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const connected = view?.hasKey ?? false
  const dirty =
    (baseUrlInput ?? '') !== (view?.baseUrl ?? '') ||
    (defaultModelInput ?? '') !== (view?.defaultModel ?? '')

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
          </div>

          <div className="border-t pt-5">
            <div className={labelClass}>Default model</div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Used by every chatbot that doesn't have its own model selected. Bots without any model
              cannot answer visitors until one is configured here or on the bot.
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

      <p className="mt-4 flex items-start gap-1.5 text-[13px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Keys are encrypted with AES-256-GCM before storage and never sent back to the browser — only
        a four-character hint is ever displayed.
      </p>
    </div>
  )
}
