import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChatbotEditor } from '../src/pages/ChatbotEditor'

const now = '2026-01-01T00:00:00.000Z'

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

describe('ChatbotEditor', () => {
  it('prefills fields from the loaded chatbot', async () => {
    stubFetch([{ status: 200, body: view() }])
    render(
      <ChatbotEditor
        botId="ch_edit1"
        onBack={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
        onPlayground={() => {}}
      />,
    )

    const nameInput = (await screen.findByLabelText('Name')) as HTMLInputElement
    expect(nameInput.value).toBe('Acme HVAC')
    expect((screen.getByLabelText(/Quick replies/i) as HTMLInputElement).value).toBe('Hours?')
    expect(screen.getByText('Business facts')).toBeDefined()
  })

  it('saves edited fields through PUT with the full payload', async () => {
    const updated = view({ name: 'Acme HVAC & Cooling' })
    const fetchMock = stubFetch([
      { status: 200, body: view() },
      { status: 200, body: updated },
    ])
    render(
      <ChatbotEditor
        botId="ch_edit1"
        onBack={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
        onPlayground={() => {}}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Acme HVAC & Cooling' },
    })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeDefined()
    })

    const putCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')
    expect(putCall?.[0]).toBe('/api/admin/chatbots/ch_edit1')
    const body = JSON.parse(String(init_body(putCall?.[1])))
    expect(body.name).toBe('Acme HVAC & Cooling')
    expect(body.systemPrompt).toBe('You help Acme customers.')
    expect(body.allowedDomains).toEqual(['acme.com'])
  })

  it('browses models from the global provider when no per-bot override exists', async () => {
    const fetchMock = stubFetch([
      { status: 200, body: view({ baseUrl: null }) },
      {
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
    render(
      <ChatbotEditor
        botId="ch_edit1"
        onBack={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
        onPlayground={() => {}}
      />,
    )
    await screen.findByLabelText('Name')

    fireEvent.click(screen.getByText('Browse provider models'))

    await waitFor(() => {
      expect(screen.getByText('OR Model')).toBeDefined()
    })
    const catalogCall = fetchMock.mock.calls.find(([path]) =>
      String(path).startsWith('/api/admin/models'),
    )
    expect(catalogCall?.[0]).toBe(
      `/api/admin/models?baseUrl=${encodeURIComponent('https://openrouter.ai/api/v1')}`,
    )

    fireEvent.click(screen.getByLabelText('Filter models'))
    fireEvent.change(screen.getByLabelText('Filter models'), { target: { value: 'or' } })
    fireEvent.click(screen.getByText('OR Model'))
    expect((screen.getByLabelText('Model') as HTMLInputElement).value).toBe('or-model')
  })

  it('arms delete before sending DELETE', async () => {
    const fetchMock = stubFetch([{ status: 200, body: view() }, { status: 204 }])
    render(
      <ChatbotEditor
        botId="ch_edit1"
        onBack={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
        onPlayground={() => {}}
      />,
    )
    await screen.findByLabelText('Name')

    const deleteBtn = screen.getByLabelText('Delete Acme HVAC')
    fireEvent.click(deleteBtn)
    const armedBtn = screen.getByLabelText('Confirm delete')
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)

    fireEvent.click(armedBtn)
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
    })
  })
})

function init_body(init?: RequestInit): unknown {
  return init?.body ?? '{}'
}
