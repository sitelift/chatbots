import { serve } from '@hono/node-server'
import { runMigrations } from './db'
import { env } from './env'
import { createApp } from './index'
import { logger } from './lib/logger'

runMigrations()

serve({ fetch: createApp().fetch, port: env.port, hostname: env.host }, (info) => {
  logger.info(`sitelift listening on http://${env.host}:${info.port}`)
})
