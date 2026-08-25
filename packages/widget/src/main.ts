interface WidgetConfig {
  chatbotId: string
  endpoint: string
  position: 'bottom-right' | 'bottom-left'
}

interface ChatbotMeta {
  id: string
  name: string
  welcomeMessage: string
  brandColor: string
  avatarUrl: string | null
  quickReplies: string[]
  showLogo: boolean
  showName: boolean
  showOnlineStatus: boolean
  poweredBy: boolean
}

interface StoredIds {
  conversationId?: string
  visitorId: string
}

const PANEL_WIDTH = 400

function readConfig(): WidgetConfig | null {
  const script = document.currentScript as HTMLScriptElement | null
  const chatbotId = script?.dataset.chatbotId
  if (!chatbotId) return null
  return {
    chatbotId,
    endpoint: script?.dataset.endpoint ?? '',
    position: (script?.dataset.position as WidgetConfig['position']) ?? 'bottom-right',
  }
}

function loadIds(chatbotId: string): StoredIds {
  const key = `sitelift:${chatbotId}`
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as StoredIds
  } catch {}
  const ids: StoredIds = { visitorId: `v_${crypto.randomUUID()}` }
  localStorage.setItem(key, JSON.stringify(ids))
  return ids
}

function saveConversationId(chatbotId: string, conversationId: string): void {
  const key = `sitelift:${chatbotId}`
  const ids = loadIds(chatbotId)
  localStorage.setItem(key, JSON.stringify({ ...ids, conversationId }))
}

