import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { clientAssignments, user, verification } from '../src/db/schema'
import { createApp } from '../src/index'
import { resetUsers, seedDemoChatbot, signInUser, signUpUser, type TestUser } from './helpers'

let agency: TestUser

beforeAll(async () => {
  seedDemoChatbot()
  resetUsers()
  agency = await signUpUser('Owner')
})

async function acceptInvite(token: string, password: string): Promise<Response> {
  return createApp().request('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: password }),
  })
}

describe('POST /api/admin/clients', () => {
  let setupToken = ''

  it('creates an invited client with a one-time setup token', async () => {
    const res = await createApp().request('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ email: 'jane@acme.test', name: 'Jane Doe' }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as { client: { id: string; role: string }; setupToken: string }
    expect(body.client.role).toBe('client')
    expect(body.setupToken.length).toBeGreaterThan(10)
    setupToken = body.setupToken
  })

  it('rejects duplicate emails', async () => {
    const res = await createApp().request('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ email: 'jane@acme.test' }),
    })
    expect(res.status).toBe(409)
  })

  it('accepts the invite and the password signs in', async () => {
    const res = await acceptInvite(setupToken, 'a-strong-password-1')
    expect(res.status).toBe(200)

    const signedIn = await signInUser('jane@acme.test', 'a-strong-password-1')
    expect(signedIn.cookie).toContain('sitelift.session_token')

    const reused = await acceptInvite(setupToken, 'another-password-x')
    expect(reused.status).toBe(400)
  })

  it('rejects wrong payloads', async () => {
    const res = await acceptInvite('not-a-real-token-value', 'a-strong-password-1')
    expect(res.status).toBe(400)
  })
})

describe('invite token expiry + reset', () => {
  it('refuses expired tokens', async () => {
    const created = await createApp().request('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ email: 'old@acme.test' }),
    })
    const { setupToken } = (await created.json()) as { setupToken: string }
    const row = db
      .select()
      .from(verification)
      .where(eq(verification.identifier, `reset-password:${setupToken}`))
      .get()
    if (row) {
      db.update(verification)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(verification.id, row.id))
        .run()
    }
    const res = await acceptInvite(setupToken, 'a-strong-password-1')
    expect(res.status).toBe(400)
  })

  it('reset invalidates old tokens and yields a working new one', async () => {
    const created = await createApp().request('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ email: 'reset@acme.test', name: 'Reset Me' }),
    })
    const first = (await created.json()) as { client: { id: string }; setupToken: string }

    await acceptInvite(first.setupToken, 'first-password-11')

    const reset = await createApp().request(`/api/admin/clients/${first.client.id}/reset`, {
      method: 'POST',
      headers: { Cookie: agency.cookie },
    })
    expect(reset.status).toBe(200)
    const second = (await reset.json()) as { setupToken: string }

    const stale = await acceptInvite(first.setupToken, 'stale-password-12')
    expect(stale.status).toBe(400)

    const fresh = await acceptInvite(second.setupToken, 'second-password-2')
    expect(fresh.status).toBe(200)
    const signedIn = await signInUser('reset@acme.test', 'second-password-2')
    expect(signedIn.cookie).toContain('sitelift.session_token')
  })
})

describe('PUT /clients/:id/chatbots + DELETE /clients/:id', () => {
  it('assigns then removes a client with cascades', async () => {
    const created = await createApp().request('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ email: 'gone@acme.test' }),
    })
    const { client } = (await created.json()) as { client: { id: string; chatbotIds: string[] } }

    const assigned = await createApp().request(`/api/admin/clients/${client.id}/chatbots`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: agency.cookie },
      body: JSON.stringify({ chatbotIds: ['ch_demo'] }),
    })
    expect(assigned.status).toBe(200)
    expect(((await assigned.json()) as { chatbotIds: string[] }).chatbotIds).toEqual(['ch_demo'])

    const del = await createApp().request(`/api/admin/clients/${client.id}`, {
      method: 'DELETE',
      headers: { Cookie: agency.cookie },
    })
    expect(del.status).toBe(204)

    const rows = db
      .select()
      .from(clientAssignments)
      .all()
      .filter((a) => a.userId === client.id)
    expect(rows).toHaveLength(0)

    const after = db.select().from(user).where(eq(user.id, client.id)).get()
    expect(after).toBeUndefined()
  })
})

describe('agency-side guards stay intact', () => {
  it('blocks non-agency sessions from client management', async () => {
    const invitee = await signUpUser('Extra Client')

    const res = await createApp().request('/api/admin/clients', {
      headers: { Cookie: invitee.cookie },
    })
    expect(res.status).toBe(403)
  })
})
