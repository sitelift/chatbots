import { beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/index'
import { resetUsers, signUpUser } from './helpers'

beforeAll(() => {
  resetUsers()
})

describe('GET /api/auth/bootstrap', () => {
  it('reports hasUsers=false on an empty database', async () => {
    const res = await createApp().request('/api/auth/bootstrap')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasUsers: false })
  })

  it('reports hasUsers=true once an account exists', async () => {
    await signUpUser('Owner')
    const res = await createApp().request('/api/auth/bootstrap')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hasUsers: true })
  })
})
