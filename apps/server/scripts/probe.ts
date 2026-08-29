import { composeSystemPrompt, unwrapJsonReply } from '@sitelift/shared'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { chatbots } from '../src/db/schema'
import { resolveProviderCredentials } from '../src/services/settings'

const bot = db.select().from(chatbots).where(eq(chatbots.id, 'ch_demo')).get()
if (!bot?.factsJson) throw new Error('no demo bot / facts')
const prompt = composeSystemPrompt(JSON.parse(bot.factsJson))
const creds = resolveProviderCredentials()
const question = process.argv[2] ?? 'How much does a website cost?'

const res = await fetch(`${creds.baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${creds.apiKey}` },
  body: JSON.stringify({
    model: bot.model,
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: question },
    ],
    temperature: bot.temperature,
    max_tokens: bot.maxTokens,
  }),
})
const data = (await res.json()) as {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string }
}
if (!res.ok || !data.choices) {
  console.error('provider error', res.status, JSON.stringify(data).slice(0, 500))
  process.exit(1)
}
const raw = data.choices[0]?.message?.content ?? ''
console.log(`model=${bot.model} temp=${bot.temperature} maxTokens=${bot.maxTokens}`)
console.log('--- raw ---')
console.log(raw || JSON.stringify(data).slice(0, 500))
console.log('--- unwrapped ---')
console.log(unwrapJsonReply(raw))
