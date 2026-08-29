import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { settings } from '../src/db/schema'
import { createApp } from '../src/index'
import { requestBody } from '../src/services/provider'
import { resolveProviderCredentials } from '../src/services/settings'
import {
  clearDefaultModel,
  DEMO_CHATBOT_ID,
  getLastModelsAuthHeader,
  resetUsers,
  seedDemoChatbot,
  setDefaultModel,
  signUpUser,
  startMockProvider,
  type TestUser,
} from './helpers'

let agency: TestUser

const headers = () => ({ 'Content-Type': 'application/json', Cookie: agency.cookie })

beforeAll(async () => {
  seedDemoChatbot()
  resetUsers()
  setDefaultModel('test-mini')
  agency = await signUpUser('Owner')
})

afterAll(() => {
  db.delete(settings).run()
})

describe('admin settings API', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await createApp().request('/api/admin/settings')
    expect(res.status).toBe(401)
  })

  it('reports env-provided key before anything is stored', async () => {
    const res = await createApp().request('/api/admin/settings', { headers: headers() })
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
      headers: headers(),
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

  it('loads a normalized model catalog from a local endpoint', async () => {
    let mock: Server | undefined
    try {
      mock = await startMockProvider(4107)
      const res = await createApp().request(
        `/api/admin/models?baseUrl=${encodeURIComponent('http://127.0.0.1:4107/v1')}`,
        { headers: headers() },
      )
      expect(res.status).toBe(200)
      const { models } = await res.json()
      expect(models).toHaveLength(1)
      expect(models[0]).toMatchObject({
        id: 'test-mini',
        name: 'Test Mini',
        contextLength: 8000,
        promptPricePerM: 2,
        completionPricePerM: 6,
      })
    } finally {
      mock?.close()
    }
  })

  it('forwards the stored API key when loading catalogs', async () => {
    let mock: Server | undefined
    try {
      mock = await startMockProvider(4108, { requireAuth: true })
      const res = await createApp().request(
        `/api/admin/models?baseUrl=${encodeURIComponent('http://127.0.0.1:4108/v1')}`,
        { headers: headers() },
      )
      expect(res.status).toBe(200)
      expect(getLastModelsAuthHeader()).toBe('Bearer sk-live-abcd1234efgh')
    } finally {
      mock?.close()
    }
  })

  it('refuses to load catalogs from unsupported hosts', async () => {
    const res = await createApp().request(
      `/api/admin/models?baseUrl=${encodeURIComponent('https://evil.example.com/v1')}`,
      { headers: headers() },
    )
    expect(res.status).toBe(502)
    expect((await res.json()).error.code).toBe('UNSUPPORTED_PROVIDER')
  })

  it('chat uses settings-stored credentials end to end', async () => {
    let mock: Server | undefined
    try {
      mock = await startMockProvider(4107)
      const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages`, {
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

  it('stores and clears the global default model', async () => {
    const put = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ defaultModel: 'my-custom-model' }),
    })
    expect(put.status).toBe(200)
    expect((await put.json()).defaultModel).toBe('my-custom-model')

    const cleared = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ defaultModel: '' }),
    })
    expect(cleared.status).toBe(200)
    expect((await cleared.json()).defaultModel).toBe('')
  })

  it('stores and clears the OpenRouter provider pin', async () => {
    const put = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ providerPin: 'deepseek' }),
    })
    expect(put.status).toBe(200)
    expect((await put.json()).providerPin).toBe('deepseek')
    expect(resolveProviderCredentials().providerPin).toBe('deepseek')

    const cleared = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ providerPin: '  ' }),
    })
    expect(cleared.status).toBe(200)
    expect((await cleared.json()).providerPin).toBe('')
    expect(resolveProviderCredentials().providerPin).toBe('')
  })

  it('stores and resets the OpenRouter routing mode', async () => {
    const put = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ routingMode: 'latency' }),
    })
    expect(put.status).toBe(200)
    expect((await put.json()).routingMode).toBe('latency')

    const bad = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ routingMode: 'fastest-possible' }),
    })
    expect(bad.status).toBe(400)

    const cleared = await createApp().request('/api/admin/settings', {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ routingMode: 'auto' }),
    })
    expect(cleared.status).toBe(200)
    expect((await cleared.json()).routingMode).toBe('auto')
  })

  it('pins requests to a provider only when routing mode is "pin" on OpenRouter', () => {
    const options = { model: 'test-mini', temperature: 0 }
    const messages = [{ role: 'user' as const, content: 'hi' }]
    const withPin = requestBody(
      options,
      messages,
      {},
      {
        apiKey: 'k',
        baseUrl: 'https://openrouter.ai/api/v1',
        providerPin: 'deepseek',
        routingMode: 'pin',
      },
    )
    expect(JSON.parse(withPin).provider).toEqual({
      only: ['deepseek'],
      allow_fallbacks: false,
    })

    const withoutPin = requestBody(
      options,
      messages,
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', routingMode: 'pin' },
    )
    expect(JSON.parse(withoutPin).provider).toBeUndefined()

    const unpinnedMode = requestBody(
      options,
      messages,
      {},
      {
        apiKey: 'k',
        baseUrl: 'https://openrouter.ai/api/v1',
        providerPin: 'deepseek',
        routingMode: 'auto',
      },
    )
    expect(JSON.parse(unpinnedMode).provider).toBeUndefined()

    const nonOpenRouter = requestBody(
      options,
      messages,
      {},
      {
        apiKey: 'k',
        baseUrl: 'https://api.openai.com/v1',
        providerPin: 'deepseek',
        routingMode: 'pin',
      },
    )
    expect(JSON.parse(nonOpenRouter).provider).toBeUndefined()
  })

  it('sorts by latency or throughput instead of price-weighted load balancing', () => {
    const options = { model: 'test-mini', temperature: 0 }
    const messages = [{ role: 'user' as const, content: 'hi' }]
    const byLatency = requestBody(
      options,
      messages,
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', routingMode: 'latency' },
    )
    expect(JSON.parse(byLatency).provider).toEqual({ sort: 'latency' })
    const byThroughput = requestBody(
      options,
      messages,
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', routingMode: 'throughput' },
    )
    expect(JSON.parse(byThroughput).provider).toEqual({ sort: 'throughput' })
    const auto = requestBody(
      options,
      messages,
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1', routingMode: 'auto' },
    )
    expect(JSON.parse(auto).provider).toBeUndefined()
  })

  it('suppresses thinking with the dialect each provider expects', () => {
    const orOptions = { model: 'openai/gpt-4o-mini', temperature: 0 }
    const or = requestBody(
      orOptions,
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1' },
    )
    expect(JSON.parse(or).reasoning).toEqual({ effort: 'none' })

    const lockedModel = requestBody(
      { model: 'deepseek/deepseek-r1', temperature: 0 },
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1' },
    )
    expect(JSON.parse(lockedModel).reasoning).toBeUndefined()

    const openaiReasoning = requestBody(
      { model: 'gpt-5-mini', temperature: 0 },
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://api.openai.com/v1' },
    )
    expect(JSON.parse(openaiReasoning).reasoning_effort).toBe('minimal')

    const openaiNonReasoning = requestBody(
      { model: 'gpt-4o-mini', temperature: 0 },
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://api.openai.com/v1' },
    )
    expect(JSON.parse(openaiNonReasoning).reasoning_effort).toBeUndefined()
    expect(JSON.parse(openaiNonReasoning).reasoning).toBeUndefined()

    const groq = requestBody(
      { model: 'llama-3.3-70b-versatile', temperature: 0 },
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://api.groq.com/openai/v1' },
    )
    expect(JSON.parse(groq).reasoning).toBeUndefined()
  })

  it('sends a sticky-cache session id per provider dialect', () => {
    const or = requestBody(
      { model: 'openai/gpt-4o-mini', temperature: 0, sessionId: 'cv_123' },
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://openrouter.ai/api/v1' },
    )
    expect(JSON.parse(or).session_id).toBe('cv_123')

    const openai = requestBody(
      { model: 'gpt-4o-mini', temperature: 0, sessionId: 'cv_123' },
      [],
      {},
      { apiKey: 'k', baseUrl: 'https://api.openai.com/v1' },
    )
    expect(JSON.parse(openai).prompt_cache_key).toBe('cv_123')
    expect(JSON.parse(openai).session_id).toBeUndefined()

    const other = requestBody(
      { model: 'test-mini', temperature: 0, sessionId: 'cv_123' },
      [],
      {},
      { apiKey: 'k', baseUrl: 'http://127.0.0.1:4107/v1' },
    )
    expect(JSON.parse(other).session_id).toBeUndefined()
    expect(JSON.parse(other).prompt_cache_key).toBeUndefined()
  })

  it('rejects chat with a clear error when no model is configured anywhere', async () => {
    clearDefaultModel()
    try {
      const res = await createApp().request(`/api/chat/${DEMO_CHATBOT_ID}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: 'visitor_no_model', content: 'hello' }),
      })
      expect(res.status).toBe(500)
      const body = await res.json()
      expect(body.error.code).toBe('MODEL_NOT_CONFIGURED')
      expect(body.error.message).toContain('Set a default model in Settings')
    } finally {
      setDefaultModel('test-mini')
    }
  })

  it('stores SMTP settings encrypted and can send a test email', async () => {
    const { setMailTransportForTests } = await import('../src/services/mailer')
    const sent: string[] = []
    setMailTransportForTests({
      sendMail: async (opts) => {
        sent.push(opts.to)
        return {}
      },
    })
    try {
      const put = await createApp().request('/api/admin/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          smtp: {
            host: 'smtp.example.com',
            port: 465,
            secure: true,
            user: 'mailer',
            pass: 'smtp-secret-9999',
            from: 'leads@example.com',
            alsoNotify: 'ops@example.com',
          },
        }),
      })
      expect(put.status).toBe(200)
      const view = await put.json()
      expect(view.smtp.configured).toBe(true)
      expect(view.smtp.hasPass).toBe(true)
      expect(view.smtp.passHint).toBe('9999')
      expect(JSON.stringify(view)).not.toContain('smtp-secret-9999')

      const test = await createApp().request('/api/admin/settings/smtp/test', {
        method: 'POST',
        headers: headers(),
        body: '{}',
      })
      expect(test.status).toBe(200)
      expect(sent).toEqual([agency.email])
    } finally {
      setMailTransportForTests(null)
    }
  })
})
