export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderOptions {
  model: string
  baseUrl?: string | null
  temperature: number
  maxTokens: number
}

export interface StreamResult {
  text: string
  promptTokens: number | null
  completionTokens: number | null
}

interface ParsedChunk {
  text: string
  promptTokens: number | null
  completionTokens: number | null
  done: boolean
}

function parseFrame(json: string): ParsedChunk {
  if (json === '[DONE]') return { text: '', promptTokens: null, completionTokens: null, done: true }
  const data = JSON.parse(json) as {
    choices?: { delta?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }
  return {
    text: data.choices?.[0]?.delta?.content ?? '',
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
    done: false,
  }
}

export async function completePlain(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: { apiKey: string; baseUrl: string },
): Promise<string> {
  const res = await fetch(`${options.baseUrl ?? credentials.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`)
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return body.choices?.[0]?.message?.content ?? ''
}

export async function completeJson(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: { apiKey: string; baseUrl: string },
): Promise<string> {
  const res = await fetch(`${options.baseUrl ?? credentials.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: { type: 'json_object' },
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`)
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  return body.choices?.[0]?.message?.content ?? ''
}

export async function streamCompletion(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: { apiKey: string; baseUrl: string },
  onToken: (text: string) => void,
): Promise<StreamResult> {
  const res = await fetch(`${options.baseUrl ?? credentials.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`)
  }

  let text = ''
  let promptTokens: number | null = null
  let completionTokens: number | null = null
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''

    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const chunk = parseFrame(line.slice(6))
      if (chunk.text) {
        text += chunk.text
        onToken(chunk.text)
      }
      if (chunk.promptTokens !== null) promptTokens = chunk.promptTokens
      if (chunk.completionTokens !== null) completionTokens = chunk.completionTokens
      if (chunk.done) break
    }
  }

  return { text, promptTokens, completionTokens }
}
