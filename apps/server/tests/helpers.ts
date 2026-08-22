import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { chatbots, user } from '../src/db/schema'
import { createApp } from '../src/index'

export const DEMO_CHATBOT_ID = 'ch_demo'

export function seedDemoChatbot(): void {
  db.insert(chatbots)
    .values({
      id: DEMO_CHATBOT_ID,
      name: 'Demo Business',
      systemPrompt: 'You are a helpful assistant for Demo Business.',
    })
    .onConflictDoNothing()
    .run()
}

export interface TestUser {
  email: string
  password: string
  name: string
  cookie: string
}

let userCounter = 0

function cookieFrom(res: Response): string {
  const raw = res.headers.get('set-cookie') ?? ''
  return raw
    .split(/,(?=[^;]+=[^;]+)/)
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

export async function signUpUser(name?: string): Promise<TestUser> {
  const n = ++userCounter
  const email = `user-${Date.now()}-${n}@test.dev`
  const password = `password-${n}-abcdef`
  const res = await createApp().request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name: name ?? `User ${n}` }),
  })
  if (!res.ok) {
    throw new Error(`sign-up failed: ${res.status} ${await res.text()}`)
  }
  return { email, password, name: name ?? `User ${n}`, cookie: cookieFrom(res) }
}

export async function signInUser(email: string, password: string): Promise<TestUser> {
  const res = await createApp().request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`sign-in failed: ${res.status} ${await res.text()}`)
  }
  return { email, password, name: '', cookie: cookieFrom(res) }
}

export async function getUserRole(email: string): Promise<'agency' | 'client'> {
  const row = await db.select().from(user).where(eq(user.email, email)).get()
  return (row?.role as 'agency' | 'client') ?? 'client'
}

export function resetUsers(): void {
  db.delete(user).run()
}

export function startMockProvider(port = 4107): Promise<Server> {
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const chunks = [
          { choices: [{ delta: { role: 'assistant' } }] },
          { choices: [{ delta: { content: 'Hello' } }] },
          { choices: [{ delta: { content: ' world' } }] },
          { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } },
        ]
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        }
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      res.writeHead(404)
      res.end()
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
