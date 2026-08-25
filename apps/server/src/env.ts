import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'

for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
  const candidate = path.join(dir, '.env')
  if (existsSync(candidate)) {
    loadEnv({ path: candidate })
    break
  }
  const parent = path.dirname(dir)
  if (parent === dir) break
}

export const env = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',
  databasePath: process.env.DATABASE_PATH ?? 'data/sitelift.db',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
  widgetDistPath:
    process.env.WIDGET_DIST_PATH ??
    fileURLToPath(new URL('../../../packages/widget/dist/embed.js', import.meta.url)),
  dashboardDistPath:
    process.env.DASHBOARD_DIST_PATH ??
    fileURLToPath(new URL('../../dashboard/dist', import.meta.url)),
  isProd: process.env.NODE_ENV === 'production',
}
