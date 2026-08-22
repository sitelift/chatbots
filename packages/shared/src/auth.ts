import { z } from 'zod'

export const userRoleSchema = z.enum(['agency', 'client'])
export type UserRole = z.infer<typeof userRoleSchema>

export const sessionUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  role: userRoleSchema,
})

export type SessionUser = z.infer<typeof sessionUserSchema>

// better-auth is mounted at /api/auth — these are its standard endpoints.
// The dashboard talks to it via the better-auth client; the server only
// needs these paths for mounting and tests.
export const AUTH_ROUTES = {
  signIn: '/api/auth/sign-in/email',
  signUp: '/api/auth/sign-up/email',
  signOut: '/api/auth/sign-out',
  session: '/api/auth/get-session',
} as const

// Bootstrap rule (M1): the FIRST user to sign up becomes `agency`.
// Every user after that is `client` and must be assigned chatbots
// by the agency before they can see anything.
export const FIRST_USER_IS_AGENCY = true
