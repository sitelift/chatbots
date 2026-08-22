import type { Context, MiddlewareHandler } from 'hono'
import { auth } from './auth'

export interface RequestUser {
  id: string
  email: string
  name: string | null
  role: 'agency' | 'client'
}

export async function getSessionUser(c: Context): Promise<RequestUser | null> {
  const result = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!result?.user) return null
  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name ?? null,
    role: (result.user.role as 'agency' | 'client') ?? 'client',
  }
}

export function requireRole(...roles: Array<'agency' | 'client'>): MiddlewareHandler {
  return async (c, next) => {
    const user = await getSessionUser(c)
    if (!user) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, 401)
    }
    if (!roles.includes(user.role)) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient role' } }, 403)
    }
    c.set('user', user)
    await next()
  }
}
