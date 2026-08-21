import { randomBytes } from 'node:crypto'

const prefixes = {
  chatbot: 'ch',
  conversation: 'cv',
  message: 'msg',
} as const

export function newId(kind: keyof typeof prefixes): string {
  return `${prefixes[kind]}_${randomBytes(9).toString('base64url')}`
}
