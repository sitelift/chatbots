import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatbotsPage } from '../src/pages/Chatbots'

function bot(overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString()
  return {
    id: 'ch_test1',
    name: 'Acme HVAC',
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

interface StubResponse {
  status: number
  body?: unknown
}

function stubFetch(responses: StubResponse[]) {
  let call = 0
  const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
    void init
    const response = responses[Math.min(call, responses.length - 1)]
    if (!response) throw new Error('No more stubbed fetch responses')
    call++
    return {
      ok: response.status < 400,
      status: response.status,
      json: async () => response.body ?? {},
      text: async () => JSON.stringify(response.body ?? {}),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('ChatbotsPage', () => {
  it('shows the empty state when there are no chatbots', async () => {
    stubFetch([{ status: 200, body: { chatbots: [] } }])
    render(<ChatbotsPage onEdit={() => {}} />)

    expect(await screen.findByText('No chatbots yet')).toBeDefined()
  })

  it('lists existing chatbots with status badges', async () => {
    stubFetch([
      {
        status: 200,
        body: { chatbots: [bot(), bot({ id: 'ch_2', name: 'Bella Dental', status: 'paused' })] },
      },
    ])
    render(<ChatbotsPage onEdit={() => {}} />)

    expect(await screen.findByText('Acme HVAC')).toBeDefined()
    expect(screen.getByText('Bella Dental')).toBeDefined()
    expect(screen.getAllByText('active').length).toBeGreaterThan(0)
    expect(screen.getByText('paused')).toBeDefined()
    expect(screen.getByText('Bella Dental')).toBeDefined()
    expect(screen.getAllByText('active').length).toBeGreaterThan(0)
    expect(screen.getByText('paused')).toBeDefined()
  })

  it('creates a chatbot through the form and shows it in the list', async () => {
    const created = bot({ id: 'ch_new', name: 'Nova Plumbing' })
    const fetchMock = stubFetch([
      { status: 200, body: { chatbots: [] } },
      { status: 201, body: created },
    ])
    render(<ChatbotsPage onEdit={() => {}} />)

    fireEvent.click(await screen.findByText('New chatbot'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nova Plumbing' } })
    fireEvent.click(screen.getByText('Create chatbot'))

    await waitFor(() => {
      expect(screen.getByText('Nova Plumbing')).toBeDefined()
    })

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === 'POST',
    )
    expect(postCall?.[0]).toBe('/api/admin/chatbots')
    const init = (postCall?.[1] ?? {}) as RequestInit
    const body = JSON.parse(String(init.body ?? '{}'))
    expect(body.name).toBe('Nova Plumbing')
    expect(body.brandColor).toBe('#18181b')
  })

  it('rejects an invalid create client-side via the shared contract', async () => {
    const fetchMock = stubFetch([{ status: 200, body: { chatbots: [] } }])
    render(<ChatbotsPage onEdit={() => {}} />)

    fireEvent.click(await screen.findByText('New chatbot'))
    fireEvent.click(screen.getByText('Create chatbot'))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST'),
      ).toHaveLength(0)
    })
  })

  it('arms delete before sending the DELETE request', async () => {
    const fetchMock = stubFetch([{ status: 200, body: { chatbots: [bot()] } }, { status: 204 }])
    render(<ChatbotsPage onEdit={() => {}} />)
    await screen.findByText('Acme HVAC')

    const deleteBtn = screen.getByLabelText('Delete Acme HVAC')
    fireEvent.click(deleteBtn)
    expect(screen.getByText('Confirm?')).toBeDefined()
    expect(
      fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'DELETE'),
    ).toHaveLength(0)

    fireEvent.click(screen.getByText('Confirm?'))
    await waitFor(() => {
      const deletes = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === 'DELETE',
      )
      expect(deletes).toHaveLength(1)
      expect(deletes[0]?.[0]).toBe('/api/admin/chatbots/ch_test1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Acme HVAC')).toBeNull()
    })
  })
})
