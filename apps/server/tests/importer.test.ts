import type { Server } from 'node:http'
import { importRequestSchema } from '@sitelift/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { chatbots, conversations, messages } from '../src/db/schema'
import { createApp } from '../src/index'
import { htmlToText, isPrivateIp } from '../src/services/importer'
import {
  DEMO_CHATBOT_ID,
  getLastCompletionMessages,
  resetUsers,
  seedDemoChatbot,
  setJsonCompletionContent,
  signUpUser,
  startMockProvider,
  startMockSite,
  startMockSiteRoutes,
  type TestUser,
} from './helpers'

let agency: TestUser
let provider: Server
let site: Server

const SITE_HTML = `<!doctype html>
<html><head><title>Acme HVAC</title></head>
<body>
<nav>Home About Contact</nav>
<h1>Acme HVAC Company</h1>
<p>Family-owned air conditioning company in Austin since 1998.</p>
<ul>
  <li>AC repair</li>
  <li>Installation</li>
  <li>Seasonal tune-ups</li>
</ul>
<footer>Copyright</footer>
</body></html>`

const FACTS_JSON = JSON.stringify({
  overview: 'Family-owned air conditioning company in Austin since 1998.',
  services: 'AC repair, Installation, Seasonal tune-ups',
  hours: '',
})

beforeAll(async () => {
  seedDemoChatbot()
  resetUsers()
  agency = await signUpUser('Owner')
  provider = await startMockProvider()
  site = await startMockSite(SITE_HTML)
})

afterAll(() => {
  provider?.close()
  site?.close()
})

const headers = () => ({ 'Content-Type': 'application/json', Cookie: agency.cookie })

describe('importer utilities', () => {
  it('classifies private IPs', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('10.0.0.1')).toBe(true)
    expect(isPrivateIp('192.168.1.1')).toBe(true)
    expect(isPrivateIp('172.16.0.1')).toBe(true)
    expect(isPrivateIp('169.254.0.1')).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
    expect(isPrivateIp('1.1.1.1')).toBe(false)
    expect(isPrivateIp('::1')).toBe(true)
  })

  it('normalizes scheme-less import URLs to https', () => {
    expect(importRequestSchema.parse({ url: 'acme.com' }).url).toBe('https://acme.com')
    expect(importRequestSchema.parse({ url: 'acme.com/pricing' }).url).toBe(
      'https://acme.com/pricing',
    )
    expect(importRequestSchema.parse({ url: '  acme.com  ' }).url).toBe('https://acme.com')
  })

  it('keeps explicit schemes and rejects non-URLs', () => {
    expect(importRequestSchema.parse({ url: 'https://acme.com' }).url).toBe('https://acme.com')
    expect(importRequestSchema.parse({ url: 'http://acme.com' }).url).toBe('http://acme.com')
    expect(importRequestSchema.safeParse({ url: 'not a url' }).success).toBe(false)
    expect(importRequestSchema.safeParse({ url: '' }).success).toBe(false)
  })

  it('extracts readable text from HTML', () => {
    const text = htmlToText(SITE_HTML)
    expect(text).toContain('Family-owned air conditioning company')
    expect(text).toContain('AC repair')
    expect(text).not.toContain('<nav>')
    expect(text).not.toContain('Home About Contact')
    expect(text).not.toContain('Copyright')
  })
})

