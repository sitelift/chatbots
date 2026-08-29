import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { chatbots, conversations, messages } from '../src/db/schema'
import { createApp } from '../src/index'
import { DEMO_CHATBOT_ID, resetUsers, seedDemoChatbot, signUpUser, type TestUser } from './helpers'

let agency: TestUser
const BOT_ID = 'ch_inbox'

function headers() {
  return { Cookie: agency.cookie }
}

function seedConversation(options: {
  id: string
  visitorName?: string
  visitorEmail?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}): void {
  const base = Date.now()
  db.insert(conversations)
    .values({
      id: options.id,
      chatbotId: BOT_ID,
      visitorId: `visitor_${options.id}`,
      visitorName: options.visitorName ?? null,
      visitorEmail: options.visitorEmail ?? null,
      createdAt: new Date(base),
    })
    .run()
  for (const [i, m] of options.messages.entries()) {
    db.insert(messages)
      .values({
        id: `${options.id}_msg_${i}`,
        conversationId: options.id,
        role: m.role,
        content: m.content,
        createdAt: new Date(base + (i + 1) * 1000),
      })
      .run()
  }
}

beforeAll(async () => {
  seedDemoChatbot()
  resetUsers()
  agency = await signUpUser('Agency')
  db.insert(chatbots).values({ id: BOT_ID, name: 'Inbox Bot' }).onConflictDoNothing().run()
  db.delete(messages).where(eq(messages.conversationId, 'cv_inbox_lead')).run()
  db.delete(messages).where(eq(messages.conversationId, 'cv_inbox_anon')).run()
  db.delete(conversations).where(eq(conversations.chatbotId, BOT_ID)).run()

  seedConversation({
    id: 'cv_inbox_lead',
    visitorName: 'Maria',
    visitorEmail: 'maria@test.dev',
    messages: [
      { role: 'user', content: 'My AC is warm' },
      { role: 'assistant', content: 'Sorry about that — can I take your details?' },
    ],
  })
  seedConversation({
    id: 'cv_inbox_anon',
    messages: [{ role: 'user', content: 'What are your hours?' }],
  })
})

afterAll(() => {
  db.delete(conversations).where(eq(conversations.chatbotId, BOT_ID)).run()
  db.delete(chatbots).where(eq(chatbots.id, BOT_ID)).run()
})

describe('GET /api/admin/chatbots/:id/conversations', () => {
  it('lists all conversations by default', async () => {
    const res = await createApp().request(`/api/admin/chatbots/${BOT_ID}/conversations`, {
      headers: headers(),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      conversations: Array<{ id: string; isLead: boolean; lastMessage: string }>
    }
    expect(body.conversations).toHaveLength(2)
    expect(body.conversations.map((c) => c.id).sort()).toEqual(['cv_inbox_anon', 'cv_inbox_lead'])
    const lead = body.conversations.find((c) => c.id === 'cv_inbox_lead')
    expect(lead?.isLead).toBe(true)
    expect(lead?.lastMessage).toBe('Sorry about that — can I take your details?')
    const anon = body.conversations.find((c) => c.id === 'cv_inbox_anon')
    expect(anon?.isLead).toBe(false)
  })

  it('filters to leads only', async () => {
    const res = await createApp().request(
      `/api/admin/chatbots/${BOT_ID}/conversations?filter=leads`,
      { headers: headers() },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { conversations: Array<{ id: string }> }
    expect(body.conversations.map((c) => c.id)).toEqual(['cv_inbox_lead'])
  })

  it('404s unknown chatbots', async () => {
    const res = await createApp().request('/api/admin/chatbots/ch_nope/conversations', {
      headers: headers(),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/chatbots/:id/conversations/:conversationId', () => {
  it('returns the full ordered thread', async () => {
    const res = await createApp().request(
      `/api/admin/chatbots/${BOT_ID}/conversations/cv_inbox_lead`,
      { headers: headers() },
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      id: string
      visitorName: string | null
      visitorEmail: string | null
      isLead: boolean
      messages: Array<{ role: string; content: string }>
    }
    expect(body.id).toBe('cv_inbox_lead')
    expect(body.visitorName).toBe('Maria')
    expect(body.visitorEmail).toBe('maria@test.dev')
    expect(body.isLead).toBe(true)
    expect(body.messages).toEqual([
      {
        id: 'cv_inbox_lead_msg_0',
        role: 'user',
        content: 'My AC is warm',
        createdAt: expect.any(String),
      },
      {
        id: 'cv_inbox_lead_msg_1',
        role: 'assistant',
        content: 'Sorry about that — can I take your details?',
        createdAt: expect.any(String),
      },
    ])
  })

  it('404s when the conversation is missing or on another bot', async () => {
    const missing = await createApp().request(
      `/api/admin/chatbots/${BOT_ID}/conversations/cv_missing`,
      { headers: headers() },
    )
    expect(missing.status).toBe(404)

    const wrongBot = await createApp().request(
      `/api/admin/chatbots/${DEMO_CHATBOT_ID}/conversations/cv_inbox_lead`,
      { headers: headers() },
    )
    expect(wrongBot.status).toBe(404)
  })
})
