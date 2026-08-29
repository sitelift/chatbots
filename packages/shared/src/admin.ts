import { z } from 'zod'
import { CONTEXT_MESSAGE_LIMIT } from './chat'
import { chatbotStatusSchema } from './chatbot'
import { businessFactsSchema } from './facts'

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const urlOrEmptySchema = (message: string) =>
  z
    .string()
    .trim()
    .transform((value) =>
      value === ''
        ? value
        : /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)
          ? value
          : `https://${value}`,
    )
    .pipe(z.union([z.literal(''), z.string().url(message)]))

export const chatbotInputSchema = z.object({
  name: z.string().min(1).max(80),
  websiteUrl: urlOrEmptySchema('Enter a valid website URL').optional(),
  welcomeMessage: z.string().min(1).max(300).optional(),
  brandColor: hexColorSchema.optional(),
  avatarUrl: urlOrEmptySchema('Enter a valid website URL').nullish(),
  quickReplies: z.array(z.string().min(1).max(60)).max(6).optional(),
  showLogo: z.boolean().optional(),
  showName: z.boolean().optional(),
  showOnlineStatus: z.boolean().optional(),
  poweredBy: z.boolean().optional(),
  systemPrompt: z.string().max(8000).optional(),
  model: z.string().trim().min(1).max(120).nullish(),
  baseUrl: z.union([z.string().url(), z.literal('')]).nullish(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(4000).optional(),
  allowedDomains: z.array(z.string().min(1)).max(20).optional(),
  status: chatbotStatusSchema.optional(),
  facts: businessFactsSchema.nullable().optional(),
})

export type ChatbotInput = z.infer<typeof chatbotInputSchema>

export const chatbotAdminViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  websiteUrl: z.string().nullable(),
  welcomeMessage: z.string(),
  brandColor: z.string(),
  avatarUrl: z.string().nullable(),
  quickReplies: z.array(z.string()),
  showLogo: z.boolean(),
  showName: z.boolean(),
  showOnlineStatus: z.boolean(),
  poweredBy: z.boolean(),
  systemPrompt: z.string(),
  model: z.string().nullable(),
  baseUrl: z.string().nullable(),
  temperature: z.number(),
  maxTokens: z.number(),
  status: chatbotStatusSchema,
  allowedDomains: z.array(z.string()),
  facts: businessFactsSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type ChatbotAdminView = z.infer<typeof chatbotAdminViewSchema>

export const importRequestSchema = z.object({
  url: z
    .string()
    .trim()
    .transform((value) =>
      /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`,
    )
    .pipe(z.string().url('Enter a valid website URL')),
  model: z.string().trim().min(1).max(120).optional(),
})

export type ImportRequest = z.infer<typeof importRequestSchema>

export const importResultSchema = z.object({
  facts: businessFactsSchema,
  source: z.string(),
})

export type ImportResult = z.infer<typeof importResultSchema>

export const chatbotTestSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  facts: businessFactsSchema,
  /** When dryRun is true, prior turns come from the client. Live mode loads history from the DB. */
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(CONTEXT_MESSAGE_LIMIT - 1)
    .optional(),
  conversationId: z.string().min(1).optional(),
  visitorId: z.string().min(8).max(64).optional(),
  /** Dry run: no DB writes, no email. Default false = same as live embed. */
  dryRun: z.boolean().optional().default(false),
})

export type ChatbotTestInput = z.infer<typeof chatbotTestSchema>

export const chatbotTestReplySchema = z.object({
  reply: z.string(),
  conversationId: z.string().optional(),
  visitorId: z.string().optional(),
  handoff: z
    .object({
      handoffId: z.string(),
      reason: z.string(),
      intro: z.string().optional(),
      fields: z.array(
        z.object({
          id: z.string(),
          type: z.enum(['name', 'email', 'phone', 'text', 'textarea']),
          label: z.string(),
          required: z.boolean().optional(),
        }),
      ),
    })
    .optional(),
})

export type ChatbotTestReply = z.infer<typeof chatbotTestReplySchema>

export const chatbotTestHandoffSchema = z.object({
  conversationId: z.string().min(1),
  visitorId: z.string().min(8).max(64),
  handoffId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
  dryRun: z.boolean().optional().default(false),
})

export type ChatbotTestHandoffInput = z.infer<typeof chatbotTestHandoffSchema>

export const leadViewSchema = z.object({
  id: z.string(),
  visitorName: z.string().nullable(),
  visitorEmail: z.string().nullable(),
  reason: z.string().nullable(),
  lastMessage: z.string(),
  messageCount: z.number().int(),
  createdAt: z.string(),
})

export type LeadView = z.infer<typeof leadViewSchema>

export const conversationFilterSchema = z.enum(['all', 'leads'])
export type ConversationFilter = z.infer<typeof conversationFilterSchema>

export const conversationListItemSchema = z.object({
  id: z.string(),
  visitorName: z.string().nullable(),
  visitorEmail: z.string().nullable(),
  reason: z.string().nullable(),
  lastMessage: z.string(),
  messageCount: z.number().int(),
  isLead: z.boolean(),
  createdAt: z.string(),
})

export type ConversationListItem = z.infer<typeof conversationListItemSchema>

export const conversationListSchema = z.object({
  conversations: z.array(conversationListItemSchema),
})

export type ConversationList = z.infer<typeof conversationListSchema>

export const conversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.string(),
})

export type ConversationMessage = z.infer<typeof conversationMessageSchema>

export const conversationThreadSchema = z.object({
  id: z.string(),
  visitorName: z.string().nullable(),
  visitorEmail: z.string().nullable(),
  reason: z.string().nullable(),
  isLead: z.boolean(),
  createdAt: z.string(),
  messages: z.array(conversationMessageSchema),
})

export type ConversationThread = z.infer<typeof conversationThreadSchema>

export const chatbotStatsDaySchema = z.object({
  date: z.string(),
  conversations: z.number().int(),
  leads: z.number().int(),
  messages: z.number().int(),
})

export type ChatbotStatsDay = z.infer<typeof chatbotStatsDaySchema>

export const chatbotStatsSchema = z.object({
  windowDays: z.number().int(),
  days: z.array(chatbotStatsDaySchema),
  totals: z.object({
    conversations: z.number().int(),
    leads: z.number().int(),
    conversionRate: z.number(),
    avgMessagesPerConversation: z.number(),
  }),
})

export type ChatbotStats = z.infer<typeof chatbotStatsSchema>

export const clientUserViewSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(['agency', 'client']),
  chatbotIds: z.array(z.string()),
})

export type ClientUserView = z.infer<typeof clientUserViewSchema>

export const createClientSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  name: z.string().trim().min(1).max(80).optional(),
})

export type CreateClientInput = z.infer<typeof createClientSchema>

export const setupTokenSchema = z.object({ setupToken: z.string() })

export type SetupTokenResult = z.infer<typeof setupTokenSchema>

export const acceptInviteSchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(10, 'Password must be at least 10 characters'),
})

export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>

export const ADMIN_ROUTES = {
  chatbots: '/api/admin/chatbots',
  chatbot: (id: string) => `/api/admin/chatbots/${id}`,
  clients: '/api/admin/clients',
  settings: '/api/admin/settings',
} as const

export const dashboardStatsSchema = z.object({
  chatbotsTotal: z.number().int().nonnegative(),
  chatbotsActive: z.number().int().nonnegative(),
  conversations: z.number().int().nonnegative(),
  leads: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
})

export type DashboardStats = z.infer<typeof dashboardStatsSchema>
