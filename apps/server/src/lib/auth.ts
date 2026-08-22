import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sql } from 'drizzle-orm'
import { db } from '../db'
import { account, session, user, verification } from '../db/schema'

export const auth = betterAuth({
  appName: 'sitelift',
  secret:
    process.env.BETTER_AUTH_SECRET ?? process.env.ENCRYPTION_KEY ?? 'dev-secret-do-not-use-in-prod',
  baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  trustedOrigins: (request) => {
    const origin = request?.headers?.get('origin')
    return origin ? [origin] : []
  },
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  advanced: {
    cookiePrefix: 'sitelift',
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'client',
        input: false,
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (data) => {
          const [row] = await db.select({ count: sql<number>`count(*)` }).from(user)
          const isFirstUser = Number(row?.count ?? 0) === 0
          return {
            data: {
              ...data,
              role: isFirstUser ? 'agency' : 'client',
            },
          }
        },
      },
    },
  },
})

export type AuthUser = typeof auth.$Infer.Session.user
