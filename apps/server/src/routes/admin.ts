import {
  type BusinessFacts,
  type ChatbotAdminView,
  type ClientUserView,
  chatbotInputSchema,
  clientUserViewSchema,
  composeSystemPrompt,
} from '@sitelift/shared'
import { eq, inArray } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db'
import { chatbots, clientAssignments, user as userTable } from '../db/schema'
import { newId } from '../lib/ids'
import { logger } from '../lib/logger'
import { requireRole } from '../lib/session'
import { getAdminSettingsView, SettingsError, saveApiKey, saveBaseUrl } from '../services/settings'

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
    poweredBy: input.poweredBy ?? true,
    systemPrompt: resolvePrompt(input),
    factsJson: serializeFacts(input) ?? null,
    model: input.model ?? process.env.AI_MODEL ?? 'gpt-4o-mini',
    baseUrl: input.baseUrl || null,
    temperature: input.temperature ?? 0.7,
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

adminRoutes.get('/settings', (c) => c.json(getAdminSettingsView()))

adminRoutes.put('/settings', async (c) => {
  try {
    const body = (await c.req.json()) as { apiKey?: string; baseUrl?: string }
    if (body.apiKey !== undefined && body.apiKey.trim() !== '') {
      saveApiKey(body.apiKey.trim(), body.baseUrl)
    } else if (body.baseUrl !== undefined) {
      saveBaseUrl(body.baseUrl)
    }
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
