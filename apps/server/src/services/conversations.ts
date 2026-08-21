import { asc, eq } from 'drizzle-orm'
import { db } from '../db'
import { conversations, messages } from '../db/schema'
import { newId } from '../lib/ids'
import type { ProviderMessage } from './provider'

export function getHistory(conversationId: string, limit: number): ProviderMessage[] {
  const rows = db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(limit)
    .all()
  return rows.map((r) => ({ role: r.role, content: r.content }))
}

export function findConversation(chatbotId: string, conversationId: string) {
  return db.query.conversations.findFirst({
    where: (c, { and, eq }) => and(eq(c.id, conversationId), eq(c.chatbotId, chatbotId)),
  })
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
