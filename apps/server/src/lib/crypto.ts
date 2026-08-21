import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

function deriveKey(passphrase: string): Buffer {
  return createHash('sha256').update(passphrase, 'utf8').digest()
}

export interface EncryptedSecret {
  iv: string
  data: string
  tag: string
}

export function encryptSecret(plaintext: string, passphrase: string): EncryptedSecret {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, deriveKey(passphrase), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    iv: iv.toString('base64'),
    data: data.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

export function decryptSecret(secret: EncryptedSecret, passphrase: string): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(passphrase),
    Buffer.from(secret.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(secret.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function keyHint(plaintext: string): string {
  if (plaintext.length <= 4) return '••••'
  return plaintext.slice(-4)
}
