import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { settings } from '../src/db/schema'
import { createApp } from '../src/index'
import { resolveProviderCredentials } from '../src/services/settings'
import { seedDemoChatbot, startMockProvider } from './helpers'

const AUTH = { Authorization: 'Bearer test-admin-token' }

beforeAll(() => {
  seedDemoChatbot()
})

afterAll(() => {
  db.delete(settings).run()
})

describe('admin settings API', () => {
  it('rejects requests without a valid token', async () => {
    const app = createApp()
    const noToken = await app.request('/api/admin/settings')
    expect(noToken.status).toBe(401)

    const badToken = await app.request('/api/admin/settings', {
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(badToken.status).toBe(401)
  })

  it('reports env-provided key before anything is stored', async () => {
    const res = await createApp().request('/api/admin/settings', { headers: AUTH })
    expect(res.status).toBe(200)
    const view = await res.json()
    expect(view.hasKey).toBe(true)
    expect(view.keySource).toBe('env')
    expect(view.keyHint).toBe('')
  })

  it('stores the key encrypted and only exposes a hint', async () => {
    const app = createApp()
    const put = await app.request('/api/admin/settings', {
      method: 'PUT',
      headers: { ...AUTH, 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'sk-live-abcd1234efgh', baseUrl: 'http://127.0.0.1:4107/v1' }),
    })
    expect(put.status).toBe(200)
    const view = await put.json()
    expect(view.hasKey).toBe(true)
    expect(view.keySource).toBe('settings')
    expect(view.keyHint).toBe('efgh')
    expect(JSON.stringify(view)).not.toContain('sk-live-abcd1234efgh')

    const row = db
      .select()
      .from(settings)
      .all()
      .find((r) => r.key === 'ai_api_key_enc')
    expect(row?.value).toBeDefined()
    expect(row?.value).not.toContain('sk-live-abcd1234efgh')
  })

  it('resolves credentials from settings with decryption', async () => {
    const creds = resolveProviderCredentials()
    expect(creds.source).toBe('settings')
    expect(creds.apiKey).toBe('sk-live-abcd1234efgh')
    expect(creds.baseUrl).toBe('http://127.0.0.1:4107/v1')
  })

  it('chat uses settings-stored credentials end to end', async () => {
    let mock: Server | undefined
    try {
      mock = await startMockProvider(4107)
      const res = await createApp().request('/api/chat/ch_demo/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: 'visitor_settings_01', content: 'hello' }),
      })
      expect(res.status).toBe(200)
      expect((await res.json()).reply).toBe('Hello world')
    } finally {
      mock?.close()
    }
  })
})
