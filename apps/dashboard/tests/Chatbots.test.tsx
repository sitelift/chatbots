import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, type StubRoute, stubApi } from './router'

const now = '2026-01-01T00:00:00.000Z'

function bot(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    websiteUrl: 'https://acme.com',
    welcomeMessage: 'Hi!',
    brandColor: '#18181b',
    avatarUrl: null,
    quickReplies: [],
    poweredBy: true,
    systemPrompt: '',
    model: 'gpt-4o-mini',
    baseUrl: null,
    temperature: 0.7,
    maxTokens: 512,
    status: 'active',
    allowedDomains: ['acme.com'],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('ChatbotsPage', () => {
  it('shows the empty state when there are no chatbots', async () => {
    stubApi([{ path: '/api/admin/chatbots', method: 'GET', status: 200, body: { chatbots: [] } }])
    renderAtLocation('/chatbots')

    expect(await screen.findByText('No chatbots yet')).toBeDefined()
  })

  it('lists existing chatbots with status badges', async () => {
    stubApi([
      {
        path: '/api/admin/chatbots',
        method: 'GET',
        status: 200,
        body: {
          chatbots: [bot('ch_1', 'Acme HVAC'), bot('ch_2', 'Bella Dental', { status: 'paused' })],
        },
      },
    ])
    renderAtLocation('/chatbots')

    expect(await screen.findByText('Acme HVAC')).toBeDefined()
    expect(screen.getByText('Bella Dental')).toBeDefined()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getByText('Paused')).toBeDefined()
  })

  it('navigates to the setup wizard from the New chatbot button', async () => {
    stubApi([{ path: '/api/admin/chatbots', method: 'GET', status: 200, body: { chatbots: [] } }])
    const rr = renderAtLocation('/chatbots')

    fireEvent.click(await screen.findByText('New chatbot'))
    await waitFor(() => {
      expect(rr.currentPath()).toBe('/chatbots/new')
    })
  })

  it('navigates to the editor when a row is clicked', async () => {
    stubApi([
      {
        path: '/api/admin/chatbots',
        method: 'GET',
        status: 200,
        body: { chatbots: [bot('ch_1', 'Acme HVAC')] },
      },
      {
        path: '/api/admin/chatbots/ch_1',
        method: 'GET',
        status: 200,
        body: { ...bot('ch_1', 'Acme HVAC'), facts: { overview: 'Family HVAC in Austin.' } },
      },
      {
        path: '/api/admin/chatbots/ch_1/leads',
        method: 'GET',
        status: 200,
        body: { leads: [] },
      },
    ])
    renderAtLocation('/chatbots')

    fireEvent.click(await screen.findByText('Acme HVAC'))
    expect(await screen.findByText('Captured leads')).toBeDefined()
  })

  it('arms delete before sending the DELETE request', async () => {
    const routes: StubRoute[] = [
      { path: '/api/admin/chatbots/ch_test1', method: 'DELETE', status: 204 },
      {
        path: '/api/admin/chatbots',
        method: 'GET',
        status: 200,
        body: { chatbots: [bot('ch_test1', 'Acme HVAC')] },
      },
    ]
    const fetchMock = stubApi(routes)
    renderAtLocation('/chatbots')
    await screen.findByText('Acme HVAC')

    const deleteBtn = screen.getByLabelText('Delete Acme HVAC')
    fireEvent.click(deleteBtn)
    expect(screen.getByText('Confirm?')).toBeDefined()

    fireEvent.click(screen.getByText('Confirm?'))
    await waitFor(() => {
      const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')
      expect(deletes).toHaveLength(1)
      expect(deletes[0]?.[0]).toBe('/api/admin/chatbots/ch_test1')
    })
  })
})
