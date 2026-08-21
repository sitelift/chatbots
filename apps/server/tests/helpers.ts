import type { Server } from 'node:http'
import { createServer } from 'node:http'
import { db } from '../src/db'
import { chatbots } from '../src/db/schema'

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
