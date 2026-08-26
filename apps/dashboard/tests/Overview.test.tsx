import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderAtLocation, stubApi } from './router'

const BOTS = {
  chatbots: [
    { id: 'ch_1', name: 'Bella Café', status: 'active' },
    { id: 'ch_2', name: 'Nova Studio', status: 'paused' },
  ],
}

const STATS = {
  chatbotsTotal: 2,
  chatbotsActive: 1,
  conversations: 41,
  leads: 6,
  messages: 512,
}

function overviewStubs(statsBody = STATS) {
  stubApi([
    { path: '/api/admin/chatbots', status: 200, body: BOTS },
    { path: '/api/admin/stats', status: 200, body: statsBody },
  ])
}

describe('overview', () => {
  it('renders live counters from the stats endpoint', async () => {
    overviewStubs()
    renderAtLocation('/')

    expect(await screen.findByText('41')).toBeTruthy()
    expect(screen.getByText('6')).toBeTruthy()
    const activeHint = await screen.findByText(/1 active · 1 paused or archived/i)
    expect(activeHint).toBeTruthy()
    expect(screen.getByText('Visitor threads captured across your live widgets')).toBeTruthy()
    expect(screen.getByText('Name + email shared by visitors, ready for follow-up')).toBeTruthy()
  })

  it('shows teaching hints when everything is empty', async () => {
    overviewStubs({
      chatbotsTotal: 0,
      chatbotsActive: 0,
      conversations: 0,
      leads: 0,
      messages: 0,
    })
    renderAtLocation('/')

    await screen.findByText('Create your first chatbot to get started')
    expect(screen.getByText('Visitor threads appear here once your widget is live')).toBeTruthy()
    expect(screen.getByText('Name + email captured by the AI land in this count')).toBeTruthy()
  })

  it('falls back gracefully when the stats endpoint fails', async () => {
    stubApi([
      { path: '/api/admin/chatbots', status: 200, body: BOTS },
      { path: '/api/admin/stats', status: 500, body: { error: { message: 'boom' } } },
    ])
    renderAtLocation('/')

    await screen.findByText('Create your first chatbot to get started')
    expect(screen.getAllByText('0')).toHaveLength(3)
    expect(screen.getByText('Visitor threads appear here once your widget is live')).toBeTruthy()
  })
})
