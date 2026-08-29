import {
  HANDOFF_TOOL_NAME,
  offerHandoffToolDefinition,
  parseOfferHandoffArgs,
  type OfferHandoffArgs,
  type RoutingMode,
} from '@sitelift/shared'
import { logger } from '../lib/logger'
import { upstreamFetch } from '../lib/upstream'

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ProviderOptions {
  model: string
  baseUrl?: string | null
  temperature: number
  maxTokens?: number
  /** Sticky-cache key: conversation id sent as `session_id` (OpenRouter) or `prompt_cache_key` (OpenAI). */
  sessionId?: string
  /** Attach the offer_handoff tool so the model can surface a contact form. */
  enableHandoffTool?: boolean
}

export interface ProviderCredentialsLike {
  apiKey: string
  baseUrl: string
  providerPin?: string
  routingMode?: RoutingMode
}

export interface ToolCallResult {
  name: string
  arguments: string
}

export interface HandoffToolCall {
  name: typeof HANDOFF_TOOL_NAME
  args: OfferHandoffArgs
}

const OPENROUTING_LOCKED_THINKING =
  /(?:^|\/)(?:deepseek-r1|deepseek-reasoner)|gemini-3|qwq|-thinking/i
const OPENAI_REASONING_MODELS = /^(o[134](-|$)|gpt-5)/i

function isProvider(baseUrl: string, host: RegExp): boolean {
  return host.test(baseUrl)
}

export function requestBody(
  options: ProviderOptions,
  messages: ProviderMessage[],
  extra: Record<string, unknown>,
  credentials: ProviderCredentialsLike,
) {
  const baseUrl = options.baseUrl ?? credentials.baseUrl
  const isOpenRouter = isProvider(baseUrl, /openrouter\.ai/i)
  const isOpenAiDirect = isProvider(baseUrl, /api\.openai\.com/i)

  const body: Record<string, unknown> = {
    model: options.model,
    messages,
    temperature: options.temperature,
    ...(options.maxTokens !== undefined ? { max_tokens: options.maxTokens } : {}),
  }

  if (options.enableHandoffTool) {
    body.tools = [offerHandoffToolDefinition]
    body.tool_choice = 'auto'
  }

  if (isOpenRouter) {
    if (!OPENROUTING_LOCKED_THINKING.test(options.model)) {
      body.reasoning = { effort: 'none' }
    }
    const mode = credentials.routingMode ?? 'auto'
    if (mode === 'latency') {
      body.provider = { sort: 'latency' }
    } else if (mode === 'throughput') {
      body.provider = { sort: 'throughput' }
    } else if (mode === 'pin' && credentials.providerPin) {
      body.provider = { only: [credentials.providerPin], allow_fallbacks: false }
    }
  } else if (isOpenAiDirect && OPENAI_REASONING_MODELS.test(options.model)) {
    body.reasoning_effort = 'minimal'
  }

  if (options.sessionId) {
    if (isOpenRouter) body.session_id = options.sessionId
    else if (isOpenAiDirect) body.prompt_cache_key = options.sessionId
  }

  return JSON.stringify({ ...body, ...extra })
}

export class ProviderStreamError extends Error {
  constructor(
    public code: 'UPSTREAM_ERROR' | 'UPSTREAM_TIMEOUT' | 'CLIENT_CLOSED',
    message: string,
  ) {
    super(message)
  }
}

const HEADER_TIMEOUT_MS = 15_000
const CHUNK_TIMEOUT_MS = 60_000

export interface StreamResult {
  text: string
  promptTokens: number | null
  completionTokens: number | null
  cachedTokens: number | null
  cacheWriteTokens: number | null
  costUsd: number | null
  upstreamProvider: string | null
  toolCalls: ToolCallResult[]
  handoff: HandoffToolCall | null
}

function safeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

interface ToolCallDelta {
  index?: number
  id?: string
  type?: string
  function?: { name?: string; arguments?: string }
}

interface ParsedChunk {
  text: string
  promptTokens: number | null
  completionTokens: number | null
  cachedTokens: number | null
  cacheWriteTokens: number | null
  costUsd: number | null
  upstreamProvider: string | null
  finishReason: string | null
  errorMessage: string | null
  toolCallDeltas: ToolCallDelta[]
  done: boolean
}

