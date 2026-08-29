import {
  type BusinessFacts,
  type ChatbotAdminView,
  type ClientUserView,
  CONTEXT_MESSAGE_LIMIT,
  chatbotInputSchema,
  chatbotTestHandoffSchema,
  chatbotTestSchema,
  clientUserViewSchema,
  composeSystemPrompt,
  createClientSchema,
  type HandoffField,
  importRequestSchema,
  isRoutingMode,
  unwrapJsonReply,
} from '@sitelift/shared'
import { and, eq, gte, inArray, like } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import {
  chatbots,
  clientAssignments,
  conversations,
  messages,
  user as userTable,
  verification,
} from '../db/schema'
import { newId, newToken } from '../lib/ids'
import { logger } from '../lib/logger'
import { CatalogError, fetchModelCatalog } from '../lib/modelCatalog'
import { type RequestUser, requireRole } from '../lib/session'
import {
  createConversation,
  findConversation,
  getConversationThread,
  getHistory,
  insertMessage,
  listConversations,
} from '../services/conversations'
import { createPendingHandoff, HandoffError, submitHandoff } from '../services/handoffs'
import { extractBusinessFacts, fetchSiteText, ImportError } from '../services/importer'
import { sendSmtpTestEmail } from '../services/mailer'
import { completeWithTools } from '../services/provider'
import {
  getAdminSettingsView,
  getDefaultModel,
  resolveModel,
  resolveProviderCredentials,
  SettingsError,
  saveApiKey,
  saveBaseUrl,
  saveDefaultModel,
  saveProviderPin,
  saveRoutingMode,
  saveSmtpSettings,
} from '../services/settings'

type AdminContext = { Variables: { user: RequestUser } }

export const adminRoutes = new Hono<AdminContext>()

adminRoutes.use('*', requireRole('agency', 'client'))
adminRoutes.use('/clients', requireRole('agency'))
adminRoutes.use('/clients/*', requireRole('agency'))
adminRoutes.use('/settings', requireRole('agency'))
adminRoutes.use('/settings/*', requireRole('agency'))
adminRoutes.use('/import', requireRole('agency'))
adminRoutes.use('/models', requireRole('agency'))

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

function notFound(c: Context) {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Chatbot not found' } }, 404)
}

async function assignedChatbotIds(userId: string): Promise<string[]> {
  const rows = db
    .select({ chatbotId: clientAssignments.chatbotId })
    .from(clientAssignments)
    .where(eq(clientAssignments.userId, userId))
    .all()
  return rows.map((r) => r.chatbotId)
}

async function hasBotAccess(user: RequestUser, chatbotId: string): Promise<boolean> {
  if (user.role === 'agency') return true
  const ids = await assignedChatbotIds(user.id)
  return ids.includes(chatbotId)
}

adminRoutes.get('/chatbots', async (c) => {
  const user = c.get('user')
  let rows = await db.query.chatbots.findMany()
  if (user && user.role !== 'agency') {
    const ids = await assignedChatbotIds(user.id)
    rows = rows.filter((r) => ids.includes(r.id))
  }
  const sorted = rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return c.json({ chatbots: sorted.map(toView) })
})

adminRoutes.get('/stats', async (c) => {
  const user = c.get('user')
  let rows = await db.query.chatbots.findMany()
  if (user && user.role !== 'agency') {
    const ids = await assignedChatbotIds(user.id)
    rows = rows.filter((r) => ids.includes(r.id))
  }

  const botIds = rows.map((r) => r.id)

  if (botIds.length === 0) {
    return c.json({
      chatbotsTotal: 0,
      chatbotsActive: 0,
      conversations: 0,
      leads: 0,
      messages: 0,
    })
  }

  const convs = db
    .select({
      id: conversations.id,
      visitorName: conversations.visitorName,
      visitorEmail: conversations.visitorEmail,
    })
    .from(conversations)
    .where(inArray(conversations.chatbotId, botIds))
    .all()

  const convIds = convs.map((cv) => cv.id)
  const messageRows = convIds.length
    ? db
        .select({ id: messages.id })
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
        .all()
    : []

  return c.json({
    chatbotsTotal: rows.length,
    chatbotsActive: rows.filter((r) => r.status === 'active').length,
    conversations: convs.length,
    leads: convs.filter((cv) => cv.visitorName || cv.visitorEmail).length,
    messages: messageRows.length,
  })
})

