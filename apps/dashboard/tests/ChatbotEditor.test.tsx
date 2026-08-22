import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

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

describe('ChatbotEditor', () => {
  it('prefills structured facts from the loaded chatbot', async () => {
    stubApi([{ path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() }])
    renderAtLocation('/chatbots/ch_edit1')

    const nameInput = (await screen.findByLabelText('Name')) as HTMLInputElement
    expect(nameInput.value).toBe('Acme HVAC')
    expect((screen.getByLabelText(/Quick replies/i) as HTMLInputElement).value).toBe('Hours?')
    expect((screen.getByLabelText('Business overview') as HTMLTextAreaElement).value).toBe(
      'Family HVAC in Austin.',
    )
  })

  it('saves edited fields through PUT', async () => {
    const updated = view({ name: 'Acme HVAC & Cooling' })
    const fetchMock = stubApi([
      { path: '/api/admin/chatbots/ch_edit1', method: 'GET', status: 200, body: view() },
      { path: '/api/admin/chatbots/ch_edit1', method: 'PUT', status: 200, body: updated },
    ])
    renderAtLocation('/chatbots/ch_edit1')

    fireEvent.change(await screen.findByLabelText('Name'), {
      target: { value: 'Acme HVAC & Cooling' },
    })
    fireEvent.click(screen.getByText('Save changes'))

    await waitFor(() => {
      expect(screen.getByText('Saved.')).toBeDefined()
    })
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Acme HVAC & Cooling')

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
    await screen.findByLabelText('Name')

    fireEvent.click(screen.getByLabelText('Delete Acme HVAC'))
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0)

    fireEvent.click(screen.getByLabelText('Confirm delete'))
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
    })
  })
})