function parseFrame(json: string): ParsedChunk {
  if (json === '[DONE]') {
    return {
      text: '',
      promptTokens: null,
      completionTokens: null,
      cachedTokens: null,
      cacheWriteTokens: null,
      costUsd: null,
      upstreamProvider: null,
      finishReason: null,
      errorMessage: null,
      toolCallDeltas: [],
      done: true,
    }
  }
  const data = JSON.parse(json) as {
    error?: { message?: string; code?: unknown }
    provider?: string
    choices?: {
      delta?: { content?: string; tool_calls?: ToolCallDelta[] }
      message?: { content?: string; tool_calls?: ToolCallDelta[] }
      finish_reason?: string | null
    }[]
    usage?: {
      cost?: number
      prompt_tokens?: number
      completion_tokens?: number
      prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number }
    }
  }
  const choice = data.choices?.[0]
  return {
    text: choice?.delta?.content ?? '',
    promptTokens: data.usage?.prompt_tokens ?? null,
    completionTokens: data.usage?.completion_tokens ?? null,
    cachedTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? null,
    cacheWriteTokens: data.usage?.prompt_tokens_details?.cache_write_tokens ?? null,
    costUsd: typeof data.usage?.cost === 'number' ? data.usage.cost : null,
    upstreamProvider: data.provider ?? null,
    finishReason: choice?.finish_reason ?? null,
    errorMessage:
      data.error?.message ??
      (data.error !== undefined && !data.error.message ? 'Upstream stream error' : null),
    toolCallDeltas: choice?.delta?.tool_calls ?? [],
    done: false,
  }
}

class ToolCallAccumulator {
  private byIndex = new Map<number, { name: string; arguments: string }>()

  apply(deltas: ToolCallDelta[]): void {
    for (const delta of deltas) {
      const index = delta.index ?? 0
      const current = this.byIndex.get(index) ?? { name: '', arguments: '' }
      if (delta.function?.name) current.name += delta.function.name
      if (delta.function?.arguments) current.arguments += delta.function.arguments
      this.byIndex.set(index, current)
    }
  }

  seed(calls: ToolCallDelta[]): void {
    for (const [i, call] of calls.entries()) {
      this.byIndex.set(call.index ?? i, {
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '',
      })
    }
  }

  results(): ToolCallResult[] {
    return [...this.byIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, value]) => value)
      .filter((value) => value.name)
  }
}

export function resolveHandoffToolCall(toolCalls: ToolCallResult[]): HandoffToolCall | null {
  for (const call of toolCalls) {
    if (call.name !== HANDOFF_TOOL_NAME) continue
    const args = parseOfferHandoffArgs(call.arguments)
    if (args) return { name: HANDOFF_TOOL_NAME, args }
  }
  return null
}

