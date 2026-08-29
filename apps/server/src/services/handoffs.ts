import type { HandoffField } from '@sitelift/shared'
import { and, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { db } from '../db'
import { conversations, handoffs, messages } from '../db/schema'
import { newId } from '../lib/ids'
import { logger } from '../lib/logger'
import { notifyLeadHandoff } from './mailer'

export function createPendingHandoff(
  conversationId: string,
  chatbotId: string,
  args: { reason: string; intro?: string; fields: HandoffField[] },
): { handoffId: string; fields: HandoffField[]; reason: string; intro?: string } {
  const existing = db
    .select()
    .from(handoffs)
    .where(and(eq(handoffs.conversationId, conversationId), isNull(handoffs.submittedAt)))
    .orderBy(desc(handoffs.createdAt))
    .limit(1)
    .get()

  if (existing) {
    db.update(handoffs)
      .set({
        reason: args.reason,
        intro: args.intro ?? null,
        fieldsJson: JSON.stringify(args.fields),
      })
      .where(eq(handoffs.id, existing.id))
      .run()
    return {
      handoffId: existing.id,
      fields: args.fields,
      reason: args.reason,
      intro: args.intro,
    }
  }

  const handoffId = newId('handoff')
  db.insert(handoffs)
    .values({
      id: handoffId,
      conversationId,
      chatbotId,
      reason: args.reason,
      intro: args.intro ?? null,
      fieldsJson: JSON.stringify(args.fields),
    })
    .run()

  return {
    handoffId,
    fields: args.fields,
    reason: args.reason,
    intro: args.intro,
  }
}

function parseFields(json: string): HandoffField[] {
  try {
    return JSON.parse(json) as HandoffField[]
  } catch {
    return []
  }
}

export class HandoffError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function submitHandoff(input: {
  chatbotId: string
  conversationId: string
  visitorId: string
  handoffId: string
  answers: Record<string, string>
  botName: string
}): void {
  const conversation = db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.chatbotId, input.chatbotId),
        eq(conversations.visitorId, input.visitorId),
      ),
    )
    .get()

  if (!conversation) {
    throw new HandoffError('NOT_FOUND', 'Conversation not found')
  }

  const handoff = db.select().from(handoffs).where(eq(handoffs.id, input.handoffId)).get()
  if (!handoff || handoff.conversationId !== input.conversationId) {
    throw new HandoffError('NOT_FOUND', 'Handoff not found')
  }
  if (handoff.submittedAt) {
    throw new HandoffError('ALREADY_SUBMITTED', 'This contact form was already submitted')
  }

  const fields = parseFields(handoff.fieldsJson)
  const cleaned: Record<string, string> = {}
  for (const field of fields) {
    const raw = input.answers[field.id]
    const value = typeof raw === 'string' ? raw.trim() : ''
    if (!value) {
      if (field.required || field.type === 'email') {
        throw new HandoffError('INVALID_INPUT', `${field.label} is required`)
      }
      continue
    }
    if (field.type === 'email' && !EMAIL_RE.test(value)) {
      throw new HandoffError('INVALID_INPUT', 'Enter a valid email address')
    }
    if (value.length > 2000) {
      throw new HandoffError('INVALID_INPUT', `${field.label} is too long`)
    }
    cleaned[field.id] = value
  }

  const nameField = fields.find((f) => f.type === 'name')
  const emailField = fields.find((f) => f.type === 'email')
  const visitorName = (nameField ? cleaned[nameField.id] : undefined) ?? null
  const visitorEmail = (emailField ? cleaned[emailField.id] : undefined) ?? null

  if (!visitorEmail) {
    throw new HandoffError('INVALID_INPUT', 'Email is required')
  }

  const now = new Date()
  db.update(handoffs)
    .set({ answersJson: JSON.stringify(cleaned), submittedAt: now })
    .where(eq(handoffs.id, handoff.id))
    .run()

  db.update(conversations)
    .set({
      visitorName: visitorName || conversation.visitorName,
      visitorEmail,
    })
    .where(eq(conversations.id, conversation.id))
    .run()

  const transcript = db
    .select({ role: messages.role, content: messages.content })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(desc(messages.createdAt))
    .limit(12)
    .all()
    .reverse()

  void notifyLeadHandoff({
    chatbotId: input.chatbotId,
    botName: input.botName,
    reason: handoff.reason,
    fields,
    answers: cleaned,
    transcript,
  }).catch((err) => {
    logger.error({ err, handoffId: handoff.id }, 'lead handoff email failed')
  })
}

export function latestSubmittedReason(conversationId: string): string | null {
  const row = db
    .select({ reason: handoffs.reason })
    .from(handoffs)
    .where(and(eq(handoffs.conversationId, conversationId), isNotNull(handoffs.submittedAt)))
    .orderBy(desc(handoffs.submittedAt))
    .limit(1)
    .get()
  return row?.reason ?? null
}
