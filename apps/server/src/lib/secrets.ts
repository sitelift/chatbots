import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { env } from '../env'

const KEY_FILE = 'encryption.key'

export type SecretSource = 'env' | 'file' | 'generated'

let cachedSecret: string | null = null
let cachedSource: SecretSource | null = null

function readKeyFile(): string | null {
  const keyPath = path.join(path.dirname(env.databasePath), KEY_FILE)
  if (!existsSync(keyPath)) return null
  const value = readFileSync(keyPath, 'utf8').trim()
  return value.length > 0 ? value : null
}

function generateAndPersist(): string {
  const keyPath = path.join(path.dirname(env.databasePath), KEY_FILE)
  const secret = randomBytes(32).toString('base64')
  mkdirSync(path.dirname(keyPath), { recursive: true })
  writeFileSync(keyPath, secret, { mode: 0o600 })
  return secret
}

export function resolveAppSecret(): string {
  if (cachedSecret !== null) return cachedSecret

  const fromEnv = process.env.ENCRYPTION_KEY
  if (fromEnv && fromEnv.trim() !== '') {
    cachedSecret = fromEnv
    cachedSource = 'env'
    return fromEnv
  }

  const fromFile = readKeyFile()
  if (fromFile) {
    cachedSecret = fromFile
    cachedSource = 'file'
    return fromFile
  }

  cachedSecret = generateAndPersist()
  cachedSource = 'generated'
  return cachedSecret
}

export function secretSource(): SecretSource {
  resolveAppSecret()
  return cachedSource ?? 'generated'
}

export function secretFilePath(): string {
  return path.join(path.dirname(env.databasePath), KEY_FILE)
}
