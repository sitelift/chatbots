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

let lastModelsAuthHeader: string | null = null

export function getLastModelsAuthHeader(): string | null {
  return lastModelsAuthHeader
}

let jsonCompletionContent = ''
let lastCompletionMessages: Array<{ role: string; content: string }> = []

export function setJsonCompletionContent(content: string): void {
  jsonCompletionContent = content
}

export function getLastCompletionMessages(): Array<{ role: string; content: string }> {
  return lastCompletionMessages
}

export function startMockProvider(
  port = 4107,
  options?: { requireAuth?: boolean },
): Promise<Server> {
  return new Promise((resolve) => {
    const server: Server = createServer(async (req, res) => {
      if (req.method === 'GET' && req.url?.includes('/models')) {
        lastModelsAuthHeader = req.headers.authorization ?? null
        if (options?.requireAuth && lastModelsAuthHeader === null) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: 'missing key' } }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            data: [
              {
                id: 'test-mini',
                name: 'Test Mini',
                context_length: 8000,
                pricing: { prompt: '0.000002', completion: '0.000006' },
              },
            ],
          }),
        )
        return
      }
      if (req.method === 'POST' && req.url?.includes('/chat/completions')) {
        let body = ''
        for await (const chunk of req) body += chunk
        try {
          lastCompletionMessages =
            (JSON.parse(body) as { messages?: { role: string; content: string }[] }).messages ?? []
        } catch {
          lastCompletionMessages = []
        }
        if (jsonCompletionContent) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: jsonCompletionContent } }],
            }),
          )
          return
        }
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

export function startMockSite(html: string, port = 4110): Promise<Server> {
  return new Promise((resolve) => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

export function startMockSiteRoutes(routes: Record<string, string>, port = 4111): Promise<Server> {
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      const path = req.url?.split('?')[0] ?? '/'
      const html = routes[path]
      if (html === undefined) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('not found')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
    })
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
