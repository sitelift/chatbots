import { Check, KeyRound, LoaderCircle, Lock, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { type AdminApiError, apiFetch, getAdminToken, setAdminToken } from '../lib/api'

interface SettingsView {
  hasKey: boolean
  keyHint: string
  keySource: 'settings' | 'env' | 'none'
  baseUrl: string
  encryptionAvailable: boolean
}

const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

export function SettingsPage() {
  const [view, setView] = useState<SettingsView | null>(null)
  const [needsToken, setNeedsToken] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await apiFetch<SettingsView>('/api/admin/settings')
      setView(data)
      setBaseUrlInput(data.baseUrl)
      setNeedsToken(false)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      if (api?.status === 401) {
        setNeedsToken(true)
        if (getAdminToken()) setTokenError('That token does not match ADMIN_TOKEN.')
      } else if (api?.status === 503) {
        setNeedsToken(true)
        setTokenError('ADMIN_TOKEN is not set on the server — add it to .env first.')
      } else {
        setError(api?.message ?? 'Failed to load settings')
      }
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function unlock(e: React.FormEvent) {
    e.preventDefault()
    setTokenError('')
    setAdminToken(tokenInput.trim())
    setTokenInput('')
    void load()
  }

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const body: { apiKey?: string; baseUrl?: string } = { baseUrl: baseUrlInput }
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

  if (needsToken) {
    return (
      <div className="mx-auto flex max-w-md flex-col px-6 pt-24">
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="grid size-10 place-items-center rounded-full bg-primary/10">
            <Lock className="size-4.5 text-primary" />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Admin access</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Paste the{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">ADMIN_TOKEN</code> from
            your server's{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.env</code> file. It is
            stored only in this browser.
          </p>
          <form className="mt-5 flex gap-2" onSubmit={unlock}>
            <input
              data-autofocus
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Admin token"
              className={inputClass}
            />
            <button
              type="submit"
              className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Unlock
            </button>
          </form>
          {tokenError && <p className="mt-2.5 text-sm text-destructive">{tokenError}</p>}
        </div>
      </div>
    )
  }

  const connected = view?.hasKey ?? false

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        One AI provider powers every chatbot on this installation.
      </p>

      <div className="mt-8 overflow-hidden rounded-xl border bg-card shadow-sm">
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
            <label htmlFor="apikey" className="text-sm font-medium">
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
            <label htmlFor="baseurl" className="text-sm font-medium">
              Base URL <span className="font-normal text-muted-foreground">· optional</span>
            </label>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Leave empty for OpenAI. Point at OpenRouter, Groq, a local Ollama, or any compatible
              endpoint.
            </p>
            <input
              id="baseurl"
              type="url"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className={`${inputClass} mt-2.5 font-mono`}
            />
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

          <div className="flex items-center justify-end gap-3 border-t pt-4">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-success">
                <Check className="size-3.5" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (!replacing && !apiKeyInput && view?.keySource !== 'none')}
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
