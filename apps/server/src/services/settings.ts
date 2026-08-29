import type { RoutingMode } from '@sitelift/shared'
import { isRoutingMode } from '@sitelift/shared'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { settings } from '../db/schema'
import { env } from '../env'
import { decryptSecret, type EncryptedSecret, encryptSecret, keyHint } from '../lib/crypto'
import { resolveAppSecret, secretFilePath, secretSource } from '../lib/secrets'

const AI_KEY_ROW = 'ai_api_key_enc'
const AI_BASE_URL_ROW = 'ai_base_url'
const AI_DEFAULT_MODEL_ROW = 'ai_default_model'
const AI_PROVIDER_PIN_ROW = 'ai_provider_pin'
const AI_ROUTING_ROW = 'ai_routing_mode'
const SMTP_HOST_ROW = 'smtp_host'
const SMTP_PORT_ROW = 'smtp_port'
const SMTP_SECURE_ROW = 'smtp_secure'
const SMTP_USER_ROW = 'smtp_user'
const SMTP_PASS_ROW = 'smtp_pass_enc'
const SMTP_FROM_ROW = 'smtp_from'
const SMTP_ALSO_NOTIFY_ROW = 'smtp_also_notify'

interface StoredKey {
  secret: EncryptedSecret
  hint: string
}

export interface ProviderCredentials {
  apiKey: string
  baseUrl: string
  source: 'settings' | 'env' | 'none'
  /** OpenRouter provider slug to pin requests to (empty = automatic routing). */
  providerPin: string
  /** OpenRouter routing strategy for chat traffic. */
  routingMode: RoutingMode
}

export class SettingsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
  }
}

function getSetting(key: string): string | null {
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  return row?.value ?? null
}

function setSetting(key: string, value: string): void {
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
    .run()
}

export function getAdminSettingsView() {
  const stored = getSetting(AI_KEY_ROW)
  const baseUrl = getSetting(AI_BASE_URL_ROW) ?? ''
  const defaultModel = getSetting(AI_DEFAULT_MODEL_ROW) ?? ''
  const providerPin = getSetting(AI_PROVIDER_PIN_ROW) ?? ''
  let hint = ''
  if (stored) {
    try {
      hint = (JSON.parse(stored) as StoredKey).hint
    } catch {}
  }
  let smtpPassHint = ''
  const smtpPassStored = getSetting(SMTP_PASS_ROW)
  if (smtpPassStored) {
    try {
      smtpPassHint = (JSON.parse(smtpPassStored) as StoredKey).hint
    } catch {}
  }
  const smtpHost = getSetting(SMTP_HOST_ROW) ?? ''
  const smtpFrom = getSetting(SMTP_FROM_ROW) ?? ''
  return {
    hasKey: Boolean(stored) || Boolean(env.openaiApiKey),
    keyHint: hint,
    keySource: stored ? 'settings' : env.openaiApiKey ? 'env' : 'none',
    baseUrl,
    defaultModel,
    providerPin,
    routingMode: getRoutingMode(),
    encryptionAvailable: true,
    encryptionSource: secretSource(),
    encryptionFilePath: secretSource() === 'generated' ? secretFilePath() : null,
    smtp: {
      host: smtpHost,
      port: Number(getSetting(SMTP_PORT_ROW) ?? 587) || 587,
      secure: getSetting(SMTP_SECURE_ROW) === '1',
      user: getSetting(SMTP_USER_ROW) ?? '',
      hasPass: Boolean(smtpPassStored),
      passHint: smtpPassHint,
      from: smtpFrom,
      alsoNotify: getSetting(SMTP_ALSO_NOTIFY_ROW) ?? '',
      configured: Boolean(smtpHost.trim() && smtpFrom.trim()),
    },
  }
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
  alsoNotify: string
}

export function getSmtpConfig(): SmtpConfig | null {
  const host = getSetting(SMTP_HOST_ROW)?.trim() ?? ''
  const from = getSetting(SMTP_FROM_ROW)?.trim() ?? ''
  if (!host || !from) return null
  let pass = ''
  const stored = getSetting(SMTP_PASS_ROW)
  if (stored) {
    try {
      pass = decryptSecret((JSON.parse(stored) as StoredKey).secret, resolveAppSecret())
    } catch {
      pass = ''
    }
  }
  return {
    host,
    port: Number(getSetting(SMTP_PORT_ROW) ?? 587) || 587,
    secure: getSetting(SMTP_SECURE_ROW) === '1',
    user: getSetting(SMTP_USER_ROW)?.trim() ?? '',
    pass,
    from,
    alsoNotify: getSetting(SMTP_ALSO_NOTIFY_ROW)?.trim().toLowerCase() ?? '',
  }
}

