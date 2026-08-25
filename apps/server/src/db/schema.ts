import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  role: text('role', { enum: ['agency', 'client'] })
    .notNull()
    .default('client'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  issuer: text('issuer'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
})

export const clientAssignments = sqliteTable(
  'client_assignments',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    chatbotId: text('chatbot_id')
      .notNull()
      .references(() => chatbots.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.chatbotId] })],
)

export const chatbots = sqliteTable('chatbots', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  websiteUrl: text('website_url'),
  welcomeMessage: text('welcome_message').notNull().default('Hi! How can I help?'),
  brandColor: text('brand_color').notNull().default('#18181b'),
  avatarUrl: text('avatar_url'),
  quickReplies: text('quick_replies', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  showLogo: integer('show_logo', { mode: 'boolean' }).notNull().default(true),
  showName: integer('show_name', { mode: 'boolean' }).notNull().default(true),
  showOnlineStatus: integer('show_online', { mode: 'boolean' }).notNull().default(true),
  poweredBy: integer('powered_by', { mode: 'boolean' }).notNull().default(true),
  systemPrompt: text('system_prompt').notNull().default(''),
  factsJson: text('facts_json'),
  model: text('model'),
  baseUrl: text('base_url'),
  temperature: real('temperature').notNull().default(0.4),
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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
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