adminRoutes.post('/chatbots', requireRole('agency'), async (c) => {
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
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
  }
  return c.json(toView(row))
})

adminRoutes.put('/chatbots/:id', async (c) => {
  const id = c.req.param('id')
  if (!id) return notFound(c)
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, id) })
  const user = c.get('user')
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
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
  const raw = parsed.data
  const patchSource: FactsInput =
    user.role === 'agency'
      ? raw
      : {
          welcomeMessage: raw.welcomeMessage,
          quickReplies: raw.quickReplies,
          brandColor: raw.brandColor,
          avatarUrl: raw.avatarUrl,
          showLogo: raw.showLogo,
          showName: raw.showName,
          showOnlineStatus: raw.showOnlineStatus,
          poweredBy: raw.poweredBy,
          facts: raw.facts,
        }
  const patch = { ...patchSource, factsJson: serializeFacts(patchSource), updatedAt: new Date() }
  if (patchSource.facts) patch.systemPrompt = composeSystemPrompt(patchSource.facts)
  else if (patchSource.facts === null) patch.systemPrompt = ''
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

adminRoutes.delete('/chatbots/:id', requireRole('agency'), async (c) => {
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
    const crawlStart = Date.now()
    const { pages, source } = await fetchSiteText(parsed.data.url)
    const chars = pages.reduce((sum, p) => sum + p.text.length, 0)
    logger.info(
      { url: parsed.data.url, pages: pages.length, chars, ms: Date.now() - crawlStart },
      'import: crawl complete',
    )
    const extractStart = Date.now()
    const facts = await extractBusinessFacts(pages, model)
    logger.info(
      { url: parsed.data.url, ms: Date.now() - extractStart },
      'import: extraction complete',
    )
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
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
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
  const { content, facts, history = [], dryRun } = parsed.data
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

    let conversationId = parsed.data.conversationId
    let visitorId = parsed.data.visitorId
    let prior = history

    if (!dryRun) {
      visitorId = visitorId ?? `test_${user.id.slice(0, 24)}`
      if (conversationId) {
        const existing = await findConversation(row.id, conversationId)
        if (!existing || existing.visitorId !== visitorId) {
          return c.json(
            { error: { code: 'NOT_FOUND', message: 'Test conversation not found' } },
            404,
          )
        }
      } else {
        conversationId = createConversation(row.id, visitorId)
      }
      prior = getHistory(conversationId, CONTEXT_MESSAGE_LIMIT - 1).map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
      insertMessage(conversationId, 'user', content)
    }

    const result = await completeWithTools(
      [
        { role: 'system' as const, content: systemPrompt },
        ...prior.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        { role: 'user' as const, content },
      ],
      {
        model,
        baseUrl: row.baseUrl,
        temperature: row.temperature,
        maxTokens: row.maxTokens,
        enableHandoffTool: true,
        sessionId: conversationId,
      },
      credentials,
    )
    const reply =
      unwrapJsonReply(result.text) ||
      (result.handoff
        ? (result.handoff.args.intro ?? 'Share your details and someone will follow up.')
        : '')

    if (!dryRun && conversationId) {
      insertMessage(conversationId, 'assistant', reply || ' ', {
        promptTokens: null,
        completionTokens: null,
      })
    }

    const body: {
      reply: string
      conversationId?: string
      visitorId?: string
      handoff?: {
        handoffId: string
        reason: string
        intro?: string
        fields: HandoffField[]
      }
    } = { reply, conversationId, visitorId }

    if (result.handoff) {
      if (!dryRun && conversationId) {
        const pending = createPendingHandoff(conversationId, row.id, result.handoff.args)
        body.handoff = {
          handoffId: pending.handoffId,
          reason: pending.reason,
          intro: pending.intro,
          fields: pending.fields,
        }
      } else {
        body.handoff = {
          handoffId: `preview_${Date.now()}`,
          reason: result.handoff.args.reason,
          intro: result.handoff.args.intro,
          fields: result.handoff.args.fields,
        }
      }
    }
    return c.json(body)
  } catch (err) {
    logger.error({ err }, 'chatbot test failed')
    return c.json(
      { error: { code: 'AI_PROVIDER_ERROR', message: 'The AI provider could not answer' } },
      502,
    )
  }
})

