import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { db } from './db'
import { user } from './db/schema'
import { env } from './env'
import { auth } from './lib/auth'
import { getSessionUser } from './lib/session'
import { adminRoutes } from './routes/admin'
import { health } from './routes/health'
import { publicRoutes } from './routes/public'

export function createApp() {
  const app = new Hono()

  if (!env.isProd) app.use(logger())

  app.route('/health', health)
  app.get('/api/auth/me', async (c) => {
    const user = await getSessionUser(c)
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, 401)
    return c.json(user)
  })
  app.get('/api/auth/bootstrap', async (c) => {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(user)
    return c.json({ hasUsers: Number(row?.count ?? 0) > 0 })
  })
  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  app.route('/api/admin', adminRoutes)
  app.route('/api', publicRoutes)

  app.get('/embed.js', async (c) => {
    const source = await readFile(env.widgetDistPath, 'utf8')
    return c.body(source, 200, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    })
  })

  app.get('/admin/*', async (c) => {
    const requested = c.req.path.replace(/^\/admin\//, '')
    const safe = path.normalize(requested).replace(/^(\.\.[/\\])+/, '')
    try {
      const file = await readFile(path.join(env.dashboardDistPath, safe))
      return c.body(new Uint8Array(file), 200, {
        'Content-Type': contentType(safe),
        'Cache-Control': 'public, max-age=3600',
      })
    } catch {
      const index = await readFile(path.join(env.dashboardDistPath, 'index.html'))
      return c.body(new Uint8Array(index), 200, { 'Content-Type': 'text/html; charset=utf-8' })
    }
  })

  app.get('/admin', (c) => c.redirect('/admin/'))

  return app
}

function contentType(file: string): string {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.svg')) return 'image/svg+xml'
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.woff2')) return 'font/woff2'
  return 'application/octet-stream'
}
