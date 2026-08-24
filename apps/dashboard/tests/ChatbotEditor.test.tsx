import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const now = '2026-01-01T00:00:00.000Z'

const EMPTY_STATS = {
  windowDays: 30,
  days: [{ date: '2026-01-01', conversations: 0, leads: 0, messages: 0 }],
  totals: { conversations: 0, leads: 0, conversionRate: 0, avgMessagesPerConversation: 0 },
}

function view(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch_edit1',
    name: 'Acme HVAC',
    websiteUrl: 'https://acme.com',
    welcomeMessage: 'Hi!',
    brandColor: '#18181b',
    avatarUrl: null,
    quickReplies: ['Hours?'],
    poweredBy: true,
    systemPrompt: 'You help Acme customers.',
    model: 'gpt-4o-mini',
    baseUrl: null,
    temperature: 0.7,
    maxTokens: 512,
    status: 'active',
    allowedDomains: ['acme.com'],
    facts: {
      overview: 'Family HVAC in Austin.',
      hours: 'Mon–Fri 8–6',
      contact: '(512) 555-0100',
      faqs: [{ q: 'Do you fix furnaces?', a: 'Yes.' }],
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function editorStub(overrides: Record<string, unknown> = {}) {
  return stubApi([
    { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view(overrides) },
    { path: '/api/admin/chatbots/ch_edit1/leads', method: 'GET', status: 200, body: { leads: [] } },
    {
      path: '/api/admin/chatbots/ch_edit1/stats',
      method: 'GET',
      status: 200,
      body: EMPTY_STATS,
    },
  ])
}

async function openTab(label: string) {
  fireEvent.click(await screen.findByRole('tab', { name: label }))
}

describe('ChatbotEditor', () => {
  it('defaults to the leads tab and shows captured leads', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: '/api/admin/chatbots/ch_edit1/leads',
        method: 'GET',
        status: 200,
        body: {
          leads: [
            {
              id: 'cv_1',
              visitorName: 'Maria',
              visitorEmail: 'maria@test.dev',
              lastMessage: 'My AC is blowing warm air',
              messageCount: 4,
              createdAt: now,
            },
          ],
        },
      },
      {
        path: '/api/admin/chatbots/ch_edit1/stats',
        method: 'GET',
        status: 200,
        body: EMPTY_STATS,
      },
    ])
    renderAtLocation('/chatbots/ch_edit1')

    expect(await screen.findByText('Maria')).toBeDefined()
    expect(screen.getByText('maria@test.dev')).toBeDefined()
    expect(screen.getByText(/My AC is blowing warm air/)).toBeDefined()
  })

  it('renders 30-day activity stats above the leads inbox', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: '/api/admin/chatbots/ch_edit1/leads',
        method: 'GET',
        status: 200,
        body: { leads: [] },
      },
      {
        path: '/api/admin/chatbots/ch_edit1/stats',
        method: 'GET',
        status: 200,
        body: {
          windowDays: 30,
          days: [{ date: '2026-01-01', conversations: 4, leads: 1, messages: 11 }],
          totals: {
            conversations: 12,
            leads: 3,
            conversionRate: 0.25,
            avgMessagesPerConversation: 5.5,
          },
        },
      },
    ])
    renderAtLocation('/chatbots/ch_edit1')

    expect(await screen.findByText('Last 30 days')).toBeDefined()
    expect(screen.getByText('Leads captured')).toBeDefined()
    expect(screen.getByText('25%')).toBeDefined()
    expect(screen.getByText('Msgs / conversation')).toBeDefined()
  })

  it('lands fresh bots without facts on the Knowledge tab', async () => {
    editorStub({ facts: null })
    renderAtLocation('/chatbots/ch_edit1')

    expect(await screen.findByText('Import a website')).toBeDefined()
    expect(screen.queryByText('Captured leads')).toBeNull()
  })

  it('prefills structured facts on the Knowledge tab', async () => {
    editorStub()
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Knowledge')

    expect(((await screen.findByLabelText('About us')) as HTMLTextAreaElement).value).toBe(
      'Family HVAC in Austin.',
    )
    expect((screen.getByLabelText('Hours') as HTMLTextAreaElement).value).toBe('Mon–Fri 8–6')
  })

  it('saves edited fields through PUT', async () => {
    const updated = view({ name: 'Acme HVAC & Cooling' })
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      { path: '/api/admin/chatbots/ch_edit1', method: 'PUT', status: 200, body: updated },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Settings')

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Acme HVAC & Cooling' },
    })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeDefined()
    })

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall?.[0]).toBe('/api/admin/chatbots/ch_edit1')
    expect(JSON.parse(String(putCall?.[1]?.body)).name).toBe('Acme HVAC & Cooling')
  })

  it('browses models from the global provider when no per-bot override exists', async () => {
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: '/api/admin/settings',
        method: 'GET',
        status: 200,
        body: {
          hasKey: true,
          keyHint: '',
          keySource: 'settings',
          baseUrl: 'https://openrouter.ai/api/v1',
          encryptionAvailable: true,
        },
      },
      {
        path: /\/api\/admin\/models\?/,
        method: 'GET',
        status: 200,
        body: {
          models: [
            {
              id: 'or-model',
              name: 'OR Model',
              contextLength: 64000,
              promptPricePerM: 0.15,
              completionPricePerM: 0.6,
            },
          ],
        },
      },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Settings')

    fireEvent.click(await screen.findByLabelText(/Model: gpt-4o-mini/))
    const searchBox = await screen.findByLabelText('Search models')
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /OR Model/ })).toBeDefined()
    })

    const catalogCall = fetchMock.mock.calls.find(([path]) =>
      String(path).startsWith('/api/admin/models'),
    )
    expect(catalogCall?.[0]).toBe(
      `/api/admin/models?baseUrl=${encodeURIComponent('https://openrouter.ai/api/v1')}`,
    )

    fireEvent.change(searchBox, { target: { value: 'or' } })
    fireEvent.click(screen.getByRole('option', { name: /OR Model/ }))
    expect(screen.getByLabelText('Model: or-model')).toBeDefined()
  })

  it('arms delete before sending DELETE', async () => {
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      { path: '/api/admin/chatbots/ch_edit1', method: 'DELETE', status: 204 },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Settings')
    await screen.findByLabelText('Name')

    fireEvent.click(screen.getByLabelText('Delete Acme HVAC'))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)

    fireEvent.click(screen.getByLabelText('Confirm delete'))
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
    })
  })

  it('imports facts from a website and applies them', async () => {
    const fetchMock = stubApi([
      {
        path: '/api/admin/chatbots/ch_edit1',
        method: 'GET',
        status: 200,
        body: view({ facts: null }),
      },
      {
        path: '/api/admin/import',
        method: 'POST',
        status: 200,
        body: {
          source: 'https://acme.com',
          facts: {
            overview: 'Acme HVAC imports!',
            hours: 'Mon–Fri 8am–6pm',
            services: 'Repairs and installs',
            faqs: [{ q: 'Emergency?', a: 'Yes 24/7.' }],
          },
        },
      },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Knowledge')

    fireEvent.change(await screen.findByLabelText('Website URL to import'), {
      target: { value: 'https://acme.com' },
    })
    fireEvent.click(screen.getByText('Import'))

    await waitFor(() => {
      expect(screen.getByText(/Read 3 of 8 sections/)).toBeDefined()
    })
    fireEvent.click(screen.getByText('Use these facts'))

    await waitFor(() => {
      expect((screen.getByLabelText('About us') as HTMLTextAreaElement).value).toBe(
        'Acme HVAC imports!',
      )
    })
    expect(
      fetchMock.mock.calls.find(([path]) => String(path) === '/api/admin/import'),
    ).toBeDefined()
  })

  it('tests the bot with current facts', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: '/api/admin/chatbots/ch_edit1/test',
        method: 'POST',
        status: 200,
        body: { reply: 'We are open Mon–Fri 8–6.' },
      },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Test')

    fireEvent.change(await screen.findByLabelText('Test message'), {
      target: { value: 'What are your hours?' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      expect(screen.getByText('We are open Mon–Fri 8–6.')).toBeDefined()
    })
  })

  it('shows coverage for filled facts', async () => {
    editorStub()
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Knowledge')

    expect(await screen.findByText(/3 of 7 covered/)).toBeDefined()
  })

  it('hides import once facts exist and clears them from the danger zone', async () => {
    editorStub()
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Knowledge')

    expect(await screen.findByLabelText('Clear all facts')).toBeDefined()
    expect(screen.queryByLabelText('Website URL to import')).toBeNull()

    fireEvent.click(screen.getByLabelText('Clear all facts'))
    fireEvent.click(screen.getByLabelText('Confirm clear all facts'))

    expect((screen.getByLabelText('About us') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByLabelText('Clear all facts')).toBeNull()
    expect(screen.getByLabelText('Website URL to import')).toBeDefined()
  })
})
