import {
  CONTEXT_MESSAGE_LIMIT,
  errorCodes,
  sendMessageRequestSchema,
  submitHandoffRequestSchema,
  unwrapJsonReply,
} from '@sitelift/shared'
import { eq } from 'drizzle-orm'
import { type Context, Hono } from 'hono'
import { stream } from 'hono/streaming'
import { db } from '../db'
import { chatbots } from '../db/schema'
import { logger } from '../lib/logger'
import { checkRateLimit } from '../lib/ratelimit'
import { sseFrame, sseHeaders } from '../lib/sse'
import {
  createConversation,
  findConversation,
  getHistory,
  insertMessage,
} from '../services/conversations'
import { createPendingHandoff, HandoffError, submitHandoff } from '../services/handoffs'
import { type ProviderOptions, ProviderStreamError, streamCompletion } from '../services/provider'
import { resolveModel, resolveProviderCredentials } from '../services/settings'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function originAllowed(allowedDomains: string[], origin: string | undefined): boolean {
  if (allowedDomains.length === 0) return true
  if (!origin) return false
  try {
    const host = new URL(origin).host
    return allowedDomains.some((d) => d === host || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

async function loadActiveChatbot(id: string) {
  const bot = await db.query.chatbots.findFirst({ where: eq(chatbots.id, id) })
  if (bot?.status !== 'active') {
    throw new HttpError(404, errorCodes.NOT_FOUND, 'Chatbot not found')
  }
  return bot
}

async function prepare(c: Context) {
  const chatbotId = c.req.param('chatbotId')
  if (!chatbotId) {
    throw new HttpError(404, errorCodes.NOT_FOUND, 'Chatbot not found')
  }
  const bot = await loadActiveChatbot(chatbotId)

  const origin = c.req.header('Origin') ?? c.req.header('Referer')
  if (!originAllowed(bot.allowedDomains, origin)) {
    throw new HttpError(403, errorCodes.FORBIDDEN_ORIGIN, 'Embedding domain not allowed')
  }

  const parsed = sendMessageRequestSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new HttpError(400, errorCodes.INVALID_CONTENT, 'Invalid message payload')
  }
  const input = parsed.data

  if (!checkRateLimit(input.visitorId)) {
    throw new HttpError(429, errorCodes.TOO_MANY_REQUESTS, 'Too many messages, slow down')
  }

  let conversationId = input.conversationId
  if (conversationId) {
    const existing = await findConversation(chatbotId, conversationId)
    if (!existing) {
      throw new HttpError(403, errorCodes.NOT_FOUND, 'Conversation does not belong to this chatbot')
    }
  } else {
    conversationId = createConversation(chatbotId, input.visitorId)
  }

  const history = getHistory(conversationId, CONTEXT_MESSAGE_LIMIT - 1)
  const userMessageId = insertMessage(conversationId, 'user', input.content)
  const credentials = resolveProviderCredentials()

  if (!credentials.apiKey) {
    throw new HttpError(400, errorCodes.AI_KEY_NOT_CONFIGURED, 'No AI provider key is configured')
  }

  let model: string
  try {
    model = resolveModel(bot.model)
  } catch {
    throw new HttpError(
      500,
      errorCodes.MODEL_NOT_CONFIGURED,
      'No AI model is configured. Set a default model in Settings or pick one for this chatbot.',
    )
  }

  const providerOptions: ProviderOptions = {
    model,
    baseUrl: bot.baseUrl,
    temperature: bot.temperature,
    maxTokens: bot.maxTokens,
    sessionId: conversationId,
    enableHandoffTool: true,
  }

  return {
    bot,
    conversationId,
    userMessageId,
    history,
    userContent: input.content,
    credentials,
    providerOptions,
  }
}

function buildProviderMessages(
  systemPrompt: string,
  history: { role: string; content: string }[],
  userContent: string,
) {
  return [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userContent },
  ]
}

function handleError(c: Context, err: unknown) {
  if (err instanceof HttpError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      err.status as 400 | 403 | 404 | 429,
    )
  }
  logger.error({ err }, 'request failed')
  return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, 500)
}

export const publicRoutes = new Hono()

publicRoutes.get('/chatbots/:id', async (c) => {
  const bot = await db.query.chatbots.findFirst({
    where: eq(chatbots.id, c.req.param('id')),
  })
  if (bot?.status !== 'active') {
    return c.json({ error: { code: errorCodes.NOT_FOUND, message: 'Chatbot not found' } }, 404)
  }
  return c.json({
    id: bot.id,
    name: bot.name,
    welcomeMessage: bot.welcomeMessage,
    brandColor: bot.brandColor,
    avatarUrl: bot.avatarUrl,
    quickReplies: bot.quickReplies,
    showLogo: bot.showLogo,
    showName: bot.showName,
    showOnlineStatus: bot.showOnlineStatus,
    poweredBy: bot.poweredBy,
    status: bot.status,
  })
})

