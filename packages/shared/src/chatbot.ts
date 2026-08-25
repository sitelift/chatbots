import { z } from 'zod'

export const chatbotStatusSchema = z.enum(['active', 'paused', 'archived'])
export type ChatbotStatus = z.infer<typeof chatbotStatusSchema>

export const chatbotPublicMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  welcomeMessage: z.string(),
  brandColor: z.string(),
  avatarUrl: z.string().nullable(),
  quickReplies: z.array(z.string()),
  showLogo: z.boolean(),
  showName: z.boolean(),
  showOnlineStatus: z.boolean(),
  poweredBy: z.boolean(),
  status: chatbotStatusSchema,
})

export type ChatbotPublicMeta = z.infer<typeof chatbotPublicMetaSchema>
