import { KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { type AdminApiError, apiFetch, getAdminToken, setAdminToken } from '../lib/api'

interface SettingsView {
  hasKey: boolean
  keyHint: string
  keySource: 'settings' | 'env' | 'none'
  baseUrl: string
  encryptionAvailable: boolean
}

export function SettingsPage() {
  const [view, setView] = useState<SettingsView | null>(null)
  const [needsToken, setNeedsToken] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
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
      if (api?.status === 401 || api?.status === 503) setNeedsToken(true)
      else setError(api?.message ?? 'Failed to load settings')
    }
  }, [])

  useEffect(() => {
    if (getAdminToken()) void load()
    else setNeedsToken(true)
  }, [load])

  async function save() {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const body: { apiKey?: string; baseUrl?: string } = { baseUrl: baseUrlInput }
      if (replacing || !view?.hasKey) body.apiKey = apiKeyInput
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
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <h2 className="text-base font-medium">Admin access</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Enter the <code className="font-mono text-xs">ADMIN_TOKEN</code> value from your
            server's <code className="font-mono text-xs">.env</code> to unlock settings. It stays in
            this browser.
          </p>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setAdminToken(tokenInput.trim())
              setTokenInput('')
              void load()
            }}
          >
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Admin token"
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90"
            >
              Unlock
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        One AI provider powers every chatbot on this installation.
      </p>

      <div className="mt-8 rounded-lg border bg-card">
        <div className="flex items-center gap-2.5 border-b px-5 py-4">
          <KeyRound className="size-4 text-muted-foreground" />
          <h2 className="text-base font-medium">AI provider</h2>
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${
              view?.hasKey ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            }`}
          >
            {!view ? '…' : view.hasKey ? `Connected · ${view.keySource}` : 'Not connected'}
          </span>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <label htmlFor="apikey" className="text-sm font-medium">
              API key
            </label>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {view?.keySource === 'settings'
                ? `Stored encrypted · ends in ${view.keyHint}`
                : view?.keySource === 'env'
                  ? 'Currently provided by the OPENAI_API_KEY environment variable'
                  : 'Any OpenAI-compatible key — OpenAI, OpenRouter, Groq, Ollama…'}
            </p>
            <input
              id="apikey"
              type="password"
              autoComplete="off"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              disabled={Boolean(view?.hasKey) && !replacing}
              placeholder={view?.hasKey && !replacing ? '••••••••••••' : 'sk-…'}
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:outline-none disabled:opacity-60"
            />
            {view?.hasKey && (
              <button
                type="button"
                onClick={() => setReplacing((r) => !r)}
                className="mt-1.5 text-[13px] font-medium text-primary hover:underline"
              >
                {replacing ? 'Cancel' : 'Replace key'}
              </button>
            )}
          </div>

          <div>
            <label htmlFor="baseurl" className="text-sm font-medium">
              Base URL <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Leave empty for OpenAI. Point at OpenRouter, Groq, a local Ollama, or any compatible
              endpoint.
            </p>
            <input
              id="baseurl"
              type="url"
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:outline-none"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm text-success">Saved.</p>}
          {view && !view.encryptionAvailable && (
            <p className="text-sm text-warning">
              ENCRYPTION_KEY is not set on the server — keys cannot be stored until it is.
            </p>
          )}

          <div className="flex justify-end border-t pt-4">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || (!replacing && !apiKeyInput && !view?.hasKey)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            >
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              Save changes
            </button>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        Keys are encrypted with AES-256-GCM before storage and never sent back to the browser — only
        a four-character hint is shown.
      </p>
    </div>
  )
}
