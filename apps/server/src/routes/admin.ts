import {
  type BusinessFacts,
  type ChatbotAdminView,
  type ClientUserView,
  chatbotInputSchema,
  chatbotTestSchema,
  clientUserViewSchema,
  composeSystemPrompt,
  importRequestSchema,
  unwrapJsonReply,
} from '@sitelift/shared'
import { and, desc, eq, gte, inArray, isNotNull, or } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import {
  chatbots,
  clientAssignments,
  conversations,
  messages,
  user as userTable,
} from '../db/schema'
import { newId } from '../lib/ids'
import { logger } from '../lib/logger'
import { CatalogError, fetchModelCatalog } from '../lib/modelCatalog'
import { requireRole } from '../lib/session'
import { extractBusinessFacts, fetchSiteText, ImportError } from '../services/importer'
import { completePlain } from '../services/provider'
import {
  getAdminSettingsView,
  getDefaultModel,
  resolveModel,
  resolveProviderCredentials,
  SettingsError,
  saveApiKey,
  saveBaseUrl,
  saveDefaultModel,
} from '../services/settings'

export const adminRoutes = new Hono()

adminRoutes.use('*', requireRole('agency'))

function toView(row: typeof chatbots.$inferSelect): ChatbotAdminView {
  return {
    id: row.id,
    name: row.name,
    websiteUrl: row.websiteUrl,
    welcomeMessage: row.welcomeMessage,
    brandColor: row.brandColor,
    avatarUrl: row.avatarUrl,
    quickReplies: row.quickReplies,
    showLogo: row.showLogo,
    showName: row.showName,
    showOnlineStatus: row.showOnlineStatus,
    poweredBy: row.poweredBy,
    systemPrompt: row.systemPrompt,
    model: row.model,
    baseUrl: row.baseUrl,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    status: row.status,
    allowedDomains: row.allowedDomains,
    facts: parseFacts(row.factsJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function parseFacts(raw: string | null): BusinessFacts | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as BusinessFacts
  } catch {
    return null
  }
}

type FactsInput = Partial<z.infer<typeof chatbotInputSchema>>

function resolvePrompt(input: FactsInput): string {
  if (input.facts) return composeSystemPrompt(input.facts)
  return input.systemPrompt ?? ''
}

function serializeFacts(input: FactsInput): string | null | undefined {
  if (input.facts === null) return null
  if (input.facts) return JSON.stringify(input.facts)
  return undefined
}

function settingsError(c: Context, err: unknown) {
  if (err instanceof SettingsError) {
    return c.json({ error: { code: err.code, message: err.message } }, 400)
  }
  logger.error({ err }, 'admin request failed')
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500)
}

adminRoutes.get('/chatbots', async (c) => {
  const rows = await db.query.chatbots.findMany()
  const sorted = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return c.json({ chatbots: sorted.map(toView) })
})

adminRoutes.post('/chatbots', async (c) => {
  const parsed = chatbotInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
        },
      },
      400,
    )
  }
  const input = parsed.data
  const now = new Date()
  const row = {
    id: newId('chatbot'),
    name: input.name,
    websiteUrl: input.websiteUrl || null,
    welcomeMessage: input.welcomeMessage ?? 'Hi! How can I help?',
    brandColor: input.brandColor ?? '#18181b',
    avatarUrl: input.avatarUrl || null,
    quickReplies: input.quickReplies ?? [],
    showLogo: input.showLogo ?? true,
    showName: input.showName ?? true,
    showOnlineStatus: input.showOnlineStatus ?? true,
    poweredBy: input.poweredBy ?? true,
    systemPrompt: resolvePrompt(input),
    factsJson: serializeFacts(input) ?? null,
    model: input.model ?? null,
    baseUrl: input.baseUrl || null,
    temperature: input.temperature ?? 0.4,
    maxTokens: input.maxTokens ?? 512,
    status: input.status ?? ('active' as const),
    allowedDomains: input.allowedDomains ?? [],
    createdAt: now,
    updatedAt: now,
  }
  db.insert(chatbots).values(row).run()
  return c.json(toView({ ...row }), 201)
})

adminRoutes.get('/chatbots/:id', async (c) => {
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  }
  return c.json(toView(row))
})

adminRoutes.put('/chatbots/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, id) })
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  }
  const parsed = chatbotInputSchema.partial().safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.issues[0]?.message ?? 'Invalid input',
        },
      },
      400,
    )
  }
  const patch = {
    ...parsed.data,
    systemPrompt: resolvePrompt(parsed.data),
    factsJson: serializeFacts(parsed.data),
    updatedAt: new Date(),
  }
  db.update(chatbots)
    .set({
      ...patch,
      websiteUrl: patch.websiteUrl === undefined ? undefined : patch.websiteUrl || null,
      avatarUrl: patch.avatarUrl === undefined ? undefined : patch.avatarUrl || null,
      baseUrl: patch.baseUrl === undefined ? undefined : patch.baseUrl || null,
    })
    .where(eq(chatbots.id, row.id))
    .run()
  const updated = await db.query.chatbots.findFirst({ where: eq(chatbots.id, row.id) })
  if (!updated) return c.json({ error: { code: 'INTERNAL', message: 'Update failed' } }, 500)
  return c.json(toView(updated))
})

