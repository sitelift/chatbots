import type { ConversationListItem, ConversationThread } from '@sitelift/shared'
import { and, asc, desc, eq, inArray, isNotNull, or } from 'drizzle-orm'
import { db } from '../db'
import { conversations, messages } from '../db/schema'
import { newId } from '../lib/ids'
import { latestSubmittedReason } from './handoffs'
import type { ProviderMessage } from './provider'

export function getHistory(conversationId: string, limit: number): ProviderMessage[] {
  const rows = db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all()
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }))
}

export function findConversation(chatbotId: string, conversationId: string) {
  return db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.chatbotId, chatbotId)))
    .get()
}

export function createConversation(chatbotId: string, visitorId: string): string {
  const id = newId('conversation')
  db.insert(conversations).values({ id, chatbotId, visitorId }).run()
  return id
}

export function insertMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  usage?: { promptTokens: number | null; completionTokens: number | null },
  id = newId('message'),
): string {
  db.insert(messages)
    .values({
      id,
      conversationId,
      role,
      content,
      promptTokens: usage?.promptTokens ?? null,
      completionTokens: usage?.completionTokens ?? null,
    })
    .run()
  return id
}

function isLeadRow(visitorName: string | null, visitorEmail: string | null): boolean {
  return Boolean(visitorName || visitorEmail)
}

export function listConversations(
  chatbotId: string,
  options: { filter?: 'all' | 'leads'; limit?: number } = {},
): ConversationListItem[] {
  const filter = options.filter ?? 'all'
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)

  const where =
    filter === 'leads'
      ? and(
          eq(conversations.chatbotId, chatbotId),
          or(isNotNull(conversations.visitorName), isNotNull(conversations.visitorEmail)),
        )
      : eq(conversations.chatbotId, chatbotId)

  const convs = db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.createdAt))
    .limit(limit)
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
    if (!current || at >= current.at) {
      lastByConv.set(m.conversationId, { content: m.content, at })
    }
  }

  return convs.map((c) => ({
    id: c.id,
    visitorName: c.visitorName,
    visitorEmail: c.visitorEmail,
    reason: latestSubmittedReason(c.id),
    lastMessage: lastByConv.get(c.id)?.content ?? '',
    messageCount: counts.get(c.id) ?? 0,
    isLead: isLeadRow(c.visitorName, c.visitorEmail),
    createdAt: c.createdAt.toISOString(),
  }))
}

export function getConversationThread(
  chatbotId: string,
  conversationId: string,
): ConversationThread | null {
  const conv = findConversation(chatbotId, conversationId)
  if (!conv) return null

  const rows = db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .all()

  return {
    id: conv.id,
    visitorName: conv.visitorName,
    visitorEmail: conv.visitorEmail,
    reason: latestSubmittedReason(conv.id),
    isLead: isLeadRow(conv.visitorName, conv.visitorEmail),
    createdAt: conv.createdAt.toISOString(),
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}
