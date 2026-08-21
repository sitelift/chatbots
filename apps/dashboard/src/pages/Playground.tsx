import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

const DEMO_CHATBOT_ID = 'ch_demo'

export function PlaygroundPage() {
  const [copied, setCopied] = useState(false)
  const snippet = `<script src="${window.location.origin}/embed.js" data-chatbot-id="${DEMO_CHATBOT_ID}"></script>`

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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-lg border bg-card">
          <iframe
            title="Widget playground"
            src={`/demo?chatbot=${DEMO_CHATBOT_ID}`}
            className="h-[640px] w-full border-0"
          />
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="text-base font-medium">Embed snippet</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Paste this before <code className="font-mono text-xs">&lt;/body&gt;</code> on any
              allowed client site.
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

          <div className="rounded-lg border bg-card p-5">
            <h2 className="text-base font-medium">Not answering?</h2>
            <ul className="mt-2 space-y-2 text-[13px] leading-relaxed text-muted-foreground">
              <li>· Connect an AI provider under Settings</li>
              <li>· The chatbot must be active (not paused)</li>
              <li>· This demo allows every domain — real bots check their allowlist</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
