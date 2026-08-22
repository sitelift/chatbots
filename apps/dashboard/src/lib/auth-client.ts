import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient()

export interface AppUser {
  id: string
  email: string
  name: string | null
  role: 'agency' | 'client'
}
