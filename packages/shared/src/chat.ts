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