describe('POST /api/admin/import', () => {
  it('imports facts from a website through the LLM', async () => {
    setJsonCompletionContent(FACTS_JSON)
    const res = await createApp().request('/api/admin/import', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ url: `http://127.0.0.1:4110/` }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.facts.overview).toContain('Family-owned')
    expect(body.facts.services).toContain('AC repair')
    expect(body.facts.hours).toBeUndefined()
  })

  it('rejects malformed URLs', async () => {
    const res = await createApp().request('/api/admin/import', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ url: 'not a url' }),
    })
    expect(res.status).toBe(400)
  })

  it('crawls same-origin pages and feeds their combined text to the LLM', async () => {
    const routes = {
      '/': '<html><body><a href="/about">About</a><a href="/services">Services</a><h1>Home</h1></body></html>',
      '/about': '<html><body><h1>About Us</h1><p>Family-owned since 1998.</p></body></html>',
      '/services': '<html><body><h1>Services</h1><p>AC repair and installations.</p></body></html>',
    }
    const multiPageSite = await startMockSiteRoutes(routes, 4111)
    try {
      setJsonCompletionContent(FACTS_JSON)
      const res = await createApp().request('/api/admin/import', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ url: 'http://127.0.0.1:4111/' }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).source).toContain('127.0.0.1:4111')
      const combined = getLastCompletionMessages()
        .map((m) => m.content)
        .join('\n')
      expect(combined).toContain('Family-owned since 1998.')
      expect(combined).toContain('AC repair and installations.')
      expect(combined).toContain('[Page 2]')
    } finally {
      multiPageSite?.close()
    }
  })

  it('does not crawl links to other hosts or junk paths', async () => {
    const routes = {
      '/': '<html><body><a href="https://evil.example/">Evil</a><a href="/login">Login</a><a href="/about">About</a><h1>Home</h1></body></html>',
      '/about': '<html><body><h1>About</h1><p>Real content.</p></body></html>',
    }
    const multiPageSite = await startMockSiteRoutes(routes, 4112)
    try {
      setJsonCompletionContent(FACTS_JSON)
      const res = await createApp().request('/api/admin/import', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ url: 'http://127.0.0.1:4112/' }),
      })
      expect(res.status).toBe(200)
      const combined = getLastCompletionMessages()
        .map((m) => m.content)
        .join('\n')
      expect(combined).toContain('Real content.')
      expect(combined).not.toContain('evil.example')
    } finally {
      multiPageSite?.close()
    }
  })

  it('requires authentication', async () => {
    const res = await createApp().request('/api/admin/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/chatbots/:id/test', () => {
  it('answers from supplied facts without persisting', async () => {
    setJsonCompletionContent('We are open Mon-Fri 8am-6pm.')
    const res = await createApp().request(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/test`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        content: 'What are your hours?',
        facts: { hours: 'Mon-Fri 8am-6pm' },
      }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).reply).toBe('We are open Mon-Fri 8am-6pm.')
  })

  it('rejects empty facts', async () => {
    const res = await createApp().request(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/test`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ content: 'Hi', facts: {} }),
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/admin/chatbots/:id/leads', () => {
  it('returns empty leads for a fresh chatbot', async () => {
    const res = await createApp().request(`/api/admin/chatbots/${DEMO_CHATBOT_ID}/leads`, {
      headers: headers(),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).leads).toEqual([])
  })

  it('404s unknown chatbots', async () => {
    const res = await createApp().request('/api/admin/chatbots/ch_nope/leads', {
      headers: headers(),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/admin/chatbots/:id/stats', () => {
  const STATS_CHATBOT_ID = 'ch_stats'

  afterAll(() => {
    db.delete(conversations).where(eq(conversations.chatbotId, STATS_CHATBOT_ID)).run()
    db.delete(chatbots).where(eq(chatbots.id, STATS_CHATBOT_ID)).run()
  })

  function seedConversation(options: {
    id: string
    daysAgo: number
    visitorName?: string
    visitorEmail?: string
    messageCount?: number
  }): void {
    const createdAt = new Date()
    createdAt.setHours(12, 0, 0, 0)
    createdAt.setDate(createdAt.getDate() - options.daysAgo)
    db.insert(conversations)
      .values({
        id: options.id,
        chatbotId: STATS_CHATBOT_ID,
        visitorId: `visitor_${options.id}`,
        visitorName: options.visitorName ?? null,
        visitorEmail: options.visitorEmail ?? null,
        createdAt,
      })
      .run()
    for (let i = 0; i < (options.messageCount ?? 0); i += 1) {
      db.insert(messages)
        .values({
          id: `${options.id}_msg_${i}`,
          conversationId: options.id,
          role: 'user',
          content: `message ${i}`,
          createdAt,
        })
        .run()
    }
  }

  beforeAll(() => {
    db.insert(chatbots)
      .values({ id: STATS_CHATBOT_ID, name: 'Stats Bot' })
      .onConflictDoNothing()
      .run()
    seedConversation({ id: 'cv_stats_1', daysAgo: 0, visitorName: 'Maria', messageCount: 3 })
    seedConversation({ id: 'cv_stats_2', daysAgo: 0, messageCount: 1 })
    seedConversation({
      id: 'cv_stats_3',
      daysAgo: 3,
      visitorEmail: 'sam@test.dev',
      messageCount: 2,
    })
    seedConversation({ id: 'cv_stats_4', daysAgo: 40, visitorName: 'Outside window' })
  })

  it('404s unknown chatbots', async () => {
    const res = await createApp().request('/api/admin/chatbots/ch_nope/stats', {
      headers: headers(),
    })
    expect(res.status).toBe(404)
  })

  function keyForDaysAgo(daysAgo: number): string {
    const date = new Date()
    date.setHours(12, 0, 0, 0)
    date.setDate(date.getDate() - daysAgo)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate(),
    ).padStart(2, '0')}`
  }

  it('buckets conversations, leads and messages into daily totals', async () => {
    const res = await createApp().request(`/api/admin/chatbots/${STATS_CHATBOT_ID}/stats`, {
      headers: headers(),
    })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.windowDays).toBe(30)
    expect(body.days).toHaveLength(30)

    const byDate = new Map<string, { conversations: number; leads: number; messages: number }>(
      body.days.map((day: { date: string } & Record<string, number>) => [day.date, day]),
    )
    expect(byDate.get(keyForDaysAgo(0))).toMatchObject({
      conversations: 2,
      leads: 1,
      messages: 4,
    })
    expect(byDate.get(keyForDaysAgo(3))).toMatchObject({
      conversations: 1,
      leads: 1,
      messages: 2,
    })
    const quietBucket = byDate.get(keyForDaysAgo(15))
    expect(quietBucket).toMatchObject({ conversations: 0, leads: 0, messages: 0 })

    expect(body.totals.conversations).toBe(3)
    expect(body.totals.leads).toBe(2)
    expect(body.totals.conversionRate).toBeCloseTo(2 / 3, 5)
    expect(body.totals.avgMessagesPerConversation).toBeCloseTo(2, 5)
  })

  it('clamps the requested window between 1 and 90 days', async () => {
    const res = await createApp().request(
      `/api/admin/chatbots/${STATS_CHATBOT_ID}/stats?days=500`,
      {
        headers: headers(),
      },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.windowDays).toBe(90)
    expect(body.days).toHaveLength(90)
  })
})
