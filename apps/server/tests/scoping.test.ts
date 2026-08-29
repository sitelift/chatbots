import type { Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { clientAssignments, user } from '../src/db/schema'
import { createApp } from '../src/index'
import {
  DEMO_CHATBOT_ID,
  resetUsers,
  seedDemoChatbot,
  setDefaultModel,
  setJsonCompletionContent,
  signUpUser,
  startMockProvider,
  type TestUser,
} from './helpers'

let agency: TestUser
let clientA: TestUser
let otherBotId = ''
let mockProvider: Server

beforeAll(async () => {
  seedDemoChatbot()
  resetUsers()
  agency = await signUpUser('Owner')
  clientA = await signUpUser('Client A')

  const [clientRow] = db.select().from(user).where(eq(user.email, clientA.email)).all()
  if (clientRow) {
    db.insert(clientAssignments)
      .values({ userId: clientRow.id, chatbotId: DEMO_CHATBOT_ID })
      .onConflictDoNothing()
      .run()
  }

  const created = await createApp().request('/api/admin/chatbots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
    body: JSON.stringify({ name: 'Other Biz' }),
  })
  otherBotId = ((await created.json()) as { id: string }).id

  setDefaultModel('test-mini')
  mockProvider = await startMockProvider()
})

afterAll(() => {
  mockProvider?.close()
})

async function asClient(path: string, init?: RequestInit): Promise<Response> {
  return createApp().request(path, {
    ...init,
    headers: { Cookie: clientA.cookie, ...(init?.headers ?? {}) },
  })
}

describe('ownership-scoped chatbot access', () => {
  it('lets clients list only their assigned bots', async () => {
    const res = await asClient('/api/admin/chatbots')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { chatbots: Array<{ id: string }> }
    expect(body.chatbots.map((c) => c.id)).toEqual([DEMO_CHATBOT_ID])
  })

  it('still shows the agency everything', async () => {
    const res = await createApp().request('/api/admin/chatbots', {
      headers: { Cookie: agency.cookie },
    })
    const body = (await res.json()) as { chatbots: Array<{ id: string }> }
    const ids = body.chatbots.map((c) => c.id)
    expect(ids).toContain(DEMO_CHATBOT_ID)
    expect(ids).toContain(otherBotId)
  })

  it('reads an assigned bot but not another tenant bot', async () => {
    const ok = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}`)
    expect(ok.status).toBe(200)

    const denied = await asClient(`/api/admin/chatbots/${otherBotId}`)
    expect(denied.status).toBe(404)
  })

  it('edits knowledge/greeting/appearance on own bots', async () => {
    const res = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        welcomeMessage: 'Hello there!',
        brandColor: '#0088ff',
        facts: { overview: 'We sell balloons.' },
      }),
    })
    expect(res.status).toBe(200)
    const view = (await res.json()) as {
      welcomeMessage: string
      brandColor: string
      systemPrompt: string
    }
    expect(view.welcomeMessage).toBe('Hello there!')
    expect(view.brandColor).toBe('#0088ff')
    expect(view.systemPrompt).toContain('We sell balloons.')
  })

  it('silently ignores agency-only fields on client updates', async () => {
    const res = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hacked Name',
        status: 'paused',
        model: 'evil-model',
        allowedDomains: ['evil.example'],
        systemPrompt: 'malicious prompt',
        websiteUrl: 'https://evil.example',
        baseUrl: 'https://evil.example/v1',
      }),
    })
    expect(res.status).toBe(200)
    const view = (await res.json()) as {
      name: string
      status: string
      model: string | null
      allowedDomains: string[]
      systemPrompt: string
      websiteUrl: string | null
      baseUrl: string | null
    }
    expect(view.name).not.toBe('Hacked Name')
    expect(view.status).toBe('active')
    expect(view.model).toBeNull()
    expect(view.allowedDomains).toEqual([])
    expect(view.systemPrompt).not.toBe('malicious prompt')
    expect(view.websiteUrl).toBeNull()
    expect(view.baseUrl).toBeNull()
  })

  it('cannot update someone else’s bot', async () => {
    const res = await asClient(`/api/admin/chatbots/${otherBotId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ welcomeMessage: 'Nope' }),
    })
    expect(res.status).toBe(404)
  })

  it('clears own facts via explicit null', async () => {
    const clear = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facts: null }),
    })
    expect(clear.status).toBe(200)
    const cleared = (await clear.json()) as { facts: unknown; systemPrompt: string }
    expect(cleared.facts).toBeNull()
    expect(cleared.systemPrompt).toBe('')

    const restore = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ welcomeMessage: 'Hi! How can I help?', facts: { overview: '' } }),
    })
    expect(restore.status).toBe(200)
  })

  it('cannot create or delete chatbots', async () => {
    const create = await asClient('/api/admin/chatbots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Sneaky Bot' }),
    })
    expect(create.status).toBe(403)

    const del = await asClient(`/api/admin/chatbots/${otherBotId}`, { method: 'DELETE' })
    expect(del.status).toBe(403)
  })
})

