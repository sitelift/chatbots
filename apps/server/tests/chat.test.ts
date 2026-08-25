import type { Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { messages } from '../src/db/schema'
import { createApp } from '../src/index'
import { DEMO_CHATBOT_ID, seedDemoChatbot, setStreamContent, startMockProvider } from './helpers'

let mockProvider: Server

beforeAll(async () => {
  seedDemoChatbot()
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