adminRoutes.delete('/chatbots/:id', async (c) => {
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  }
  db.delete(chatbots).where(eq(chatbots.id, row.id)).run()
  return c.body(null, 204)
})

adminRoutes.get('/models', async (c) => {
  const baseUrl = c.req.query('baseUrl')?.trim()
  if (!baseUrl) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'baseUrl query param required' } },
      400,
    )
  }
  try {
    const { apiKey } = resolveProviderCredentials()
    const models = await fetchModelCatalog(baseUrl, apiKey || undefined)
    return c.json({ models })
  } catch (err) {
    if (err instanceof CatalogError) {
      const status = err.code === 'INVALID_URL' ? 400 : err.code === 'UPSTREAM_AUTH' ? 401 : 502
      return c.json({ error: { code: err.code, message: err.message } }, status)
    }
    logger.error({ err }, 'model catalog failed')
    return c.json(
      { error: { code: 'UPSTREAM_ERROR', message: 'Could not load model catalog' } },
      502,
    )
  }
})

adminRoutes.get('/settings', (c) => c.json(getAdminSettingsView()))

adminRoutes.post('/import', async (c) => {
  const parsed = importRequestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json(
      {
        error: { code: 'INVALID_INPUT', message: parsed.error.issues[0]?.message ?? 'Invalid URL' },
      },
      400,
    )
  }
  try {
    const model = parsed.data.model ?? getDefaultModel()
    if (!model) {
      return c.json(
        {
          error: {
            code: 'MODEL_NOT_CONFIGURED',
            message: 'Set a default model in Settings before importing.',
          },
        },
        400,
      )
    }
    const { text, source } = await fetchSiteText(parsed.data.url)
    const facts = await extractBusinessFacts(text, model)
    return c.json({ facts, source })
  } catch (err) {
    if (err instanceof ImportError) {
      const status = err.code === 'INVALID_URL' || err.code === 'BLOCKED_HOST' ? 400 : 502
      return c.json({ error: { code: err.code, message: err.message } }, status)
    }
    logger.error({ err }, 'import failed')
    return c.json(
      { error: { code: 'EXTRACTION_FAILED', message: 'Could not read business facts' } },
      502,
    )
  }
})

adminRoutes.post('/chatbots/:id/test', async (c) => {
  const id = c.req.param('id')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, id) })
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  }
  const parsed = chatbotTestSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.issues[0]?.message ?? 'Invalid test input',
        },
      },
      400,
    )
  }
  const { content, facts } = parsed.data
  const systemPrompt = composeSystemPrompt(facts)
  if (!systemPrompt) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Add business facts before testing' } },
      400,
    )
  }
  try {
    const credentials = resolveProviderCredentials()
    if (!credentials.apiKey) {
      return c.json(
        {
          error: {
            code: 'AI_KEY_NOT_CONFIGURED',
            message: 'Connect an AI provider in Settings before testing',
          },
        },
        400,
      )
    }
    let model: string
    try {
      model = resolveModel(row.model)
    } catch (err) {
      return settingsError(c, err)
    }
    const reply = await completePlain(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      {
        model,
        baseUrl: row.baseUrl,
        temperature: row.temperature,
        maxTokens: row.maxTokens,
      },
      credentials,
    )
    return c.json({ reply: unwrapJsonReply(reply) })
  } catch (err) {
    logger.error({ err }, 'chatbot test failed')
    return c.json(
      { error: { code: 'AI_PROVIDER_ERROR', message: 'The AI provider could not answer' } },
      502,
    )
  }
})

adminRoutes.get('/chatbots/:id/leads', async (c) => {
  const id = c.req.param('id')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, id) })
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  }
  const convs = db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.chatbotId, id),
        or(isNotNull(conversations.visitorName), isNotNull(conversations.visitorEmail)),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(25)
    .all()

  const conversationIds = convs.map((c) => c.id)
  const rows = conversationIds.length
    ? db.select().from(messages).where(inArray(messages.conversationId, conversationIds)).all()
    : []

  const counts = new Map<string, number>()
  const lastByConv = new Map<string, { content: string; at: number }>()
  for (const m of rows) {
    counts.set(m.conversationId, (counts.get(m.conversationId) ?? 0) + 1)
    const at = m.createdAt.getTime()
    const current = lastByConv.get(m.conversationId)
    if (!current || at > current.at) {
      lastByConv.set(m.conversationId, { content: m.content, at })
    }
  }

  const leads = convs.map((c) => ({
    id: c.id,
    visitorName: c.visitorName,
    visitorEmail: c.visitorEmail,
    lastMessage: lastByConv.get(c.id)?.content ?? '',
    messageCount: counts.get(c.id) ?? 0,
    createdAt: c.createdAt.toISOString(),
  }))

  return c.json({ leads })
})