adminRoutes.post('/chatbots/:id/test/handoff', async (c) => {
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
  }
  const parsed = chatbotTestHandoffSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: parsed.error.issues[0]?.message ?? 'Invalid handoff payload',
        },
      },
      400,
    )
  }
  if (parsed.data.dryRun || parsed.data.handoffId.startsWith('preview_')) {
    return c.json({ ok: true as const })
  }
  try {
    submitHandoff({
      chatbotId: row.id,
      conversationId: parsed.data.conversationId,
      visitorId: parsed.data.visitorId,
      handoffId: parsed.data.handoffId,
      answers: parsed.data.answers,
      botName: row.name,
    })
    return c.json({ ok: true as const })
  } catch (err) {
    if (err instanceof HandoffError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'ALREADY_SUBMITTED' ? 409 : 400
      return c.json({ error: { code: err.code, message: err.message } }, status)
    }
    logger.error({ err }, 'test handoff failed')
    return c.json({ error: { code: 'INTERNAL', message: 'Could not submit handoff' } }, 500)
  }
})

adminRoutes.get('/chatbots/:id/leads', async (c) => {
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
  }
  const items = listConversations(row.id, { filter: 'leads', limit: 25 })
  const leads = items.map(({ isLead: _isLead, ...lead }) => lead)
  return c.json({ leads })
})

adminRoutes.get('/chatbots/:id/conversations', async (c) => {
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
  }
  const filterRaw = c.req.query('filter') ?? 'all'
  const filter = filterRaw === 'leads' ? 'leads' : 'all'
  const requested = Number.parseInt(c.req.query('limit') ?? '50', 10)
  const limit = Number.isFinite(requested) && requested > 0 ? requested : 50
  return c.json({ conversations: listConversations(row.id, { filter, limit }) })
})

adminRoutes.get('/chatbots/:id/conversations/:conversationId', async (c) => {
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
  }
  const thread = getConversationThread(row.id, c.req.param('conversationId'))
  if (!thread) return notFound(c)
  return c.json(thread)
})

function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

adminRoutes.get('/chatbots/:id/stats', async (c) => {
  const user = c.get('user')
  const row = await db.query.chatbots.findFirst({ where: eq(chatbots.id, c.req.param('id')) })
  if (!row || !user || !(await hasBotAccess(user, row.id))) {
    return notFound(c)
  }
  const id = c.req.param('id') as string

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
      providerPin?: string
      routingMode?: string
      smtp?: {
        host?: string
        port?: number
        secure?: boolean
        user?: string
        pass?: string
        from?: string
        alsoNotify?: string
      }
    }
    if (body.apiKey !== undefined && body.apiKey.trim() !== '') {
      saveApiKey(body.apiKey.trim(), body.baseUrl)
    } else if (body.baseUrl !== undefined) {
      saveBaseUrl(body.baseUrl)
    }
    if (body.defaultModel !== undefined) saveDefaultModel(body.defaultModel)
    if (body.providerPin !== undefined) saveProviderPin(body.providerPin)
    if (body.routingMode !== undefined) {
      if (!isRoutingMode(body.routingMode)) {
        return c.json({ error: { code: 'INVALID_INPUT', message: 'Unknown routing mode' } }, 400)
      }
      saveRoutingMode(body.routingMode)
    }
    if (body.smtp !== undefined) {
      saveSmtpSettings({
        host: body.smtp.host,
        port: body.smtp.port,
        secure: body.smtp.secure,
        user: body.smtp.user,
        pass: body.smtp.pass,
        from: body.smtp.from,
        alsoNotify: body.smtp.alsoNotify,
      })
    }
    return c.json(getAdminSettingsView())
  } catch (err) {
    return settingsError(c, err)
  }
})

