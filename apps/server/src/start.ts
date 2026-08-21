import { serve } from '@hono/node-server'
import { db, runMigrations } from './db'
import { chatbots } from './db/schema'
import { env } from './env'
import { createApp } from './index'
import { logger } from './lib/logger'

runMigrations()

db.insert(chatbots)
  .values({
    id: 'ch_demo',
    name: 'Demo Business',
    welcomeMessage: 'Hi! How can I help?',
    systemPrompt:
      'You are the helpful assistant for Demo Business, a friendly local company. Answer questions about hours, services and pricing honestly. If you do not know something, say so.',
  })
  .onConflictDoNothing()
  .run()

serve({ fetch: createApp().fetch, port: env.port, hostname: env.host }, (info) => {
  logger.info(`sitelift listening on http://${env.host}:${info.port}`)
})
