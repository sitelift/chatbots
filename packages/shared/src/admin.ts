import { z } from 'zod'
import { chatbotStatusSchema } from './chatbot'
import { businessFactsSchema } from './facts'

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const chatbotInputSchema = z.object({
  name: z.string().min(1).max(80),
  websiteUrl: z.union([z.string().url(), z.literal('')]).optional(),
  welcomeMessage: z.string().min(1).max(300).optional(),
  brandColor: hexColorSchema.optional(),
  avatarUrl: z.union([z.string().url(), z.literal('')]).nullish(),
  quickReplies: z.array(z.string().min(1).max(60)).max(6).optional(),
  poweredBy: z.boolean().optional(),
  systemPrompt: z.string().max(8000).optional(),
  model: z.string().min(1).max(120).optional(),
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
  poweredBy: z.boolean(),
  systemPrompt: z.string(),
  model: z.string(),
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

export const clientUserViewSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: z.enum(['agency', 'client']),
  chatbotIds: z.array(z.string()),
})

export type ClientUserView = z.infer<typeof clientUserViewSchema>

export const ADMIN_ROUTES = {
  chatbots: '/api/admin/chatbots',
  chatbot: (id: string) => `/api/admin/chatbots/${id}`,
  clients: '/api/admin/clients',
  settings: '/api/admin/settings',
} as const
