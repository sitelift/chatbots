import { z } from 'zod'

export const MAX_MESSAGE_LENGTH = 2000
export const CONTEXT_MESSAGE_LIMIT = 20

export const sendMessageRequestSchema = z.object({
  conversationId: z.string().min(1).optional(),
  visitorId: z.string().min(8).max(64),
  content: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
})

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>

export const sseEventSchema = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('meta'),
    conversationId: z.string(),
    messageId: z.string(),
  }),
  z.object({
    event: z.literal('token'),
    text: z.string(),
  }),
  z.object({
    event: z.literal('done'),
    conversationId: z.string(),
    messageId: z.string(),
    reply: z.string(),
  }),
  z.object({
    event: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
])

export type SseEvent = z.infer<typeof sseEventSchema>

export const nonStreamingReplySchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
  reply: z.string(),
})

export type NonStreamingReply = z.infer<typeof nonStreamingReplySchema>

/**
 * Some models wrap replies in JSON (e.g. `{"answer":"..."}` or `{"pricing":"..."}`)
 * even when not asked. Strip it so visitors and the DB only ever hold plain text.
 */
export function unwrapJsonReply(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return text
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    for (const key of ['answer', 'reply', 'text', 'content']) {
      const value = parsed[key]
      if (typeof value === 'string' && value.trim()) return value
    }
    const keys = Object.keys(parsed)
    if (keys.length === 1) {
      const value = parsed[keys[0]!]
      if (typeof value === 'string') return value
    }
  } catch {}
  return text
}
