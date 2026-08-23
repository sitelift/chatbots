import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const me401 = { path: '/api/auth/me', method: 'GET', status: 401 }

function stubLogin(hasUsers: boolean) {
  stubApi([me401, { path: '/api/auth/bootstrap', method: 'GET', status: 200, body: { hasUsers } }])
}

describe('LoginPage', () => {
  it('defaults to sign-up on a fresh install and hides sign-in', async () => {
    stubLogin(false)
    renderAtLocation('/login')

    expect(await screen.findByText('Create your account')).toBeDefined()
    expect(screen.getByLabelText('Name')).toBeDefined()
    expect(screen.getByLabelText('Confirm password')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
    expect(screen.getByText('This account owns the install.')).toBeDefined()
  })

  it('defaults to sign-in when accounts already exist', async () => {
    stubLogin(true)
    renderAtLocation('/login')

    expect(await screen.findByRole('form', { name: 'Sign in' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeDefined()
    expect(screen.queryByLabelText('Confirm password')).toBeNull()
  })

  it('switches to sign-up mode via the segmented control', async () => {
    stubLogin(true)
    renderAtLocation('/login')

    fireEvent.click(await screen.findByRole('button', { name: 'Create account' }))
    expect(screen.getByText("You'll see the chatbots your agency assigns you.")).toBeDefined()
    expect(screen.getByLabelText('Confirm password')).toBeDefined()
  })

  it('blocks sign-up until passwords match', async () => {
    const fetchMock = stubApi([
      me401,
      { path: '/api/auth/bootstrap', method: 'GET', status: 200, body: { hasUsers: false } },
    ])
    renderAtLocation('/login')

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Owner' } })
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'owner@test.dev' },
    })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'long-enough-pass' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'different-pass' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Passwords do not match')).toBeDefined()
    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
      expect(posts).toHaveLength(0)
    })
  })

  it('redirects to the dashboard when a session already exists', async () => {
    stubApi([
      { path: '/api/auth/bootstrap', method: 'GET', status: 200, body: { hasUsers: true } },
      { path: '/api/admin/chatbots', method: 'GET', status: 200, body: { chatbots: [] } },
    ])
    renderAtLocation('/login')

    expect(await screen.findByText('A live view of every chatbot you run.')).toBeDefined()
  })
})
