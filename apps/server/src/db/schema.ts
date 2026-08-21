import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const chatbots = sqliteTable('chatbots', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  websiteUrl: text('website_url'),
  welcomeMessage: text('welcome_message').notNull().default('Hi! How can I help?'),
  brandColor: text('brand_color').notNull().default('#4f46e5'),
  avatarUrl: text('avatar_url'),
  quickReplies: text('quick_replies', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  poweredBy: integer('powered_by', { mode: 'boolean' }).notNull().default(true),
  systemPrompt: text('system_prompt').notNull().default(''),
  model: text('model').notNull().default('gpt-4o-mini'),
  baseUrl: text('base_url'),
  temperature: real('temperature').notNull().default(0.7),
  maxTokens: integer('max_tokens').notNull().default(512),
  status: text('status', { enum: ['active', 'paused', 'archived'] })
    .notNull()
    .default('active'),
  allowedDomains: text('allowed_domains', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    chatbotId: text('chatbot_id')
      .notNull()
      .references(() => chatbots.id, { onDelete: 'cascade' }),
    visitorId: text('visitor_id').notNull(),
    visitorName: text('visitor_name'),
    visitorEmail: text('visitor_email'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('idx_conversations_chatbot_visitor').on(t.chatbotId, t.visitorId)],
)

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('idx_messages_conversation_created').on(t.conversationId, t.createdAt)],
)
