import type { ChatbotAdminView } from '@sitelift/shared'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type AdminApiError, apiFetch } from '../lib/api'
import { inputClass } from '../lib/ui'

export function PlaygroundPage() {
  const navigate = useNavigate()
  const { bot } = useSearch({ strict: false }) as { bot?: string }
  const botId = bot ?? 'ch_demo'
  const onBotChange = (id: string) => navigate({ to: '/playground', search: { bot: id } })
  const [bots, setBots] = useState<ChatbotAdminView[]>([])
  const [copied, setCopied] = useState(false)
  const snippet = `<script src="${window.location.origin}/embed.js" data-chatbot-id="${botId}"></script>`

  useEffect(() => {
    apiFetch<{ chatbots: ChatbotAdminView[] }>('/api/admin/chatbots')
      .then((data) => setBots(data.chatbots))
      .catch((err: Error & { api?: AdminApiError }) => {
        void err
      })
  }, [])

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Playground</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Chat with your bot exactly as a website visitor would.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <label htmlFor="pg-bot" className="text-sm font-medium">
            Chatbot under test
          </label>
          <select
            id="pg-bot"
            value={botId}
            onChange={(e) => onBotChange(e.target.value)}
            className={`${inputClass} mt-1.5 mb-4`}
          >
            <option value="ch_demo">Demo Business (built-in)</option>
            {bots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <iframe
              key={botId}
              title="Widget playground"
              src={`/demo?chatbot=${botId}`}
              className="h-[640px] w-full border-0"
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-base font-medium">Embed snippet</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Paste this before{' '}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">&lt;/body&gt;</code>{' '}
              on any allowed client site.
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
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-base font-medium">Not answering?</h2>
            <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <li>· Connect an AI provider under Settings</li>
              <li>· The chatbot must be active (not paused)</li>
              <li>· Add this site's host to the chatbot's allowed domains</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