adminRoutes.post('/settings/smtp/test', async (c) => {
  const me = c.get('user')
  const to = me?.email
  if (!to) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'No email on your account' } }, 400)
  }
  try {
    await sendSmtpTestEmail(to)
    return c.json({ ok: true, to })
  } catch (err) {
    logger.error({ err }, 'smtp test failed')
    return c.json(
      {
        error: {
          code: 'SMTP_ERROR',
          message: err instanceof Error ? err.message : 'Could not send test email',
        },
      },
      502,
    )
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

function invalidInput(c: Context, message: string) {
  return c.json({ error: { code: 'INVALID_INPUT', message } }, 400)
}

async function createPasswordSetupToken(userId: string): Promise<string> {
  const token = newToken()
  db.insert(verification)
    .values({
      id: newId('verification'),
      identifier: `reset-password:${token}`,
      value: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
  return token
}

function clearPasswordSetupTokens(userId: string): void {
  db.delete(verification)
    .where(and(eq(verification.value, userId), like(verification.identifier, 'reset-password:%')))
    .run()
}

adminRoutes.get('/clients', async (c) => {
  return c.json({ clients: await clientViews() })
})

adminRoutes.post('/clients', async (c) => {
  const parsed = createClientSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return invalidInput(c, parsed.error.issues[0]?.message ?? 'Invalid input')
  }
  const { email, name } = parsed.data
  const existing = await db.query.user.findFirst({ where: eq(userTable.email, email) })
  if (existing) {
    return c.json(
      { error: { code: 'EMAIL_TAKEN', message: 'A user with that email already exists' } },
      409,
    )
  }
  const now = new Date()
  const id = newId('user')
  db.insert(userTable)
    .values({
      id,
      name: name || email.split('@')[0] || email,
      email,
      role: 'client',
      createdAt: now,
      updatedAt: now,
    })
    .run()
  const setupToken = await createPasswordSetupToken(id)
  const [view] = await clientViews([id])
  return c.json({ client: clientUserViewSchema.parse(view), setupToken }, 201)
})

adminRoutes.put('/clients/:userId/chatbots', async (c) => {
  const userId = c.req.param('userId')
  if (!userId) return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  const target = await db.query.user.findFirst({ where: eq(userTable.id, userId) })
  if (!target) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }
  if (target.role !== 'client') {
    return invalidInput(c, 'Only client accounts can be assigned chatbots')
  }
  const parsed = assignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return invalidInput(c, 'Invalid chatbotIds')
  }

  const known = await db.select({ id: chatbots.id }).from(chatbots)
  for (const chatbotId of parsed.data.chatbotIds) {
    if (!known.some((b) => b.id === chatbotId)) {
      return invalidInput(c, `Unknown chatbot: ${chatbotId}`)
    }
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

adminRoutes.post('/clients/:userId/reset', async (c) => {
  const userId = c.req.param('userId')
  const target = await db.query.user.findFirst({ where: eq(userTable.id, userId) })
  if (!target) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }
  if (target.role !== 'client') {
    return invalidInput(c, 'Only client accounts can be reset')
  }
  clearPasswordSetupTokens(target.id)
  const setupToken = await createPasswordSetupToken(target.id)
  return c.json({ setupToken })
})

adminRoutes.delete('/clients/:userId', async (c) => {
  const userId = c.req.param('userId')
  const target = await db.query.user.findFirst({ where: eq(userTable.id, userId) })
  if (!target) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'User not found' } }, 404)
  }
  if (target.role === 'agency') {
    return invalidInput(c, 'Agency accounts cannot be removed here')
  }
  clearPasswordSetupTokens(target.id)
  db.delete(userTable).where(eq(userTable.id, userId)).run()
  return c.body(null, 204)
})
