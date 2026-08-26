import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const OWNER_BOT = {
  id: 'ch_own1',
  name: 'Bella Café',
  websiteUrl: 'https://bella.test',
  welcomeMessage: 'Hi!',
  brandColor: '#7c3aed',
  avatarUrl: null,
  quickReplies: [],
  showLogo: true,
  showName: true,
  showOnlineStatus: true,
  poweredBy: true,
  systemPrompt: 'prompt',
  model: null,
  baseUrl: null,
  temperature: 0.4,
  maxTokens: 512,
  status: 'active',
  allowedDomains: ['bella.test'],
  facts: { overview: 'Café in Lisbon.' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function editorRoutes(bot = OWNER_BOT) {
  return [
    { path: `/api/admin/chatbots/${bot.id}`, method: 'GET', status: 200, body: bot },
    {
      path: `/api/admin/chatbots/${bot.id}/leads`,
      method: 'GET',
      status: 200,
      body: { leads: [] },
    },
  ]
}

function ownerEditorStub() {
  return stubApi([
    ...editorRoutes(),
    {
      path: '/api/admin/chatbots/ch_own1/stats',
      method: 'GET',
      status: 200,
      body: {
        windowDays: 30,
        days: [],
        totals: { conversations: 0, leads: 0, conversionRate: 0, avgMessagesPerConversation: 0 },
      },
    },
  ])
}

describe('owner portal preview', () => {
  it('hides agency-only tabs and shows the preview banner', async () => {
    ownerEditorStub()
    renderAtLocation('/chatbots/ch_own1?as=owner')

    await screen.findByText('Bella Café')
    const tabBar = await screen.findByRole('tablist')
    const tabNames = Array.from(tabBar.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(tabNames).toEqual(['Leads', 'Knowledge', 'Test'])
    expect(screen.getByText(/previewing the owner portal/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /exit preview/i })).toBeTruthy()
  })

  it('keeps every tab for the agency normally', async () => {
    ownerEditorStub()
    renderAtLocation('/chatbots/ch_own1')

    await screen.findByText('Bella Café')
    const tabBar = await screen.findByRole('tablist')
    const tabNames = Array.from(tabBar.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(tabNames).toEqual(['Leads', 'Knowledge', 'Test', 'Settings'])
    expect(screen.queryByText(/previewing the owner portal/i)).toBeNull()
  })
})

describe('client role gating', () => {
  const CLIENT_USER = {
    id: 'u_c2',
    email: 'jane@bella.test',
    name: 'Jane',
    role: 'client',
  }
  const CLIENT_BOT = { ...OWNER_BOT, id: 'ch_cli1', facts: {} } as typeof OWNER_BOT

  function clientEditorStub() {
    return stubApi([
      { path: '/api/auth/me', status: 200, body: CLIENT_USER },
      ...editorRoutes(CLIENT_BOT),
    ])
  }

  it('redirects clients away from settings and new chatbot routes', async () => {
    stubApi([
      {
        path: '/api/auth/me',
        status: 200,
        body: { id: 'u_c1', email: 'jane@acme.test', name: 'Jane', role: 'client' },
      },
      { path: '/api/admin/chatbots', method: 'GET', status: 200, body: { chatbots: [] } },
    ])

    const { currentPath } = renderAtLocation('/settings')

    await screen.findByText(/a live view of your chatbots/i)
    expect(currentPath()).toBe('/')
  })

  it('keeps agency users on gated pages', async () => {
    stubApi([{ path: '/api/admin/settings', method: 'GET', status: 200, body: {} }])

    renderAtLocation('/settings')

    await screen.findByText(/settings/i)
  })

  it('hides agency-only tabs from clients without showing the preview banner', async () => {
    clientEditorStub()
    renderAtLocation('/chatbots/ch_cli1')

    await screen.findByText('Bella Café')
    const tabBar = await screen.findByRole('tablist')
    const tabNames = Array.from(tabBar.querySelectorAll('button')).map((b) => b.textContent?.trim())
    expect(tabNames).toEqual(['Leads', 'Knowledge', 'Test'])
    expect(screen.queryByText(/previewing the owner portal/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /exit preview/i })).toBeNull()
    await screen.findByRole('tab', { name: /knowledge/i })
    expect(screen.queryByText(/import a website/i)).toBeNull()
  })

  it('ignores ?as=owner for signed-in clients', async () => {
    clientEditorStub()
    renderAtLocation('/chatbots/ch_cli1?as=owner')

    await screen.findByText('Bella Café')
    expect(screen.queryByText(/previewing the owner portal/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /exit preview/i })).toBeNull()
  })
})