async function completeOnce(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: ProviderCredentialsLike,
  responseFormat: Record<string, unknown> | null,
): Promise<{ text: string; toolCalls: ToolCallResult[]; handoff: HandoffToolCall | null }> {
  const res = await upstreamFetch(`${options.baseUrl ?? credentials.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${credentials.apiKey}`,
    },
    body: requestBody(
      options,
      messages,
      responseFormat ? { response_format: responseFormat } : {},
      credentials,
    ),
    signal: AbortSignal.timeout(300_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`)
  }

  const body = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>
      }
    }>
  }
  const message = body.choices?.[0]?.message
  const acc = new ToolCallAccumulator()
  acc.seed(
    (message?.tool_calls ?? []).map((call, index) => ({
      index,
      function: { name: call.function?.name, arguments: call.function?.arguments },
    })),
  )
  const toolCalls = acc.results()
  return {
    text: message?.content ?? '',
    toolCalls,
    handoff: resolveHandoffToolCall(toolCalls),
  }
}

export async function completePlain(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: ProviderCredentialsLike,
): Promise<string> {
  const result = await completeOnce(messages, options, credentials, null)
  return result.text
}

export async function completeWithTools(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: ProviderCredentialsLike,
): Promise<{ text: string; toolCalls: ToolCallResult[]; handoff: HandoffToolCall | null }> {
  return completeOnce(messages, { ...options, enableHandoffTool: true }, credentials, null)
}

export async function completeJson(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: ProviderCredentialsLike,
): Promise<string> {
  const result = await completeOnce(messages, options, credentials, { type: 'json_object' })
  return result.text
}

const STREAM_CONNECT_ATTEMPTS = 2

async function openUpstreamStream(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: ProviderCredentialsLike,
  controller: AbortController,
): Promise<Awaited<ReturnType<typeof upstreamFetch>>> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < STREAM_CONNECT_ATTEMPTS; attempt += 1) {
    if (controller.signal.aborted) throw new Error(`pre-aborted before attempt ${attempt}`)
    try {
      const res = await upstreamFetch(
        `${options.baseUrl ?? credentials.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${credentials.apiKey}`,
          },
          body: requestBody(
            options,
            messages,
            {
              stream: true,
              stream_options: { include_usage: true },
            },
            credentials,
          ),
          signal: controller.signal,
        },
      )
      return res
    } catch (err) {
      lastErr = err
      const isTransportLevel =
        err instanceof TypeError ||
        (err instanceof Error && (err as NodeJS.ErrnoException).code !== undefined)
      if (!isTransportLevel || attempt === STREAM_CONNECT_ATTEMPTS - 1) throw err
      await new Promise((r) => setTimeout(r, 120))
    }
  }
  throw lastErr
}

export async function streamCompletion(
  messages: ProviderMessage[],
  options: ProviderOptions,
  credentials: ProviderCredentialsLike,
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const startedAt = performance.now()
  const provider = safeHost(options.baseUrl ?? credentials.baseUrl)
  const streamOptions: ProviderOptions = { ...options, enableHandoffTool: true }

  const controller = new AbortController()
  let timedOut = false
  let clientGone = false

  const abortForTimeout = () => {
    timedOut = true
    controller.abort()
  }
  const abortForClient = () => {
    clientGone = true
    controller.abort()
  }

  if (signal) {
    if (signal.aborted) abortForClient()
    else signal.addEventListener('abort', abortForClient, { once: true })
  }

  const headerTimer = setTimeout(abortForTimeout, HEADER_TIMEOUT_MS)
  let firstTokenAt: number | null = null
  let ttfbMs: number | null = null
  let text = ''
  let promptTokens: number | null = null
  let completionTokens: number | null = null
  let cachedTokens: number | null = null
  let cacheWriteTokens: number | null = null
  let costUsd: number | null = null
  let upstreamProvider: string | null = null
  const toolAcc = new ToolCallAccumulator()

  try {
    const res = await openUpstreamStream(messages, streamOptions, credentials, controller)
    clearTimeout(headerTimer)
    ttfbMs = Math.round(performance.now() - startedAt)

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '')
      logger.warn(
        {
          provider,
          model: options.model,
          ttfbMs,
          status: res.status,
          detail: detail.slice(0, 300),
        },
        'provider request failed',
      )
      throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      for (;;) {
        const chunkTimer = setTimeout(abortForTimeout, CHUNK_TIMEOUT_MS)
        let readResult: Awaited<ReturnType<typeof reader.read>>
        try {
          readResult = await reader.read()
        } finally {
          clearTimeout(chunkTimer)
        }
        const { done, value } = readResult
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const frames = buffer.split('\n\n')
        buffer = frames.pop() ?? ''
        let sawDone = false

        for (const frame of frames) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '))
          if (!line) continue
          const chunk = parseFrame(line.slice(6))

          if (chunk.errorMessage) {
            throw new ProviderStreamError('UPSTREAM_ERROR', chunk.errorMessage)
          }
          if (chunk.finishReason === 'error') {
            throw new ProviderStreamError('UPSTREAM_ERROR', 'Provider disconnected unexpectedly')
          }

          if (chunk.upstreamProvider) upstreamProvider = chunk.upstreamProvider
          if (chunk.cachedTokens !== null) cachedTokens = chunk.cachedTokens
          if (chunk.cacheWriteTokens !== null) cacheWriteTokens = chunk.cacheWriteTokens
          if (chunk.costUsd !== null) costUsd = chunk.costUsd
          if (chunk.toolCallDeltas.length) toolAcc.apply(chunk.toolCallDeltas)

          if (chunk.text) {
            if (firstTokenAt === null) firstTokenAt = performance.now()
            text += chunk.text
            onToken(chunk.text)
          }
          if (chunk.promptTokens !== null) promptTokens = chunk.promptTokens
          if (chunk.completionTokens !== null) completionTokens = chunk.completionTokens
          if (chunk.done) {
            sawDone = true
            break
          }
        }
        if (sawDone) break
      }
    } finally {
      void reader.cancel().catch(() => {})
    }
  } catch (err) {
    if (clientGone) throw new ProviderStreamError('CLIENT_CLOSED', 'Visitor left the chat')
    if (timedOut && !(err instanceof ProviderStreamError)) {
      throw new ProviderStreamError(
        'UPSTREAM_TIMEOUT',
        firstTokenAt === null
          ? `No response from ${provider} within ${HEADER_TIMEOUT_MS / 1000}s`
          : `Provider stalled mid-stream (${CHUNK_TIMEOUT_MS / 1000}s without tokens)`,
      )
    }
    throw err
  } finally {
    clearTimeout(headerTimer)
    if (signal) signal.removeEventListener('abort', abortForClient)
    logger.info(
      {
        provider,
        upstreamProvider,
        model: options.model,
        ttfbMs,
        ttftMs: firstTokenAt === null ? null : Math.round(firstTokenAt - startedAt),
        totalMs: Math.round(performance.now() - startedAt),
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheWriteTokens,
        costUsd,
        chars: text.length,
        toolCalls: toolAcc.results().map((c) => c.name),
      },
      'provider stream complete',
    )
  }

  const toolCalls = toolAcc.results()
  return {
    text,
    promptTokens,
    completionTokens,
    cachedTokens,
    cacheWriteTokens,
    costUsd,
    upstreamProvider,
    toolCalls,
    handoff: resolveHandoffToolCall(toolCalls),
  }
}
