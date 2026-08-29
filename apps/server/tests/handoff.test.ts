import type { Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { chatbots, conversations, handoffs } from '../src/db/schema'
import { createApp } from '../src/index'
import { setMailTransportForTests } from '../src/services/mailer'
import { saveSmtpSettings } from '../src/services/settings'
import {
  resetUsers,
  setBaseUrl,
  setDefaultModel,
  setStreamContent,
  setStreamToolCall,
  signUpUser,
  startMockProvider,
} from './helpers'

const BOT_ID = 'ch_handoff_suite'

let mockProvider: Server
const sentMails: Array<{ to: string; subject: string; text: string }> = []

beforeAll(async () => {
  setDefaultModel('test-mini')
  setBaseUrl('http://127.0.0.1:4107/v1')
  db.insert(chatbots)
    .values({
      id: BOT_ID,
      name: 'Handoff Suite Bot',
      systemPrompt: 'You are a helpful assistant.',
      status: 'active',
    })
    .onConflictDoNothing()
    .run()
  mockProvider = await startMockProvider(4107)
})

afterAll(() => {
  mockProvider?.close()
  setMailTransportForTests(null)
  db.delete(handoffs).run()
  db.delete(conversations).where(eq(conversations.chatbotId, BOT_ID)).run()
  db.delete(chatbots).where(eq(chatbots.id, BOT_ID)).run()
})

beforeEach(() => {
  sentMails.length = 0
  setMailTransportForTests({
    sendMail: async (options) => {
      sentMails.push({
        to: options.to,
        subject: options.subject,
        text: options.text,
      })
      return {}
    },
  })
  setStreamContent('')
  db.delete(handoffs).where(eq(handoffs.chatbotId, BOT_ID)).run()
  db.delete(conversations).where(eq(conversations.chatbotId, BOT_ID)).run()
})

describe('offer_handoff streaming', () => {
  it('emits a handoff SSE frame and creates a pending handoff', async () => {
    setStreamToolCall('offer_handoff', {
      reason: 'Visitor wants a kitchen remodel quote',
      intro: 'Leave your details and we will follow up.',
      fields: [
        { id: 'name', type: 'name', label: 'Your name', required: true },
        { id: 'email', type: 'email', label: 'Email' },
        { id: 'timing', type: 'text', label: 'When do you want to start?' },
      ],
    })

    const res = await createApp().request(`/api/chat/${BOT_ID}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({
        visitorId: 'visitor_handoff_001',
        content: 'Can someone call me about a remodel?',
      }),
    })

    expect(res.status).toBe(200)
    const raw = await res.text()
    const events = raw
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        const event = frame.match(/^event: (.+)$/m)?.[1]
        const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? '{}')
        return { event, data }
      })

    const handoff = events.find((e) => e.event === 'handoff')
    expect(handoff?.data.handoffId).toMatch(/^ho_/)
    expect(handoff?.data.fields.some((f: { type: string }) => f.type === 'email')).toBe(true)

    const row = db
      .select()
      .from(handoffs)
      .where(eq(handoffs.id, handoff?.data.handoffId as string))
      .get()
    expect(row?.reason).toBe('Visitor wants a kitchen remodel quote')
    expect(row?.submittedAt).toBeNull()
  })
})

describe('POST /api/chat/:id/handoff', () => {
  it('submits answers, stores the lead, emails also-notify once, and rejects resubmit', async () => {
    resetUsers()
    const agency = await signUpUser('Agency')

    saveSmtpSettings({
      host: 'smtp.test',
      port: 587,
      secure: false,
      user: 'mailer',
      pass: 'secret-pass',
      from: 'leads@agency.test',
      alsoNotify: agency.email,
    })

    setStreamToolCall('offer_handoff', {
      reason: 'Wants a callback about pricing',
      intro: 'Share your contact info',
      fields: [
        { id: 'name', type: 'name', label: 'Name', required: true },
        { id: 'email', type: 'email', label: 'Email' },
      ],
    })

    const streamRes = await createApp().request(`/api/chat/${BOT_ID}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({
        visitorId: 'visitor_handoff_002',
        content: 'Please have someone call me',
      }),
    })
    const streamRaw = await streamRes.text()
    const events = streamRaw
      .split('\n\n')
      .filter(Boolean)
      .map((frame) => {
        const event = frame.match(/^event: (.+)$/m)?.[1]
        const data = JSON.parse(frame.match(/^data: (.+)$/m)?.[1] ?? '{}')
        return { event, data }
      })
    const handoffEvent = events.find((e) => e.event === 'handoff')
    const conversationId = events.find((e) => e.event === 'meta')?.data.conversationId as string

    expect(conversationId).toMatch(/^cv_/)
    expect(handoffEvent?.data.handoffId).toBeTruthy()

    const submit = await createApp().request(`/api/chat/${BOT_ID}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({
        conversationId,
        visitorId: 'visitor_handoff_002',
        handoffId: handoffEvent?.data.handoffId,
        answers: { name: 'Maria Lopez', email: 'maria@example.com' },
      }),
    })
    expect(submit.status).toBe(200)
    expect(await submit.json()).toEqual({ ok: true })

    const conv = db.select().from(conversations).where(eq(conversations.id, conversationId)).get()
    expect(conv?.visitorName).toBe('Maria Lopez')
    expect(conv?.visitorEmail).toBe('maria@example.com')

    await new Promise((r) => setTimeout(r, 40))
    expect(sentMails.length).toBe(1)
    expect(sentMails[0]?.to).toContain(agency.email)
    expect(sentMails[0]?.subject).toContain('Maria Lopez')
    expect(sentMails[0]?.text).toContain('Wants a callback about pricing')

    const again = await createApp().request(`/api/chat/${BOT_ID}/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({
        conversationId,
        visitorId: 'visitor_handoff_002',
        handoffId: handoffEvent?.data.handoffId,
        answers: { name: 'Maria Lopez', email: 'maria@example.com' },
      }),
    })
    expect(again.status).toBe(409)
    expect(sentMails.length).toBe(1)
  })
})
