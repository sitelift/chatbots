import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { chatbots, settings, user } from '../src/db/schema'
import { createApp } from '../src/index'

export const DEMO_CHATBOT_ID = 'ch_demo'

export function setDefaultModel(model: string): void {
  db.insert(settings)
    .values({ key: 'ai_default_model', value: model })
    .onConflictDoUpdate({ target: settings.key, set: { value: model, updatedAt: new Date() } })
    .run()
}

export function clearDefaultModel(): void {
  db.delete(settings).where(eq(settings.key, 'ai_default_model')).run()
}

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
let completionBodies: Array<{ at: number; body: Record<string, unknown> }> = []

export function getCompletionBodies(): Array<{ at: number; body: Record<string, unknown> }> {
  return completionBodies
}

export function clearCompletionBodies(): void {
  completionBodies = []
}

export function getLastCompletionBody(): Record<string, unknown> | null {
  return completionBodies.at(-1)?.body ?? null
}

export function setJsonCompletionContent(content: string): void {
  jsonCompletionContent = content
}

let streamContent = ''
let streamToolCall: { name: string; arguments: string } | null = null

export function setStreamContent(content: string): void {
  streamContent = content
  midStreamError = null
  streamToolCall = null
}

export function setStreamToolCall(name: string, args: Record<string, unknown>): void {
  streamToolCall = { name, arguments: JSON.stringify(args) }
  streamContent = ''
  midStreamError = null
}

let midStreamError: string | null = null

export function setMidStreamError(message: string): void {
  midStreamError = message
  streamToolCall = null
}

export function setBaseUrl(url: string): void {
  if (url) setSetting('ai_base_url', url)
  else clearSetting('ai_base_url')
}

export function setRoutingMode(mode: string): void {
  if (mode) setSetting('ai_routing_mode', mode)
  else clearSetting('ai_routing_mode')
}

function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run()
}

function clearSetting(key: string): void {
  db.delete(settings).where(eq(settings.key, key)).run()
}

export function getLastCompletionMessages(): Array<{ role: string; content: string }> {
  const last = getLastCompletionBody()
  return (last?.messages as Array<{ role: string; content: string }> | undefined) ?? []
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
          const parsed = JSON.parse(body) as Record<string, unknown>
          completionBodies.push({ at: Date.now(), body: parsed })
          const wantsStream = Boolean(parsed.stream)
          if (!wantsStream) {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            const message: Record<string, unknown> = {
              role: 'assistant',
              content: jsonCompletionContent || (streamToolCall ? '' : 'Hello world'),
            }
            if (streamToolCall) {
              message.tool_calls = [
                {
                  id: 'call_test',
                  type: 'function',
                  function: streamToolCall,
                },
              ]
            }
            res.end(JSON.stringify({ choices: [{ message }] }))
            return
          }
        } catch {
          completionBodies.push({ at: Date.now(), body: {} })
        }
        if (jsonCompletionContent && !streamToolCall) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: jsonCompletionContent } }],
            }),
          )
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        if (streamToolCall) {
          const args = streamToolCall.arguments
          const mid = Math.max(1, Math.floor(args.length / 2))
          res.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_test',
                        type: 'function',
                        function: { name: streamToolCall.name, arguments: '' },
                      },
                    ],
                  },
                },
              ],
            })}\n\n`,
          )
          res.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    tool_calls: [{ index: 0, function: { arguments: args.slice(0, mid) } }],
                  },
                },
              ],
            })}\n\n`,
          )
          res.write(
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: {
                    tool_calls: [{ index: 0, function: { arguments: args.slice(mid) } }],
                  },
                },
              ],
            })}\n\n`,
          )
          res.write(
            `data: ${JSON.stringify({
              choices: [{ delta: {}, finish_reason: 'tool_calls' }],
            })}\n\n`,
          )
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }
        const chunks = streamContent
          ? streamContent.split(/(?<=\s)/)
          : [
              { choices: [{ delta: { role: 'assistant' } }] },
              { choices: [{ delta: { content: 'Hello' } }] },
              { choices: [{ delta: { content: ' world' } }] },
              { choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } },
            ]
        for (const chunk of chunks) {
          const frame =
            typeof chunk === 'string' ? { choices: [{ delta: { content: chunk } }] } : chunk
          res.write(`data: ${JSON.stringify(frame)}\n\n`)
        }
        if (midStreamError) {
          res.write(
            `data: ${JSON.stringify({
              error: { message: midStreamError },
              choices: [{ delta: { content: '' }, finish_reason: 'error' }],
            })}\n\n`,
          )
          res.end()
          return
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
