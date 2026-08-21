import { Hono } from 'hono'
import { db } from '../db'

export const health = new Hono().get('/', (c) => {
  const stmt = db.$client.prepare('SELECT 1')
  stmt.get()
  return c.json({ status: 'ok' })
})