function isColorLight(hex: string): boolean {
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

function styles(): string {
  return `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    .bubble {
      position: fixed; bottom: 22px; width: 54px; height: 54px; border-radius: 9999px;
      background: var(--sl-brand); color: var(--sl-on-brand); border: none; cursor: pointer;
      display: grid; place-items: center; z-index: 2147483000;
      transition: transform 160ms cubic-bezier(0.25, 1, 0.5, 1);
      box-shadow: 0 2px 6px rgba(0,0,0,0.10), 0 12px 28px rgba(0,0,0,0.16);
    }
    .bubble:hover { transform: scale(1.06); }
    .bubble:focus-visible { outline: 2px solid var(--sl-brand); outline-offset: 3px; }
    .bubble svg { width: 24px; height: 24px; }
    .panel {
      position: fixed; bottom: 90px; width: min(${PANEL_WIDTH}px, calc(100vw - 32px));
      height: min(560px, calc(100vh - 130px));
      border-radius: 20px; background: #ffffff; color: #18181b;
      display: flex; flex-direction: column; overflow: hidden; z-index: 2147483001;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.04), 0 12px 32px rgba(0,0,0,0.10), 0 28px 68px rgba(0,0,0,0.14);
      transform-origin: bottom right;
      animation: sl-open 260ms cubic-bezier(0.34, 1.4, 0.64, 1);
    }
    .panel.closing { animation: sl-close 140ms cubic-bezier(0.25, 1, 0.5, 1) forwards; }
    @keyframes sl-open { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: none; } }
    @keyframes sl-close { to { opacity: 0; transform: translateY(10px) scale(0.96); } }
    .header {
      display: flex; align-items: center; gap: 11px; padding: 15px 14px 15px 18px;
      background: #ffffff; border-bottom: 1px solid #f1f1f3; flex-shrink: 0;
    }
    .header.bare {
      position: absolute; top: 0; left: 0; right: 0; z-index: 1;
      padding: 8px 10px 0; background: transparent; border-bottom: none;
      pointer-events: none;
    }
    .header.bare .minimize { pointer-events: auto; }
    .header.bare + .messages { padding-top: 12px; }
    .avatar {
      width: 36px; height: 36px; border-radius: 9999px; overflow: hidden; flex-shrink: 0;
      background: color-mix(in srgb, var(--sl-brand) 13%, #ffffff);
      color: var(--sl-brand); display: grid; place-items: center;
      font-weight: 600; font-size: 15px;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .who { flex: 1; min-width: 0; }
    .title { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; color: #111113; }
    .subtitle { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #8f8f96; margin-top: 1px; }
    .presence { width: 7px; height: 7px; border-radius: 9999px; background: #34c759; flex-shrink: 0; }
    .minimize {
      width: 30px; height: 30px; margin-left: auto; border-radius: 9999px; border: none; background: transparent;
      color: #a5a5ad; cursor: pointer; display: grid; place-items: center; flex-shrink: 0;
      transition: background 140ms ease-out, color 140ms ease-out;
    }
    .minimize:hover { background: #f4f4f5; color: #52525b; }
    .minimize:focus-visible { outline: 2px solid var(--sl-brand); outline-offset: 2px; }
    .messages { flex: 1; overflow-y: auto; padding: 18px; display: flex; flex-direction: column; gap: 13px; background: #ffffff; scrollbar-width: thin; scrollbar-color: #e4e4e7 transparent; }
    .messages::-webkit-scrollbar { width: 5px; }
    .messages::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 9999px; }
    .msg { font-size: 14px; line-height: 1.55; word-break: break-word; animation: sl-rise 200ms cubic-bezier(0.25, 1, 0.5, 1); }
    @keyframes sl-rise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
    .msg.bot { color: #3a3a40; padding: 1px 2px; }
    .msg.bot p { margin: 0 0 8px; }
    .msg.bot p:last-child { margin-bottom: 0; }
    .msg.bot ul, .msg.bot ol { margin: 2px 0 8px; padding-left: 20px; }
    .msg.bot li { margin: 2px 0; }
    .msg.bot code { background: #f4f4f5; border-radius: 5px; padding: 1px 5px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .msg.bot a { color: var(--sl-brand); text-decoration: underline; text-underline-offset: 2px; }
    .msg.bot hr { border: none; border-top: 1px solid #e4e4e7; margin: 8px 0; }
    .msg.user {
      align-self: flex-end; max-width: 84%; padding: 9px 13px;
      background: color-mix(in srgb, var(--sl-brand) 11%, #ffffff);
      border-radius: 16px 16px 5px 16px; color: #232326; white-space: pre-wrap;
    }
    .caret { display: inline-block; width: 2px; height: 14px; background: var(--sl-brand); vertical-align: -2px; margin-left: 2px; border-radius: 1px; animation: sl-blink 800ms steps(1) infinite; }
    @keyframes sl-blink { 50% { opacity: 0; } }
    .dots { display: inline-flex; gap: 4px; padding: 6px 2px; }
    .dots i { width: 6px; height: 6px; border-radius: 9999px; background: #c9c9cf; animation: sl-dot 1100ms ease-in-out infinite; }
    .dots i:nth-child(2) { animation-delay: 150ms; }
    .dots i:nth-child(3) { animation-delay: 300ms; }
    @keyframes sl-dot { 0%, 60%, 100% { transform: none; opacity: 0.55; } 30% { transform: translateY(-4px); opacity: 1; } }
    .chips { display: flex; flex-wrap: wrap; gap: 7px; animation: sl-rise 200ms cubic-bezier(0.25, 1, 0.5, 1); }
    .chip {
      border: 1px solid #e4e4e7; background: #ffffff; color: #3f3f46; border-radius: 9999px;
      padding: 6px 13px; font-size: 13px; cursor: pointer;
      transition: border-color 140ms ease-out, color 140ms ease-out, background 140ms ease-out;
    }
    .chip:hover { border-color: color-mix(in srgb, var(--sl-brand) 45%, #ffffff); color: var(--sl-brand); }
    .chip:focus-visible { outline: 2px solid var(--sl-brand); outline-offset: 2px; }
    .composer { display: flex; align-items: center; gap: 9px; padding: 12px 14px; border-top: 1px solid #f1f1f3; background: #ffffff; flex-shrink: 0; }
    .input {
      flex: 1; border: 1px solid transparent; background: #f4f4f5; border-radius: 12px;
      padding: 10px 14px; font-size: 14px; outline: none; color: #18181b;
      transition: background 140ms ease-out, border-color 140ms ease-out, box-shadow 140ms ease-out;
    }
    .input::placeholder { color: #a5a5ad; }
    .input:focus-visible { background: #ffffff; border-color: var(--sl-brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sl-brand) 14%, transparent); }
    .send {
      width: 38px; height: 38px; border-radius: 9999px; border: none; cursor: pointer; flex-shrink: 0;
      background: var(--sl-brand); color: var(--sl-on-brand); display: grid; place-items: center;
      transition: transform 150ms cubic-bezier(0.25, 1, 0.5, 1), opacity 140ms ease-out;
    }
    .send:hover { transform: scale(1.06); }
    .send:focus-visible { outline: 2px solid var(--sl-brand); outline-offset: 2px; }
    .send:disabled { opacity: 0.45; cursor: default; transform: none; }
    .powered { text-align: center; font-size: 11px; color: #b3b3ba; padding: 0 0 9px; background: #ffffff; }
    .msg.error {
      align-self: flex-start; max-width: 92%; padding: 10px 14px; border-radius: 12px;
      font-size: 13px; line-height: 1.45; color: #b3261e; background: #fef2f2;
    }
    @media (max-width: 480px) {
      .panel { right: 12px !important; left: 12px !important; width: auto; height: calc(100vh - 110px); }
      .bubble { bottom: 16px; }
      .panel { bottom: 84px; }
    }
  `
}

class SiteLiftWidget {
  private config: WidgetConfig
  private meta: ChatbotMeta | null = null
  private root: ShadowRoot
  private panel: HTMLDivElement | null = null
  private messagesEl: HTMLDivElement | null = null
  private inputEl: HTMLInputElement | null = null
  private sendEl: HTMLButtonElement | null = null
  private open = false
  private busy = false
  private bubbleEl: HTMLButtonElement | null = null

  constructor(config: WidgetConfig) {
    this.config = config
    this.root = document.createElement('div').attachShadow({ mode: 'open' })
    document.body.appendChild(this.root.host)
    void this.init()
  }

  private async init(): Promise<void> {
    let meta: ChatbotMeta | null = null
    try {
      const res = await fetch(`${this.config.endpoint}/api/chatbots/${this.config.chatbotId}`)
      meta = res.ok ? ((await res.json()) as ChatbotMeta) : null
    } catch {
      meta = null
    }
    if (!meta) return
    this.meta = meta

    const brand = meta.brandColor || '#18181b'
    const onBrand = isColorLight(brand) ? '#18181b' : '#ffffff'
    ;(this.root.host as HTMLElement).style.cssText =
      `position:fixed;z-index:2147483000;--sl-brand:${brand};--sl-on-brand:${onBrand};`
    const style = document.createElement('style')
    style.textContent = styles()
    this.root.appendChild(style)

    const bubble = document.createElement('button')
    bubble.className = 'bubble'
    bubble.setAttribute('aria-label', `Chat with ${meta.name}`)
    bubble.innerHTML = CHAT_ICON
    bubble.addEventListener('click', () => this.toggle())
    this.root.appendChild(bubble)
    this.bubbleEl = bubble
  }

  private toggle(): void {
    if (this.open) this.close()
    else this.openPanel()
  }

  private openPanel(): void {
    if (!this.meta) return
    this.open = true
    const side = this.config.position === 'bottom-left' ? 'left' : 'right'
    const panel = document.createElement('div')
    panel.className = 'panel'
    panel.style[side] = '20px'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', `Chat with ${this.meta.name}`)
    const bare = !this.meta.showLogo && !this.meta.showName && !this.meta.showOnlineStatus
    panel.innerHTML = `
      <div class="header${bare ? ' bare' : ''}">
        ${this.meta.showLogo ? `<div class="avatar">${this.meta.avatarUrl ? `<img src="${this.meta.avatarUrl}" alt="">` : escapeHtml(this.meta.name.slice(0, 1).toUpperCase())}</div>` : ''}
        ${
          this.meta.showName || this.meta.showOnlineStatus
            ? `
        <div class="who">
          ${this.meta.showName ? `<div class="title">${escapeHtml(this.meta.name)}</div>` : ''}
          ${this.meta.showOnlineStatus ? '<div class="subtitle"><span class="presence"></span>Online now</div>' : ''}
        </div>`
            : ''
        }
        <button class="minimize" aria-label="Close chat">${CHEVRON_ICON}</button>
      </div>
      <div class="messages" aria-live="polite"></div>
      <div class="composer">
        <input class="input" type="text" placeholder="Write a message…" aria-label="Message">
        <button class="send" aria-label="Send message">${SEND_ICON}</button>
      </div>
      ${this.meta.poweredBy ? '<div class="powered">Powered by SiteLift</div>' : ''}
    `
    this.root.appendChild(panel)
    this.panel = panel
    this.messagesEl = panel.querySelector('.messages')
    this.inputEl = panel.querySelector('.input')
    this.sendEl = panel.querySelector('.send')

    panel.querySelector('.minimize')?.addEventListener('click', () => this.close())
    this.sendEl?.addEventListener('click', () => void this.send())
    this.inputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void this.send()
      }
    })
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close()
    })

    this.addBotMessage(this.meta.welcomeMessage)
    if (this.meta.quickReplies.length > 0) this.renderChips(this.meta.quickReplies)
    this.inputEl?.focus()
  }

  private close(): void {
    const panel = this.panel
    if (!panel) return
    this.open = false
    panel.classList.add('closing')
    setTimeout(() => {
      panel.remove()
      if (this.panel === panel) {
        this.panel = null
        this.messagesEl = null
        this.inputEl = null
        this.sendEl = null
      }
    }, 140)
    this.bubbleEl?.focus()
  }

  private addUserMessage(text: string): void {
    const el = document.createElement('div')
    el.className = 'msg user'
    el.textContent = text
    this.messagesEl?.appendChild(el)
    this.scrollDown()
  }

  private addBotMessage(text: string): HTMLDivElement {
    const el = document.createElement('div')
    el.className = 'msg bot'
    el.textContent = text
    this.messagesEl?.appendChild(el)
    this.scrollDown()
    return el
  }

  private renderChips(chips: string[]): void {
    const wrap = document.createElement('div')
    wrap.className = 'chips'
    for (const chip of chips) {
      const btn = document.createElement('button')
      btn.className = 'chip'
      btn.textContent = chip
      btn.addEventListener('click', () => {
        wrap.remove()
        void this.send(chip)
      })
      wrap.appendChild(btn)
    }
    this.messagesEl?.appendChild(wrap)
    this.scrollDown()
  }

  private scrollDown(): void {
    requestAnimationFrame(() => {
      if (this.messagesEl) this.messagesEl.scrollTop = this.messagesEl.scrollHeight
    })
  }

  private setBusy(busy: boolean): void {
    this.busy = busy
    if (this.sendEl) this.sendEl.disabled = busy
  }

  private async send(preset?: string): Promise<void> {
    if (this.busy || !this.meta || !this.inputEl) return
    const content = (preset ?? this.inputEl.value).trim()
    if (!content) return
    if (!preset && this.inputEl) this.inputEl.value = ''

    this.addUserMessage(content)
    this.setBusy(true)

    const ids = loadIds(this.config.chatbotId)
    const botBubble = this.addBotMessage('')
    botBubble.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'

    let reply = ''
    let textNode: Text | null = null
    let caret: HTMLSpanElement | null = null

    try {
      const res = await fetch(
        `${this.config.endpoint}/api/chat/${this.config.chatbotId}/messages/stream`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: ids.conversationId,
            visitorId: ids.visitorId,
            content,
          }),
        },
      )

      if (!res.ok || !res.body) {
        let code = ''
        try {
          code = ((await res.json()) as { error?: { code?: string } }).error?.code ?? ''
        } catch {}
        throw new Error(code || `HTTP ${res.status}`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''

        for (const frame of frames) {
          const eventName = frame.match(/^event: (.+)$/m)?.[1]
          const dataRaw = frame.match(/^data: (.+)$/m)?.[1]
          if (!eventName || !dataRaw) continue
          const data = JSON.parse(dataRaw) as Record<string, string>

          if (eventName === 'meta' && data.conversationId) {
            saveConversationId(this.config.chatbotId, data.conversationId)
          } else if (eventName === 'token') {
            if (!textNode) {
              textNode = document.createTextNode('')
              caret = document.createElement('span')
              caret.className = 'caret'
              botBubble.replaceChildren(textNode, caret)
            }
            reply += data.text ?? ''
            textNode.data = reply
            this.scrollDown()
          } else if (eventName === 'error') {
            throw new Error(data.code ?? 'AI_PROVIDER_ERROR')
          }
        }
      }

      const clean = unwrapReply(reply) ?? reply
      botBubble.innerHTML = clean ? renderMarkdown(clean) : 'Sorry, I could not answer that.'
    } catch (err) {
      botBubble.textContent = friendlyError(err)
      botBubble.classList.add('error')
    } finally {
      this.setBusy(false)
      this.inputEl?.focus()
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function unwrapReply(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of ['answer', 'reply', 'text', 'content']) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) return value
    }
    const keys = Object.keys(parsed)
    if (keys.length === 1) {
      const value = parsed[keys[0]!]
      if (typeof value === 'string') return value
    }
  } catch {}
  return null
}

