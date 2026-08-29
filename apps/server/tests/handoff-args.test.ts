import { describe, expect, it } from 'vitest'
import { parseOfferHandoffArgs } from '@sitelift/shared'

describe('parseOfferHandoffArgs', () => {
  it('forces email required and injects email when missing', () => {
    const parsed = parseOfferHandoffArgs({
      reason: 'Visitor asked for a quote',
      fields: [{ id: 'name', type: 'name', label: 'Name', required: true }],
    })
    expect(parsed?.fields.some((f) => f.type === 'email' && f.required)).toBe(true)
  })

  it('rejects invalid payloads', () => {
    expect(parseOfferHandoffArgs({ reason: '', fields: [] })).toBeNull()
    expect(parseOfferHandoffArgs('not-json')).toBeNull()
  })

  it('accepts a JSON string from tool arguments', () => {
    const parsed = parseOfferHandoffArgs(
      JSON.stringify({
        reason: 'Wants a callback',
        intro: 'Leave your info',
        fields: [
          { id: 'email', type: 'email', label: 'Email' },
          { id: 'phone', type: 'phone', label: 'Phone' },
        ],
      }),
    )
    expect(parsed?.intro).toBe('Leave your info')
    expect(parsed?.fields.find((f) => f.type === 'email')?.required).toBe(true)
  })
})
