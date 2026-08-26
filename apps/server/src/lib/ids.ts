import { randomBytes } from 'node:crypto'

const prefixes = {
  chatbot: 'ch',
  conversation: 'cv',
  message: 'msg',
  user: 'usr',
  account: 'ac',
  verification: 'ver',
} as const

export function newId(kind: keyof typeof prefixes): string {
  return `${prefixes[kind]}_${randomBytes(9).toString('base64url')}`
}

export function newToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url')
}