function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

adminRoutes.get('/chatbots/:id/stats', async (c) => {
  const id = c.req.param('id')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, id) })
  if (!row) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
  }

  const requested = Number.parseInt(c.req.query('days') ?? '30', 10)
  const windowDays = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 90) : 30

  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (windowDays - 1))

  const convs = db
    .select({
      id: conversations.id,
      createdAt: conversations.createdAt,
      visitorName: conversations.visitorName,
      visitorEmail: conversations.visitorEmail,
    })
    .from(conversations)
    .where(and(eq(conversations.chatbotId, id), gte(conversations.createdAt, since)))
    .all()

  const convIds = convs.map((cv) => cv.id)
  const msgRows = convIds.length
    ? db
        .select({ conversationId: messages.conversationId })
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
        .all()
    : []

  const buckets = new Map<string, { conversations: number; leads: number; messages: number }>()
  for (let i = 0; i < windowDays; i += 1) {
    const day = new Date(since)
    day.setDate(day.getDate() + i)
    buckets.set(dayKey(day), { conversations: 0, leads: 0, messages: 0 })
  }

  const messageCounts = new Map<string, number>()
  for (const m of msgRows) {
    messageCounts.set(m.conversationId, (messageCounts.get(m.conversationId) ?? 0) + 1)
  }

  for (const cv of convs) {
    const bucket = buckets.get(dayKey(cv.createdAt))
    if (!bucket) continue
    bucket.conversations += 1
    if (cv.visitorName || cv.visitorEmail) bucket.leads += 1
    bucket.messages += messageCounts.get(cv.id) ?? 0
  }

  const totalConversations = convs.length
  const totalLeads = convs.filter((cv) => cv.visitorName || cv.visitorEmail).length

  return c.json({
    windowDays,
    days: [...buckets.entries()].map(([date, counts]) => ({ date, ...counts })),
    totals: {
      conversations: totalConversations,
      leads: totalLeads,
      conversionRate: totalConversations === 0 ? 0 : totalLeads / totalConversations,
      avgMessagesPerConversation:
        totalConversations === 0 ? 0 : msgRows.length / totalConversations,
    },
  })
})

adminRoutes.put('/settings', async (c) => {
  try {
    const body = (await c.req.json()) as {
      apiKey?: string
      baseUrl?: string
      defaultModel?: string
    }
    if (body.apiKey !== undefined && body.apiKey.trim() !== '') {
      saveApiKey(body.apiKey.trim(), body.baseUrl)
    } else if (body.baseUrl !== undefined) {
      saveBaseUrl(body.baseUrl)
    }
    if (body.defaultModel !== undefined) saveDefaultModel(body.defaultModel)
    return c.json(getAdminSettingsView())
  } catch (err) {
    return settingsError(c, err)
  }
})

const assignSchema = z.object({ chatbotIds: z.array(z.string().min(1)).max(100) })

async function clientViews(userIds?: string[]): Promise<ClientUserView[]> {
  const clients = userIds
    ? await db.select().from(userTable).where(inArray(userTable.id, userIds))
    : await db.select().from(userTable).where(eq(userTable.role, 'client'))
  const assignments = await db.select().from(clientAssignments)
  return clients.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    role: u.role as 'agency' | 'client',
    chatbotIds: assignments.filter((a) => a.userId === u.id).map((a) => a.chatbotId),
  }))
}

adminRoutes.get('/clients', async (c) => {
  return c.json({ clients: await clientViews() })
})

adminRoutes.put('/clients/:userId/chatbots', async (c) => {
  const userId = c.req.param('userId')
  if (!userId) return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  const target = await db.query.user.findFirst({ where: eq(userTable.id, userId) })
  if (!target) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }
  if (target.role !== 'client') {
    return c.json(
      {
        error: { code: 'INVALID_INPUT', message: 'Only client accounts can be assigned chatbots' },
      },
      400,
    )
  }
  const parsed = assignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'Invalid chatbotIds' } }, 400)
  }

  const existing = await db
    .select()
    .from(clientAssignments)
    .where(eq(clientAssignments.userId, userId))
  for (const a of existing) {
    if (!parsed.data.chatbotIds.includes(a.chatbotId)) {
      db.delete(clientAssignments).where(eq(clientAssignments.chatbotId, a.chatbotId)).run()
    }
  }
  for (const chatbotId of parsed.data.chatbotIds) {
    if (!existing.some((a) => a.chatbotId === chatbotId)) {
      db.insert(clientAssignments).values({ userId: userId, chatbotId }).run()
    }
  }

  const [view] = await clientViews([userId])
  const validated = clientUserViewSchema.parse(view)
  return c.json(validated)
})
