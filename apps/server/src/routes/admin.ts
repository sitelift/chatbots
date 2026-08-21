import type { MiddlewareHandler } from 'hono'
import { type Context, Hono } from 'hono'
import { env } from '../env'
import { logger } from '../lib/logger'
import { getAdminSettingsView, SettingsError, saveApiKey, saveBaseUrl } from '../services/settings'

export function requireAdminToken(): MiddlewareHandler {
  return async (c, next) => {
    if (!env.adminToken) {
      logger.warn('admin API reached while ADMIN_TOKEN is unset — allowing (interim, pre-M1 auth)')
      await next()
      return
    }
    const auth = c.req.header('Authorization')
    if (auth !== `Bearer ${env.adminToken}`) {
      logger.warn({ ip: c.req.header('x-forwarded-for') ?? 'unknown' }, 'failed admin auth')
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid admin token' } }, 401)
    }
    await next()
  }
}

function settingsError(c: Context, err: unknown) {
  if (err instanceof SettingsError) {
    return c.json({ error: { code: err.code, message: err.message } }, 400)
  }
  logger.error({ err }, 'admin request failed')
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500)
}

export const adminRoutes = new Hono()

adminRoutes.use('*', requireAdminToken())

adminRoutes.get('/settings', (c) => c.json(getAdminSettingsView()))

adminRoutes.put('/settings', async (c) => {
  try {
    const body = (await c.req.json()) as { apiKey?: string; baseUrl?: string }
    if (body.apiKey !== undefined && body.apiKey.trim() !== '') {
      saveApiKey(body.apiKey.trim(), body.baseUrl)
    } else if (body.baseUrl !== undefined) {
      saveBaseUrl(body.baseUrl)
    }
    return c.json(getAdminSettingsView())
  } catch (err) {
    return settingsError(c, err)
  }
})
