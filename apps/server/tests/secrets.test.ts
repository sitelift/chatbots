import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const originalEncryptionKey = process.env.ENCRYPTION_KEY
const originalDatabasePath = process.env.DATABASE_PATH

describe('resolveAppSecret', () => {
  it('uses ENCRYPTION_KEY from the environment when set', async () => {
    const { resolveAppSecret, secretSource } = await import('../src/lib/secrets')
    expect(resolveAppSecret()).toBe('test-encryption-secret')
    expect(secretSource()).toBe('env')
  })
})

describe('resolveAppSecret file and generated paths', () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'sitelift-secrets-'))

  beforeAll(() => {
    process.env.DATABASE_PATH = path.join(tempDir, 'sitelift.db')
    delete process.env.ENCRYPTION_KEY
    vi.resetModules()
  })

  afterAll(() => {
    process.env.ENCRYPTION_KEY = originalEncryptionKey
    process.env.DATABASE_PATH = originalDatabasePath
    vi.resetModules()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('generates a key on first boot and persists it in the data directory', async () => {
    const { resolveAppSecret, secretSource, secretFilePath } = await import('../src/lib/secrets')
    const keyPath = secretFilePath()
    expect(keyPath).toBe(path.join(tempDir, 'encryption.key'))

    const secret = resolveAppSecret()
    expect(secret.length).toBeGreaterThanOrEqual(32)
    expect(secretSource()).toBe('generated')

    const persisted = readFileSync(keyPath, 'utf8').trim()
    expect(persisted).toBe(secret)
    expect(statSync(keyPath).mode & 0o777).toBe(0o600)
  })

  it('reads an existing key file instead of regenerating', async () => {
    const keyPath = path.join(tempDir, 'encryption.key')
    writeFileSync(keyPath, 'existing-file-key', { mode: 0o600 })
    vi.resetModules()

    const { resolveAppSecret, secretSource } = await import('../src/lib/secrets')
    expect(resolveAppSecret()).toBe('existing-file-key')
    expect(secretSource()).toBe('file')
  })
})