function renderInline(src: string): string {
  const saved: string[] = []
  let html = escapeHtml(src)
  html = html.replace(/`([^`]+)`/g, (_m, code) => {
    saved.push(`<code>${code}</code>`)
    return `\uE000${saved.length - 1}\uE000`
  })
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|tel:[^\s)]+)\)/g,
    (_m, label, url) => {
      saved.push(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`)
      return `\uE000${saved.length - 1}\uE000`
    },
  )
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  return html.replace(/\uE000(\d+)\uE000/g, (_m, i) => saved[Number(i)] ?? '')
}

function renderMarkdown(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (!list) return
    const items = list.items.map((item) => `<li>${renderInline(item)}</li>`).join('')
    blocks.push(`<${list.tag}>${items}</${list.tag}>`)
    list = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') {
      flushList()
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed)
    if (heading) {
      flushList()
      const level = heading[1]!.length
      const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5'
      blocks.push(`<${tag}>${renderInline(heading[2]!)}</${tag}>`)
      continue
    }
    if (/^(?:---+|\*\*\*+)$/.test(trimmed)) {
      flushList()
      blocks.push('<hr>')
      continue
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed)
    const numbered = /^\d+[.)]\s+(.+)$/.exec(trimmed)
    if (bullet || numbered) {
      const tag = bullet ? 'ul' : 'ol'
      if (!list || list.tag !== tag) {
        flushList()
        list = { tag, items: [] }
      }
      list.items.push((bullet?.[1] ?? numbered![1]!).trim())
      continue
    }
    flushList()
    const content = renderInline(trimmed)
    blocks.push(`<p>${content}</p>`)
  }
  flushList()
  return blocks.join('')
}

function friendlyError(err: unknown): string {
  const code = err instanceof Error ? err.message : ''
  switch (code) {
    case 'AI_KEY_NOT_CONFIGURED':
      return 'This assistant is not connected to an AI provider yet. The site owner needs to add an API key in their dashboard.'
    case 'TOO_MANY_REQUESTS':
      return 'You are sending messages a little too quickly — please wait a moment and try again.'
    case 'FORBIDDEN_ORIGIN':
      return 'This chat is not available on this website.'
    default:
      return 'Sorry — something went wrong reaching the assistant. Please try again in a moment.'
  }
}

const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
const SEND_ICON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`
const CHEVRON_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`

const config = readConfig()
if (config) new SiteLiftWidget(config)