publicRoutes.post('/chat/:chatbotId/messages', async (c) => {
  try {
    const { bot, conversationId, history, userContent, credentials, providerOptions } =
      await prepare(c)
    const result = await streamCompletion(
      buildProviderMessages(bot.systemPrompt, history, userContent),
      providerOptions,
      credentials,
      () => {},
    )
    const reply =
      unwrapJsonReply(result.text) ||
      (result.handoff
        ? (result.handoff.args.intro ?? 'Share your details and someone will follow up.')
        : '')
    const messageId = insertMessage(conversationId, 'assistant', reply || ' ', {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    })
    const body: Record<string, unknown> = { conversationId, messageId, reply }
    if (result.handoff) {
      const pending = createPendingHandoff(conversationId, bot.id, result.handoff.args)
      body.handoff = {
        handoffId: pending.handoffId,
        reason: pending.reason,
        intro: pending.intro,
        fields: pending.fields,
      }
    }
    return c.json(body)
  } catch (err) {
    return handleError(c, err)
  }
})

publicRoutes.post('/chat/:chatbotId/messages/stream', async (c) => {
  const startedAt = performance.now()
  let firstTokenE2eMs: number | null = null

  let prepared: Awaited<ReturnType<typeof prepare>>
  try {
    prepared = await prepare(c)
  } catch (err) {
    return handleError(c, err)
  }

  const { bot, conversationId, userMessageId, history, userContent, credentials, providerOptions } =
    prepared

  c.header('X-Accel-Buffering', 'no')
  for (const [k, v] of Object.entries(sseHeaders())) c.header(k, v)

  const clientSignal = c.req.raw.signal

  return stream(c, async (s) => {
    await s.write(sseFrame({ event: 'meta', conversationId, messageId: userMessageId }))

    let result: Awaited<ReturnType<typeof streamCompletion>> | null = null
    let usage: { promptTokens: number | null; completionTokens: number | null } = {
      promptTokens: null,
      completionTokens: null,
    }

    try {
      result = await streamCompletion(
        buildProviderMessages(bot.systemPrompt, history, userContent),
        providerOptions,
        credentials,
        (text) => {
          if (firstTokenE2eMs === null) {
            firstTokenE2eMs = Math.round(performance.now() - startedAt)
          }
          void s.write(sseFrame({ event: 'token', text }))
        },
        clientSignal,
      )
      usage = {
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
      }
    } catch (err) {
      if (err instanceof ProviderStreamError && err.code === 'CLIENT_CLOSED') {
        logger.info({ chatbotId: bot.id, conversationId }, 'chat stream aborted by visitor')
        return
      }
      if (!clientSignal.aborted) {
        logger.error({ err }, 'provider stream failed')
        const code =
          (err as Error & { code?: string }).code === errorCodes.AI_KEY_NOT_CONFIGURED
            ? errorCodes.AI_KEY_NOT_CONFIGURED
            : errorCodes.AI_PROVIDER_ERROR
        try {
          await s.write(
            sseFrame({
              event: 'error',
              code,
              message: err instanceof ProviderStreamError ? err.message : 'AI provider error',
            }),
          )
        } catch {}
      }
      return
    }

    if (result?.handoff) {
      const pending = createPendingHandoff(conversationId, bot.id, result.handoff.args)
      await s.write(
        sseFrame({
          event: 'handoff',
          handoffId: pending.handoffId,
          reason: pending.reason,
          intro: pending.intro,
          fields: pending.fields,
        }),
      )
    }

    const reply =
      unwrapJsonReply(result?.text) ||
      (result?.handoff
        ? (result.handoff.args.intro ?? 'Share your details and someone will follow up.')
        : '')
    const assistantMessageId = insertMessage(conversationId, 'assistant', reply || ' ', usage)
    await s.write(sseFrame({ event: 'done', conversationId, messageId: assistantMessageId, reply }))

    logger.info(
      {
        chatbotId: bot.id,
        conversationId,
        model: providerOptions.model,
        upstreamProvider: result?.upstreamProvider,
        firstTokenE2eMs,
        totalE2eMs: Math.round(performance.now() - startedAt),
        promptTokens: result?.promptTokens,
        cachedTokens: result?.cachedTokens,
        costUsd: result?.costUsd,
        chars: result?.text.length,
        handoff: Boolean(result?.handoff),
      },
      'chat stream served',
    )
  })
})

publicRoutes.post('/chat/:chatbotId/handoff', async (c) => {
  try {
    const chatbotId = c.req.param('chatbotId')
    if (!chatbotId) {
      throw new HttpError(404, errorCodes.NOT_FOUND, 'Chatbot not found')
    }
    const bot = await loadActiveChatbot(chatbotId)
    const origin = c.req.header('Origin') ?? c.req.header('Referer')
    if (!originAllowed(bot.allowedDomains, origin)) {
      throw new HttpError(403, errorCodes.FORBIDDEN_ORIGIN, 'Embedding domain not allowed')
    }

    const parsed = submitHandoffRequestSchema.safeParse(await c.req.json())
    if (!parsed.success) {
      throw new HttpError(400, errorCodes.INVALID_CONTENT, 'Invalid handoff payload')
    }

    submitHandoff({
      chatbotId,
      conversationId: parsed.data.conversationId,
      visitorId: parsed.data.visitorId,
      handoffId: parsed.data.handoffId,
      answers: parsed.data.answers,
      botName: bot.name,
    })
    return c.json({ ok: true as const })
  } catch (err) {
    if (err instanceof HandoffError) {
      const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'ALREADY_SUBMITTED' ? 409 : 400
      return c.json({ error: { code: err.code, message: err.message } }, status)
    }
    return handleError(c, err)
  }
})
