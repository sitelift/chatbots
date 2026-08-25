import { Bot, ChevronDown, LoaderCircle, Send, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { type FormState, splitList } from './state'

export const WIDGET = {
  bg: '#ffffff',
  ink: '#18181b',
} as const

export function isColorLight(hex: string): boolean {
  const m = hex.replace('#', '')
  const full =
    m.length === 3
      ? m
          .split('')
          .map((c) => c + c)
          .join('')
      : m
  if (full.length !== 6) return false
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.7
}

export interface WidgetMessage {
  id: string
  role: 'user' | 'bot'
  text: string
}

export function WidgetSim({
  form,
  messages,
  busy,
  open,
  onToggleOpen,
  input,
  onInput,
  onSend,
  interactive = true,
}: {
  form: FormState
  messages: WidgetMessage[]
  busy: boolean
  open: boolean
  onToggleOpen: () => void
  input: string
  onInput: (value: string) => void
  onSend: (text?: string) => void
  interactive?: boolean
}) {
  const brand = form.brandColor || WIDGET.ink
  const onBrand = isColorLight(brand) ? WIDGET.ink : WIDGET.bg
  const name = form.name.trim() || 'Your bot'
  const quickReplies = splitList(form.quickReplies)
  const showWelcome = messages.length === 0 && !busy
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el && (messages.length > 0 || busy)) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, busy])

  return (
    <div className="relative h-[560px] overflow-hidden rounded-xl border bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label={`${open ? 'Close' : 'Open'} chat with ${name}`}
        style={{ background: brand, color: onBrand }}
        className="absolute bottom-6 right-6 grid size-14 place-items-center rounded-full shadow-xl transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {open ? <X className="size-6" /> : <Bot className="size-6" />}
      </button>

      {open && (
        <div
          className="absolute bottom-[104px] right-6 flex h-[420px] w-[340px] flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl ring-1 ring-black/5"
          style={{ '--sl-brand': brand } as React.CSSProperties}
        >
          <div
            className={`flex items-center gap-3 ${
              !form.showLogo && !form.showName && !form.showOnlineStatus
                ? 'pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-2'
                : 'border-b border-[#f1f1f3] px-4 py-3.5'
            }`}
          >
            {form.showLogo && (
              <div
                className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold"
                style={{ background: `${brand}22`, color: brand }}
              >
                {form.avatarUrl.trim() ? (
                  <img src={form.avatarUrl.trim()} alt="" className="size-full object-cover" />
                ) : (
                  name.slice(0, 1).toUpperCase()
                )}
              </div>
            )}
            {(form.showName || form.showOnlineStatus) && (
              <div className="min-w-0 flex-1">
                {form.showName && (
                  <p className="truncate text-[15px] font-semibold text-[#111113]">{name}</p>
                )}
                {form.showOnlineStatus && (
                  <p className="flex items-center gap-1.5 text-xs text-[#8f8f96]">
                    <span className="size-1.5 rounded-full bg-[#34c759]" /> Online now
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              aria-label="Close chat"
              onClick={onToggleOpen}
              className="pointer-events-auto ml-auto grid size-7 place-items-center rounded-full text-[#a5a5ad] transition-colors duration-150 hover:bg-[#f4f4f5] hover:text-[#52525b]"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>

          <div
            ref={scrollRef}
            className={`flex-1 space-y-3 overflow-y-auto bg-white px-4 ${
              !form.showLogo && !form.showName && !form.showOnlineStatus ? 'pb-4 pt-[11px]' : 'py-4'
            }`}
          >
            {showWelcome && form.welcomeMessage && (
              <div className="text-sm leading-relaxed text-[#3a3a40]">{form.welcomeMessage}</div>
            )}
            {showWelcome && quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((chip) =>
                  interactive ? (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => onSend(chip)}
                      className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[13px] text-[#3f3f46] transition-colors duration-150 hover:border-[color-mix(in_srgb,var(--sl-brand)_45%,#ffffff)] hover:text-[var(--sl-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {chip}
                    </button>
                  ) : (
                    <span
                      key={chip}
                      className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[13px] text-[#3f3f46]"
                    >
                      {chip}
                    </span>
                  ),
                )}
              </div>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[84%] whitespace-pre-wrap text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'ml-auto rounded-2xl rounded-br-md px-3 py-2 text-[#232326]'
                    : 'text-[#3a3a40]'
                }`}
                style={m.role === 'user' ? { background: `${brand}1c` } : undefined}
              >
                {m.text}
              </div>
            ))}
            {busy && (
              <div className="inline-flex gap-1 p-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-1.5 animate-bounce rounded-full bg-[#c9c9cf]"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            )}
          </div>

          {form.poweredBy && (
            <p className="pb-1.5 text-center text-[11px] text-[#b3b3ba]">Powered by SiteLift</p>
          )}

          <div className="flex items-center gap-2 border-t border-[#f1f1f3] px-3 py-2.5">
            <input
              aria-label="Test message"
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && interactive) onSend()
              }}
              placeholder="Write a message…"
              disabled={!interactive}
              className="flex-1 rounded-xl bg-[#f4f4f5] px-3.5 py-2.5 text-sm text-[#18181b] outline-none placeholder:text-[#a5a5ad] focus-visible:ring-2 disabled:opacity-60"
              style={
                {
                  '--tw-ring-color': brand,
                } as React.CSSProperties
              }
            />
            <button
              type="button"
              aria-label="Send message"
              onClick={() => onSend()}
              disabled={!interactive || busy || !input.trim()}
              style={{ background: brand, color: onBrand }}
              className="grid size-9 shrink-0 place-items-center rounded-full transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40 disabled:hover:scale-100"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
