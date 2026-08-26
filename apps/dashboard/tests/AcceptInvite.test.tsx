import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const TOKEN = 'tok_abc123def456ghi789'

describe('AcceptInvite', () => {
  it('sets a password through the reset-password endpoint and shows success', async () => {
    const mock = stubApi([
      {
        path: '/api/auth/reset-password',
        method: 'POST',
        status: 200,
        body: {},
      },
    ])
    renderAtLocation(`/accept/${TOKEN}`)

    fireEvent.change(await screen.findByLabelText('Password'), {
      target: { value: 'correct horse battery' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'correct horse battery' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save password/i }))

    expect(await screen.findByText("You're all set")).toBeDefined()
    const call = mock.mock.calls.find(([, init]) => init?.method === 'POST')
    expect(call?.[0]).toBe('/api/auth/reset-password')
    const body = JSON.parse(String(call?.[1]?.body))
    expect(body.token).toBe(TOKEN)
    expect(body.newPassword).toBe('correct horse battery')
  })

  it('shows the strength meter and toggles visibility while typing', async () => {
    renderAtLocation(`/accept/${TOKEN}`)
    await screen.findByLabelText('Password')

    const passwordInput = screen.getByLabelText('Password')
    fireEvent.change(passwordInput, {
      target: { value: 'LongEnoughButBasic1' },
    })
    expect(screen.getByText(/Okay|Strong/)).toBeDefined()

    const toggle = within((passwordInput.closest('div') ?? document.body) as HTMLElement).getByRole(
      'button',
      { name: 'Show password' },
    )
    fireEvent.click(toggle)
    expect(passwordInput.getAttribute('type')).toBe('text')
  })

  it('blocks short passwords and mismatches before submitting', async () => {
    const mock = stubApi([
      { path: '/api/auth/reset-password', method: 'POST', status: 200, body: {} },
    ])
    renderAtLocation(`/accept/${TOKEN}`)
    await screen.findByLabelText('Password')

    fireEvent.click(screen.getByRole('button', { name: /Save password/i }))
    expect(screen.getByText(/at least 10 characters/i)).toBeDefined()
    expect(mock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long enough pass' } })
    fireEvent.click(screen.getByRole('button', { name: /Save password/i }))
    expect(screen.getByText(/confirm your password/i)).toBeDefined()

    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'long enough different' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save password/i }))
    expect(screen.getByText(/passwords do not match/i)).toBeDefined()
    expect(mock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  })

  it('surfaces invalid or expired links from the server', async () => {
    stubApi([
      {
        path: '/api/auth/reset-password',
        method: 'POST',
        status: 400,
        body: { message: 'Invalid setup link' },
      },
    ])
    renderAtLocation(`/accept/${TOKEN}`)
    await screen.findByLabelText('Password')

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a valid password' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'a valid password' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Save password/i }))

    expect(await screen.findByText('Invalid setup link')).toBeDefined()
  })
})
