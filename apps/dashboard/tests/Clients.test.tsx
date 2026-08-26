import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const CLIENT_VIEW = {
  id: 'usr_c1',
  email: 'jane@acme.test',
  name: 'Jane Doe',
  role: 'client',
  chatbotIds: ['ch_b1'],
}

describe('ClientsPage', () => {
  it('lists clients with assigned bot chips and an add flow', async () => {
    const fetchMock = stubApi([
      {
        path: '/api/admin/clients',
        method: 'GET',
        status: 200,
        body: { clients: [CLIENT_VIEW] },
      },
      {
        path: '/api/admin/chatbots',
        method: 'GET',
        status: 200,
        body: {
          chatbots: [{ id: 'ch_b1', name: 'Acme Bot', status: 'active' }],
        },
      },
      {
        path: '/api/admin/clients',
        method: 'POST',
        status: 201,
        body: {
          client: {
            id: 'usr_c2',
            email: 'new@shop.test',
            name: null,
            role: 'client',
            chatbotIds: [],
          },
          setupToken: 'tok_abc123def456',
        },
      },
    ])

    renderAtLocation('/clients')

    expect(await screen.findByText('jane@acme.test')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Acme Bot' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /add client/i }))
    fireEvent.change(await screen.findByLabelText(/email/i), {
      target: { value: 'new@shop.test' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create invite/i }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([path, init]) =>
          String(path) === '/api/admin/clients' && (init as RequestInit)?.method === 'POST',
      )
      if (!call) throw new Error('POST /api/admin/clients was not called')
      expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({
        email: 'new@shop.test',
        name: undefined,
      })
    })
    expect(await screen.findByDisplayValue(/\/accept\//)).toBeTruthy()
    expect(screen.getByText('Setup link for new@shop.test')).toBeTruthy()
  })

  it('assigns bots through the dialog and reloads', async () => {
    const fetchMock = stubApi([
      { path: '/api/admin/clients', method: 'GET', status: 200, body: { clients: [CLIENT_VIEW] } },
      {
        path: '/api/admin/chatbots',
        method: 'GET',
        status: 200,
        body: {
          chatbots: [
            { id: 'ch_b1', name: 'Acme Bot', status: 'active' },
            { id: 'ch_b2', name: 'Bella Bot', status: 'active' },
          ],
        },
      },
      {
        path: '/api/admin/clients/usr_c1/chatbots',
        method: 'PUT',
        status: 200,
        body: { ...CLIENT_VIEW, chatbotIds: ['ch_b1', 'ch_b2'] },
      },
    ])

    renderAtLocation('/clients')
    await screen.findByText('jane@acme.test')

    fireEvent.click(screen.getByRole('button', { name: /assign bots/i }))
    fireEvent.click(await screen.findByLabelText('Bella Bot'))
    fireEvent.click(screen.getByRole('button', { name: /save assignments/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/admin/clients/usr_c1/chatbots', {
        method: 'PUT',
        body: JSON.stringify({ chatbotIds: ['ch_b1', 'ch_b2'] }),
        headers: expect.anything(),
      })
    })
  })

  it('shows a teaching empty state for agencies without clients', async () => {
    stubApi([
      { path: '/api/admin/clients', method: 'GET', status: 200, body: { clients: [] } },
      { path: '/api/admin/chatbots', method: 'GET', status: 200, body: { chatbots: [] } },
    ])

    renderAtLocation('/clients')

    expect(await screen.findByText('No clients yet')).toBeTruthy()
    expect(screen.getByText(/invite a business owner/i)).toBeTruthy()
  })

  it('redirects clients away from the clients page', async () => {
    stubApi([
      {
        path: '/api/auth/me',
        status: 200,
        body: { id: 'u_c', email: 'jane@acme.test', name: 'Jane', role: 'client' },
      },
      { path: '/api/admin/clients', method: 'GET', status: 403, body: {} },
    ])

    const { currentPath } = renderAtLocation('/clients')

    await waitFor(() => {
      expect(currentPath()).toBe('/')
    })
  })
})
