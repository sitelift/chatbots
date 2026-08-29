import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const now = '2026-01-01T00:00:00.000Z'

const EMPTY_STATS = {
  windowDays: 30,
  days: [{ date: '2026-01-01', conversations: 0, leads: 0, messages: 0 }],
  totals: { conversations: 0, leads: 0, conversionRate: 0, avgMessagesPerConversation: 0 },
}

function createdBot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch_new',
    name: 'Nova Plumbing',
    websiteUrl: 'https://novaplumbing.com',
    welcomeMessage: 'Hi! How can I help?',
    brandColor: '#18181b',
    avatarUrl: null,
    quickReplies: [],
    showLogo: true,
    showName: true,
    showOnlineStatus: true,
    poweredBy: true,
    systemPrompt: '',
    model: 'gpt-4o-mini',
    baseUrl: null,
    temperature: 0.4,
    maxTokens: 512,
    status: 'active',
    allowedDomains: [],
    facts: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('NewChatbot wizard', () => {
  it('opens at /chatbots/new with the name field first', async () => {
    stubApi([])
    renderAtLocation('/chatbots/new')

    expect(await screen.findByRole('heading', { name: /bot for/ })).toBeDefined()
    expect(await screen.findByLabelText(/Name/)).toBeDefined()
  })

  it('requires a name before advancing to Knowledge', async () => {
    stubApi([])
    renderAtLocation('/chatbots/new')

    fireEvent.click(await screen.findByText('Continue'))

    expect(await screen.findByText(/give the chatbot a name/i)).toBeDefined()
    expect(screen.queryByText('Import a website')).toBeNull()
  })

  it('leads with import on the Knowledge step when no facts exist', async () => {
    stubApi([])
    renderAtLocation('/chatbots/new')

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: 'Nova Plumbing' },
    })
    fireEvent.click(screen.getByText('Continue'))

    expect(await screen.findByText('Import a website')).toBeDefined()
  })

  it('keeps the import card when adding example facts and lets you clear them', async () => {
    stubApi([])
    renderAtLocation('/chatbots/new')

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: 'Nova Plumbing' },
    })
    fireEvent.click(screen.getByText('Continue'))
    await screen.findByText('Import a website')

    const overviewSection = document.getElementById('fact-overview')
    expect(overviewSection).not.toBeNull()
    const overview = within(overviewSection as HTMLElement)
    fireEvent.click(overview.getByText('Show example'))

    expect((screen.getByLabelText('About us') as HTMLTextAreaElement).value).toBe(
      'Family-owned HVAC company in Austin since 1998. NATE-certified, licensed and bonded.',
    )
    expect(screen.getByText('Import a website')).toBeDefined()

    fireEvent.click(overview.getByText('Clear example'))
    expect((screen.getByLabelText('About us') as HTMLTextAreaElement).value).toBe('')
  })

  it('creates the chatbot and lands on the editor inbox tab', async () => {
    const created = createdBot({ facts: { overview: 'Plumbing in Austin.' } })
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots', method: 'POST', status: 201, body: created },
      { path: '/api/admin/chatbots/ch_new', method: 'GET', status: 200, body: created },
      {
        path: /^\/api\/admin\/chatbots\/ch_new\/conversations/,
        method: 'GET',
        status: 200,
        body: { conversations: [] },
      },
      {
        path: '/api/admin/chatbots/ch_new/stats',
        method: 'GET',
        status: 200,
        body: EMPTY_STATS,
      },
    ])
    const rr = renderAtLocation('/chatbots/new')

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: 'Nova Plumbing' },
    })
    fireEvent.click(screen.getByText('Continue'))

    fireEvent.change(await screen.findByLabelText('About us'), {
      target: { value: 'Plumbing in Austin.' },
    })
    fireEvent.click(await screen.findByText('Continue'))
    fireEvent.click(await screen.findByText('Continue'))

    fireEvent.click(await screen.findByText('Create chatbot'))

    await waitFor(() => {
      expect(rr.currentPath()).toBe('/chatbots/ch_new')
    })
    expect(await screen.findByRole('tab', { name: 'Inbox' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Inbox' }).getAttribute('aria-selected')).toBe('true')
    expect(await screen.findByText('0 threads')).toBeDefined()

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(postCall?.[0]).toBe('/api/admin/chatbots')
    const body = JSON.parse(String(postCall?.[1]?.body))
    expect(body.name).toBe('Nova Plumbing')
    expect(body.facts.overview).toBe('Plumbing in Austin.')
  })

  it('lets you type a hex brand color on the Look & greet step', async () => {
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots', method: 'POST', status: 201, body: createdBot() },
    ])
    renderAtLocation('/chatbots/new')

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: 'Nova Plumbing' },
    })
    fireEvent.click(screen.getByText('Continue'))
    await screen.findByText('Import a website')
    fireEvent.click(screen.getByText('Continue'))

    const hexInput = (await screen.findByLabelText('Brand color hex')) as HTMLInputElement

    fireEvent.change(hexInput, { target: { value: '#' } })
    expect(hexInput.value).toBe('#')
    fireEvent.change(hexInput, { target: { value: '#ff' } })
    expect(hexInput.value).toBe('#FF')
    fireEvent.change(hexInput, { target: { value: '#ff0000' } })
    expect(hexInput.value).toBe('#FF0000')

    fireEvent.change(hexInput, { target: { value: '' } })
    expect(hexInput.value).toBe('')
    fireEvent.blur(hexInput)
    expect(hexInput.value).toBe('#FF0000')

    fireEvent.click(screen.getByText('Continue'))
    fireEvent.click(screen.getByText('Create chatbot'))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(postCall).toBeDefined()
    })
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(postCall?.[1]?.body)).brandColor).toBe('#ff0000')
  })

  it('sends the chosen status in the create payload', async () => {
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots', method: 'POST', status: 201, body: createdBot() },
    ])
    renderAtLocation('/chatbots/new')

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: 'Nova Plumbing' },
    })
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.click(await screen.findByText('Continue'))
    fireEvent.click(await screen.findByText('Continue'))

    fireEvent.click(await screen.findByRole('button', { name: 'Paused' }))
    fireEvent.click(screen.getByText('Create chatbot'))

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
      expect(postCall).toBeDefined()
    })
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(JSON.parse(String(postCall?.[1]?.body)).status).toBe('paused')
  })
})
