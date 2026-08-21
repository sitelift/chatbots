import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { env } from './env'
import { health } from './routes/health'
import { publicRoutes } from './routes/public'

export function createApp() {
  const app = new Hono()

  if (!env.isProd) app.use(logger())

  app.route('/health', health)
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

  app.get('/demo', (c) =>
    c.html(
      `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SiteLift widget demo</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #fafafa; color: #18181b; }
  main { text-align: center; max-width: 32rem; padding: 2rem; }
</style>
</head>
<body>
<main>
  <h1>SiteLift widget demo</h1>
  <p>This page loads the compiled embed script exactly like a client website would. The bubble should appear bottom-right.</p>
</main>
<script src="/embed.js" data-chatbot-id="ch_demo"></script>
</body>
</html>`,
    ),
  )

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