export function saveSmtpSettings(input: {
  host?: string
  port?: number
  secure?: boolean
  user?: string
  pass?: string
  from?: string
  alsoNotify?: string
}): void {
  if (input.host !== undefined) {
    const host = input.host.trim()
    if (host) setSetting(SMTP_HOST_ROW, host)
    else db.delete(settings).where(eq(settings.key, SMTP_HOST_ROW)).run()
  }
  if (input.port !== undefined) setSetting(SMTP_PORT_ROW, String(input.port))
  if (input.secure !== undefined) setSetting(SMTP_SECURE_ROW, input.secure ? '1' : '0')
  if (input.user !== undefined) {
    const user = input.user.trim()
    if (user) setSetting(SMTP_USER_ROW, user)
    else db.delete(settings).where(eq(settings.key, SMTP_USER_ROW)).run()
  }
  if (input.pass !== undefined && input.pass !== '') {
    const stored: StoredKey = {
      secret: encryptSecret(input.pass, resolveAppSecret()),
      hint: keyHint(input.pass),
    }
    setSetting(SMTP_PASS_ROW, JSON.stringify(stored))
  }
  if (input.from !== undefined) {
    const from = input.from.trim()
    if (from) setSetting(SMTP_FROM_ROW, from)
    else db.delete(settings).where(eq(settings.key, SMTP_FROM_ROW)).run()
  }
  if (input.alsoNotify !== undefined) {
    const also = input.alsoNotify.trim().toLowerCase()
    if (also) setSetting(SMTP_ALSO_NOTIFY_ROW, also)
    else db.delete(settings).where(eq(settings.key, SMTP_ALSO_NOTIFY_ROW)).run()
  }
}

export function saveDefaultModel(model: string): void {
  const trimmed = model.trim()
  if (trimmed === '') {
    db.delete(settings).where(eq(settings.key, AI_DEFAULT_MODEL_ROW)).run()
    return
  }
  setSetting(AI_DEFAULT_MODEL_ROW, trimmed)
}

export function getDefaultModel(): string {
  return getSetting(AI_DEFAULT_MODEL_ROW) ?? ''
}

export function getProviderPin(): string {
  return getSetting(AI_PROVIDER_PIN_ROW) ?? ''
}

export function saveRoutingMode(mode: RoutingMode): void {
  if (mode === 'auto') {
    db.delete(settings).where(eq(settings.key, AI_ROUTING_ROW)).run()
    return
  }
  setSetting(AI_ROUTING_ROW, mode)
}

export function getRoutingMode(): RoutingMode {
  const stored = getSetting(AI_ROUTING_ROW)
  if (isRoutingMode(stored)) return stored
  if (getSetting(AI_PROVIDER_PIN_ROW)?.trim()) return 'pin'
  return 'auto'
}

export function saveProviderPin(pin: string): void {
  const trimmed = pin.trim()
  if (trimmed === '') {
    db.delete(settings).where(eq(settings.key, AI_PROVIDER_PIN_ROW)).run()
    return
  }
  setSetting(AI_PROVIDER_PIN_ROW, trimmed)
}

export function resolveModel(model: string | null): string {
  if (model && model.trim() !== '') return model
  const global = getDefaultModel()
  if (global) return global
  throw new SettingsError(
    'MODEL_NOT_CONFIGURED',
    'No AI model is configured. Set a default model in Settings or pick one for this chatbot.',
  )
}

export function saveApiKey(plaintext: string, baseUrl?: string): void {
  const passphrase = resolveAppSecret()
  const stored: StoredKey = {
    secret: encryptSecret(plaintext, passphrase),
    hint: keyHint(plaintext),
  }
  setSetting(AI_KEY_ROW, JSON.stringify(stored))
  if (baseUrl !== undefined) setSetting(AI_BASE_URL_ROW, baseUrl.trim())
}

export function saveBaseUrl(baseUrl: string): void {
  setSetting(AI_BASE_URL_ROW, baseUrl.trim())
}

export function resolveProviderCredentials(): ProviderCredentials {
  const baseUrl =
    getSetting(AI_BASE_URL_ROW)?.trim() || env.openaiBaseUrl || 'https://api.openai.com/v1'

  const stored = getSetting(AI_KEY_ROW)
  if (stored) {
    const passphrase = resolveAppSecret()
    try {
      const apiKey = decryptSecret((JSON.parse(stored) as StoredKey).secret, passphrase)
      return {
        apiKey,
        baseUrl,
        source: 'settings',
        providerPin: getProviderPin(),
        routingMode: getRoutingMode(),
      }
    } catch {}
  }

  if (env.openaiApiKey)
    return {
      apiKey: env.openaiApiKey,
      baseUrl,
      source: 'env',
      providerPin: getProviderPin(),
      routingMode: getRoutingMode(),
    }
  return {
    apiKey: '',
    baseUrl,
    source: 'none',
    providerPin: getProviderPin(),
    routingMode: getRoutingMode(),
  }
}
