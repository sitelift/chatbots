import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const ME = {
  id: 'u_test',
  email: 'owner@test.dev',
  name: 'Owner',
  role: 'agency',
}

function meCalls(mock: ReturnType<typeof stubApi>): number {
  return mock.mock.calls.filter(([path]) => path === '/api/auth/me').length
}

function overviewStubs() {
  return stubApi([
    { path: '/api/auth/me', status: 200, body: ME },
    {
      path: '/api/admin/chatbots',
      status: 200,
      body: { chatbots: [] },
    },
    {
      path: '/api/admin/stats',
      status: 200,
      body: {
        chatbotsTotal: 0,
        chatbotsActive: 0,
        conversations: 0,
        leads: 0,
        messages: 0,
      },
    },
  ])
}

describe('session fetch dedupe', () => {
  it('fetches /api/auth/me exactly once per load across guard and provider', async () => {
    const mock = overviewStubs()
    renderAtLocation('/')

    await screen.findByRole('heading', { name: 'Overview' })
    expect(meCalls(mock)).toBe(1)
  })

  it('keeps reusing the shared session across client-side navigation', async () => {
    const mock = overviewStubs()
    const { rawRouter } = renderAtLocation('/')

    await screen.findByRole('heading', { name: 'Overview' })
    expect(meCalls(mock)).toBe(1)

    await rawRouter.navigate({ to: '/chatbots' })
    await screen.findByRole('heading', { name: 'Chatbots' })
    expect(meCalls(mock)).toBe(1)
  })
})
