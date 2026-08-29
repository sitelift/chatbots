import type { Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { conversations, messages } from '../src/db/schema'
import { createApp } from '../src/index'
import { insertMessage } from '../src/services/conversations'
import {
  clearCompletionBodies,
  DEMO_CHATBOT_ID,
  getCompletionBodies,
  seedDemoChatbot,
  setDefaultModel,
  setMidStreamError,
  setStreamContent,
  startMockProvider,
} from './helpers'

let mockProvider: Server

beforeAll(async () => {
  seedDemoChatbot()
  setDefaultModel('test-mini')
  mockProvider = await startMockProvider()
})

afterAll(() => {
  mockProvider?.close()
})

const payload = {
  visitorId: 'visitor_test_0001',
  content: 'What are your hours?',
}

describe('POST /api/chat/:id/messages/stream', () => {
  it('streams meta, tokens and done, and persists the reply', async () => {
    const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify(payload),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const raw = await res.text()
    const events = raw
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        const event = frame.match(/^event: (.+)$/m)?.[1]
        const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? '{}')
        return { event, data }
      })

    expect(events[0]?.event).toBe('meta')
    expect(events[0]?.data.conversationId).toMatch(/^cv_/)

    const tokens = events.filter((e) => e.event === 'token')
    expect(tokens.map((t) => t.data.text).join('')).toBe('Hello world')

    const done = events.at(-1)
    expect(done?.event).toBe('done')
    expect(done?.data.reply).toBe('Hello world')

    const [persisted] = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, done?.data.conversationId))
      .all()
      .filter((m) => m.role === 'assistant')

    expect(persisted?.content).toBe('Hello world')
    expect(persisted?.completionTokens).toBe(3)
  })
})

describe('POST /api/chat/:id/messages', () => {
  it('returns the full reply as JSON', async () => {
    const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reply).toBe('Hello world')
    expect(body.conversationId).toMatch(/^cv_/)
  })
})

describe('JSON-wrapped model replies', () => {
  it('unwraps a JSON reply and persists plain text', async () => {
    setStreamContent('{"pricing":"Around $2k to $5k."}')
    const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const raw = await res.text()
    const done = raw
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        const event = frame.match(/^event: (.+)$/m)?.[1]
        const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? '{}')
        return { event, data }
      })
      .at(-1)

    expect(done?.event).toBe('done')
    expect(done?.data.reply).toBe('Around $2k to $5k.')

    const [persisted] = db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, done?.data.conversationId))
      .all()
      .filter((m) => m.role === 'assistant')

    expect(persisted?.content).toBe('Around $2k to $5k.')
    setStreamContent('')
  })
})

describe('upstream mid-stream errors', () => {
  it('emits an error frame and persists no assistant reply', async () => {
    setMidStreamError('Provider disconnected unexpectedly')
    try {
      const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
        body: JSON.stringify(payload),
      })
      expect(res.status).toBe(200)

      const events = (await res.text())
        .split('\n\n')
        .filter(Boolean)
        .map((frame) => ({
          event: frame.match(/^event: (.+)$/m)?.[1],
          data: JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? '{}'),
        }))

      expect(events.at(-1)?.event).toBe('error')
      expect(events.some((e) => e.event === 'token')).toBe(true)

      const conversationId = events[0]?.data.conversationId as string
      const persisted = db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .all()
      expect(persisted.every((m) => m.role === 'user')).toBe(true)
    } finally {
      setMidStreamError('')
    }
  })
})

describe('context window', () => {
  it('sends the most recent messages, not the oldest', async () => {
    db.delete(messages).where(eq(messages.conversationId, 'cv_history_test_01')).run()
    db.delete(conversations).where(eq(conversations.id, 'cv_history_test_01')).run()
    const [conv] = db
      .insert(conversations)
      .values({
        id: 'cv_history_test_01',
        chatbotId: DEMO_CHATBOT_ID,
        visitorId: 'visitor_hist_01',
      })
      .returning()
      .all()
    for (let i = 1; i <= 25; i++) {
      insertMessage(
        conv?.id,
        i % 2 === 1 ? 'user' : 'assistant',
        `turn-${i}`,
        undefined,
        `msg_h${i}`,
      )
    }

    clearCompletionBodies()
    const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, conversationId: conv?.id }),
    })
    expect(res.status).toBe(200)
    await res.text()

    const mine = getCompletionBodies()
      .map((b) => b.body.messages as { role: string; content: string }[])
      .find((msgs) => msgs?.some((m) => m.content === 'turn-25'))
    expect(mine).toBeDefined()
    expect(mine?.length).toBe(21)
    expect(mine?.[0]?.role).toBe('system')
    expect(mine?.[1]?.content).toBe('turn-7')
    expect(mine?.at(-2)?.content).toBe('turn-25')
    expect(mine?.at(-1)?.content).toBe(payload.content)
    expect(mine?.filter((m) => m.content === payload.content).length).toBe(1)
  }, 15_000)
})

describe('public chatbot meta', () => {
  it('exposes widget settings with defaults', async () => {
    const res = await createApp().request(`/api/chatbots/${DEMO_CHATBOT_ID}`)
    expect(res.status).toBe(200)
    const meta = await res.json()
    expect(meta.name).toBe('Demo Business')
    expect(meta.showLogo).toBe(true)
    expect(meta.showName).toBe(true)
    expect(meta.showOnlineStatus).toBe(true)
    expect(meta.poweredBy).toBe(true)
  })

  it('404s unknown or paused chatbots', async () => {
    const res = await createApp().request('/api/chatbots/ch_nope')
    expect(res.status).toBe(404)
  })
})

describe('guardrails', () => {
  it('rejects invalid payloads', async () => {
    const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: 'short', content: '' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_CONTENT')
  })

  it('404s unknown chatbots', async () => {
    const res = await createApp().request('/api/chat/ch_nope/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(404)
  })

  it('enforces per-visitor rate limits', async () => {
    const app = createApp()
    const visitor = { ...payload, visitorId: 'visitor_flood_001' }
    let lastStatus = 200
    for (let i = 0; i < 25; i++) {
      const res = await app.request(`/api/chat/${DEMO_CHATBOT_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(visitor),
      })
      lastStatus = res.status
      if (res.status === 429) break
    }
    expect(lastStatus).toBe(429)
  })
})
