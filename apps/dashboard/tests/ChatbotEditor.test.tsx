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
    showLogo: true,
    showName: true,
    showOnlineStatus: true,
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
    {
      path: /^\/api\/admin\/chatbots\/ch_edit1\/conversations/,
      method: 'GET',
      status: 200,
      body: { conversations: [] },
    },
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
  it('defaults to the inbox tab and lists conversations', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: /^\/api\/admin\/chatbots\/ch_edit1\/conversations/,
        method: 'GET',
        status: 200,
        body: {
          conversations: [
            {
              id: 'cv_1',
              visitorName: 'Maria',
              visitorEmail: 'maria@test.dev',
              reason: null,
              lastMessage: 'My AC is blowing warm air',
              messageCount: 4,
              isLead: true,
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
    expect(screen.getByText(/My AC is blowing warm air/)).toBeDefined()
    expect(screen.getByText('Lead')).toBeDefined()
  })

  it('opens a full thread when a conversation is selected', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: /^\/api\/admin\/chatbots\/ch_edit1\/conversations\?/,
        method: 'GET',
        status: 200,
        body: {
          conversations: [
            {
              id: 'cv_1',
              visitorName: 'Maria',
              visitorEmail: 'maria@test.dev',
              reason: null,
              lastMessage: 'My AC is blowing warm air',
              messageCount: 2,
              isLead: true,
              createdAt: now,
            },
          ],
        },
      },
      {
        path: '/api/admin/chatbots/ch_edit1/conversations/cv_1',
        method: 'GET',
        status: 200,
        body: {
          id: 'cv_1',
          visitorName: 'Maria',
          visitorEmail: 'maria@test.dev',
          reason: 'Wants a repair quote',
          isLead: true,
          createdAt: now,
          messages: [
            {
              id: 'm1',
              role: 'user',
              content: 'My AC is blowing warm air',
              createdAt: now,
            },
            {
              id: 'm2',
              role: 'assistant',
              content: 'I can help with that.',
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

    fireEvent.click(await screen.findByText('Maria'))
    expect(await screen.findByText('I can help with that.')).toBeDefined()
    expect(screen.getByText('Wants a repair quote')).toBeDefined()
    expect(screen.getByRole('link', { name: 'maria@test.dev' })).toBeDefined()
  })

  it('renders 30-day activity stats above the inbox', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: /^\/api\/admin\/chatbots\/ch_edit1\/conversations/,
        method: 'GET',
        status: 200,
        body: { conversations: [] },
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
    expect(screen.queryByText('Select a conversation')).toBeNull()
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

  it('saves widget settings (logo, name, online status) through PUT', async () => {
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      { path: '/api/admin/chatbots/ch_edit1', method: 'PUT', status: 200, body: view() },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Settings')

    expect(await screen.findByText('Widget Settings')).toBeDefined()
    expect(screen.getByRole('button', { name: /Upload logo/ })).toBeDefined()

    fireEvent.click(screen.getByLabelText('Show logo'))
    fireEvent.click(screen.getByLabelText('Show business name'))
    fireEvent.click(screen.getByLabelText('Show “Online now” status'))
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeDefined()
    })

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    const body = JSON.parse(String(putCall?.[1]?.body))
    expect(body.showLogo).toBe(false)
    expect(body.showName).toBe(false)
    expect(body.showOnlineStatus).toBe(false)
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

  it('sends prior turns as history on the next test message', async () => {
    stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: '/api/admin/chatbots/ch_edit1/test',
        method: 'POST',
        status: 200,
        body: { reply: 'Want to set up a discovery call?' },
      },
    ])
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Test')

    fireEvent.click(await screen.findByLabelText(/Dry run/i))

    fireEvent.change(await screen.findByLabelText('Test message'), {
      target: { value: 'Tell me about pricing' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))
    await waitFor(() => {
      expect(screen.getByText('Want to set up a discovery call?')).toBeDefined()
    })

    const fetchMock = stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      {
        path: '/api/admin/chatbots/ch_edit1/test',
        method: 'POST',
        status: 200,
        body: { reply: 'Great — I will take your details.' },
      },
    ])

    fireEvent.change(screen.getByLabelText('Test message'), {
      target: { value: 'yes' },
    })
    fireEvent.click(screen.getByLabelText('Send message'))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([path, init]) =>
          String(path) === '/api/admin/chatbots/ch_edit1/test' &&
          (init as RequestInit | undefined)?.method === 'POST' &&
          String((init as RequestInit).body ?? '').includes('"yes"'),
      )
      expect(call).toBeDefined()
      const body = JSON.parse(String((call?.[1] as RequestInit).body)) as {
        content: string
        history: Array<{ role: string; content: string }>
        dryRun?: boolean
      }
      expect(body.content).toBe('yes')
      expect(body.dryRun).toBe(true)
      expect(body.history).toEqual([
        { role: 'user', content: 'Tell me about pricing' },
        { role: 'assistant', content: 'Want to set up a discovery call?' },
      ])
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

  it('asks before discarding dirty edits on back, in-app', async () => {
    editorStub()
    const { currentPath } = renderAtLocation('/chatbots/ch_edit1')
    await openTab('Knowledge')
    await screen.findByLabelText('About us')

    fireEvent.change(screen.getByLabelText('About us'), {
      target: { value: 'Family HVAC in Round Rock.' },
    })
    expect(screen.getByText('Unsaved changes')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /All chatbots/i }))
    expect(await screen.findByRole('dialog')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: /Keep editing/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
    expect(currentPath()).toBe('/chatbots/ch_edit1')

    fireEvent.click(screen.getByRole('button', { name: /All chatbots/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Discard changes/i }))
    expect(currentPath()).toBe('/chatbots')
  })

  it('leaves immediately on back when nothing is dirty', async () => {
    editorStub()
    const { currentPath } = renderAtLocation('/chatbots/ch_edit1')
    await screen.findByText('Acme HVAC')

    fireEvent.click(screen.getByRole('button', { name: /All chatbots/i }))
    expect(currentPath()).toBe('/chatbots')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('warns when an active bot has no allowed domains', async () => {
    editorStub({ allowedDomains: [] })
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Settings')

    expect(await screen.findByText(/open to any website — list an allowed domain/i)).toBeDefined()

    fireEvent.click(await screen.findByRole('button', { name: 'Add domain' }))
    fireEvent.change(screen.getByLabelText('Allowed domain 1'), {
      target: { value: 'acme.com' },
    })
    expect(screen.queryByText(/open to any website/i)).toBeNull()
  })

  it('does not warn when the bot is paused with no domains', async () => {
    editorStub({ allowedDomains: [], status: 'paused' })
    renderAtLocation('/chatbots/ch_edit1')
    await openTab('Settings')

    expect(await screen.findByText('Basics')).toBeDefined()
    expect(screen.queryByText(/open to any website/i)).toBeNull()
  })
})