describe('scoping on stats, leads, conversations and test', () => {
  it('serves leads/stats/conversations for assigned bots only', async () => {
    const leads = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/leads`)
    expect(leads.status).toBe(200)
    expect(((await leads.json()) as { leads: unknown[] }).leads).toEqual([])

    const stats = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/stats`)
    expect(stats.status).toBe(200)
    const statsBody = (await stats.json()) as { windowDays: number }
    expect(statsBody.windowDays).toBeGreaterThan(0)

    const convs = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/conversations`)
    expect(convs.status).toBe(200)
    expect(
      Array.isArray(((await convs.json()) as { conversations: unknown[] }).conversations),
    ).toBe(true)

    const deniedLeads = await asClient(`/api/admin/chatbots/${otherBotId}/leads`)
    expect(deniedLeads.status).toBe(404)

    const deniedStats = await asClient(`/api/admin/chatbots/${otherBotId}/stats`)
    expect(deniedStats.status).toBe(404)

    const deniedConvs = await asClient(`/api/admin/chatbots/${otherBotId}/conversations`)
    expect(deniedConvs.status).toBe(404)

    const deniedThread = await asClient(
      `/api/admin/chatbots/${otherBotId}/conversations/cv_anything`,
    )
    expect(deniedThread.status).toBe(404)
  })

  it('serves draft-facts testing for assigned bots only', async () => {
    setJsonCompletionContent('Hello!')
    const ok = await asClient(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hi', facts: { overview: 'Balloon shop.' } }),
    })
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { reply: string }).reply).toBe('Hello!')
    setJsonCompletionContent('')

    const denied = await asClient(`/api/admin/chatbots/${otherBotId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hi', facts: { overview: 'X' } }),
    })
    expect(denied.status).toBe(404)
  })
})

describe('agency-only surfaces reject clients', () => {
  it('blocks client management endpoints', async () => {
    const [clientRow] = db.select().from(user).where(eq(user.email, clientA.email)).all()

    const list = await asClient('/api/admin/clients')
    expect(list.status).toBe(403)

    const assign = await asClient(`/api/admin/clients/${clientRow?.id}/chatbots`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatbotIds: [otherBotId] }),
    })
    expect(assign.status).toBe(403)
  })

  it('blocks settings, models and import', async () => {
    const getSettings = await asClient('/api/admin/settings')
    expect(getSettings.status).toBe(403)

    const putSettings = await asClient('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-steal' }),
    })
    expect(putSettings.status).toBe(403)

    const models = await asClient('/api/admin/models?baseUrl=https://api.openai.com/v1')
    expect(models.status).toBe(403)

    const importRes = await asClient('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    expect(importRes.status).toBe(403)
  })
})

describe('GET /api/admin/stats scoping', () => {
  it('aggregates across every chatbot for the agency', async () => {
    const res = await createApp().request('/api/admin/stats', {
      headers: { Cookie: agency.cookie },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      chatbotsTotal: number
      chatbotsActive: number
      conversations: number
      leads: number
      messages: number
    }
    expect(body.chatbotsTotal).toBeGreaterThanOrEqual(2)
    expect(body.chatbotsActive).toBeLessThanOrEqual(body.chatbotsTotal)
    expect(body.conversations).toBeGreaterThanOrEqual(0)
    expect(body.leads).toBeGreaterThanOrEqual(0)
    expect(body.messages).toBeGreaterThanOrEqual(0)
  })

  it('counts only assigned bots for clients', async () => {
    const res = await asClient('/api/admin/stats')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      chatbotsTotal: number
      conversations: number
    }
    expect(body.chatbotsTotal).toBe(1)
  })

  it('serves zeros for unassigned clients', async () => {
    resetUsers()
    await signUpUser('Reowner')
    const loneClient = await signUpUser('Lone Client')

    const res = await createApp().request('/api/admin/stats', {
      headers: { Cookie: loneClient.cookie },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      chatbotsTotal: number
      chatbotsActive: number
      conversations: number
      leads: number
      messages: number
    }
    expect(body).toEqual({
      chatbotsTotal: 0,
      chatbotsActive: 0,
      conversations: 0,
      leads: 0,
      messages: 0,
    })
  })
})
