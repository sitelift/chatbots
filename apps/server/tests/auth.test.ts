import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/index'
import { resetUsers, seedDemoChatbot, signInUser, signUpUser, type TestUser } from './helpers'

let agency: TestUser
let client: TestUser

beforeAll(async () => {
  seedDemoChatbot()
  resetUsers()
  agency = await signUpUser('Owner')
  client = await signUpUser('Client Two')
})

describe('auth bootstrap', () => {
  it('makes the first user agency', async () => {
    const res = await createApp().request('/api/auth/me', { headers: { Cookie: agency.cookie } })
    expect(res.status).toBe(200)
    const me = await res.json()
    expect(me.role).toBe('agency')
  })

  it('makes later users clients', async () => {
    const res = await createApp().request('/api/auth/me', { headers: { Cookie: client.cookie } })
    expect(res.status).toBe(200)
    const me = await res.json()
    expect(me.role).toBe('client')
  })

  it('sign-in works with the same credentials', async () => {
    const signedIn = await signInUser(agency.email, agency.password)
    expect(signedIn.cookie).toContain('sitelift.session_token')
  })

  it('rejects bad credentials', async () => {
    const res = await createApp().request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: agency.email, password: 'wrong-password-xyz' }),
    })
    expect(res.status).toBe(401)
  })
})

describe('role guards', () => {
  it('lets clients through scoped list endpoints', async () => {
    const res = await createApp().request('/api/admin/chatbots', {
      headers: { Cookie: client.cookie },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).chatbots).toEqual([])
  })

  it('blocks clients from agency-only routes', async () => {
    const res = await createApp().request('/api/admin/settings', {
      headers: { Cookie: client.cookie },
    })
    expect(res.status).toBe(403)
  })

  it('allows agency through', async () => {
    const res = await createApp().request('/api/admin/chatbots', {
      headers: { Cookie: agency.cookie },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).chatbots).toBeInstanceOf(Array)
  })

  it('requires a session at all', async () => {
    const res = await createApp().request('/api/admin/settings')
    expect(res.status).toBe(401)
  })
})

describe('chatbot CRUD', () => {
  let createdId = ''

  it('creates a chatbot', async () => {
    const res = await createApp().request('/api/admin/chatbots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({
        name: 'Acme HVAC',
        websiteUrl: 'https://acme.example',
        allowedDomains: ['acme.example'],
        quickReplies: ['Hours?', 'Pricing?'],
        facts: {
          overview: 'Family-owned HVAC in Austin.',
          hours: 'Mon–Fri 8am–6pm',
          faqs: [{ q: 'Emergency service?', a: 'Yes, 24/7 for members.' }],
        },
      }),
    })
    expect(res.status).toBe(201)
    const view = await res.json()
    createdId = view.id
    expect(view.id).toMatch(/^ch_/)
    expect(view.brandColor).toBe('#18181b')
    expect(view.status).toBe('active')
    expect(view.showLogo).toBe(true)
    expect(view.showName).toBe(true)
    expect(view.showOnlineStatus).toBe(true)
    expect(view.poweredBy).toBe(true)
    expect(view.facts).toEqual({
      overview: 'Family-owned HVAC in Austin.',
      hours: 'Mon–Fri 8am–6pm',
      faqs: [{ q: 'Emergency service?', a: 'Yes, 24/7 for members.' }],
    })
    expect(view.systemPrompt).toContain('Business facts:')
    expect(view.systemPrompt).toContain('Overview:\nFamily-owned HVAC in Austin.')
    expect(view.systemPrompt).toContain('Hours:\nMon–Fri 8am–6pm')
    expect(view.systemPrompt).toContain('FAQ:\nQ: Emergency service?\nA: Yes, 24/7 for members.')
    expect(view.systemPrompt).toContain('Reply in plain text only.')
  })

  it('lists it, updates it, deletes it', async () => {
    const list = await createApp().request('/api/admin/chatbots', {
      headers: { Cookie: agency.cookie },
    })
    const body = await list.json()
    expect(body.chatbots.map((c: { id: string }) => c.id)).toContain(createdId)

    const put = await createApp().request(`/api/admin/chatbots/${createdId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ name: 'Acme HVAC & Cooling', status: 'paused' }),
    })
    expect(put.status).toBe(200)
    const updated = await put.json()
    expect(updated.name).toBe('Acme HVAC & Cooling')
    expect(updated.status).toBe('paused')

    const del = await createApp().request(`/api/admin/chatbots/${createdId}`, {
      method: 'DELETE',
      headers: { Cookie: agency.cookie },
    })
    expect(del.status).toBe(204)

    const gone = await createApp().request(`/api/admin/chatbots/${createdId}`, {
      headers: { Cookie: agency.cookie },
    })
    expect(gone.status).toBe(404)
  })

  it('validates input', async () => {
    const res = await createApp().request('/api/admin/chatbots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ name: '' }),
    })
    expect(res.status).toBe(400)
  })
})
