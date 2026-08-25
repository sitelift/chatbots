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
  return {
    hasKey: Boolean(stored) || Boolean(env.openaiApiKey),
    keyHint: hint,
    keySource: stored ? 'settings' : env.openaiApiKey ? 'env' : 'none',
    baseUrl,
    defaultModel,
    providerPin,
    encryptionAvailable: true,
    encryptionSource: secretSource(),
    encryptionFilePath: secretSource() === 'generated' ? secretFilePath() : null,
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
      return { apiKey, baseUrl, source: 'settings', providerPin: getProviderPin() }
    } catch {}
  }

  if (env.openaiApiKey)
    return { apiKey: env.openaiApiKey, baseUrl, source: 'env', providerPin: getProviderPin() }
  return { apiKey: '', baseUrl, source: 'none', providerPin: getProviderPin() }
}
