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
  it('blocks clients from admin routes', async () => {
    const res = await createApp().request('/api/admin/chatbots', {
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
        systemPrompt: 'You help Acme customers.',
        allowedDomains: ['acme.example'],
        quickReplies: ['Hours?', 'Pricing?'],
      }),
    })
    expect(res.status).toBe(201)
    const view = await res.json()
    createdId = view.id
    expect(view.id).toMatch(/^ch_/)
    expect(view.brandColor).toBe('#18181b')
    expect(view.status).toBe('active')
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
