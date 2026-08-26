import { describe, expect, it } from 'vitest'
import { relativeTime } from '../src/lib/reltime'

const NOW = new Date('2026-08-26T15:00:00')

describe('relativeTime', () => {
  it('collapses seconds into just now', () => {
    expect(relativeTime(new Date('2026-08-26T14:59:30'), NOW)).toBe('just now')
  })

  it('renders minutes under an hour', () => {
    expect(relativeTime(new Date('2026-08-26T14:42:00'), NOW)).toBe('18m ago')
  })

  it('renders hours under a day', () => {
    expect(relativeTime(new Date('2026-08-26T09:00:00'), NOW)).toBe('6h ago')
  })

  it('renders days up to a week, with yesterday', () => {
    expect(relativeTime(new Date('2026-08-25T12:00:00'), NOW)).toBe('yesterday')
    expect(relativeTime(new Date('2026-08-22T15:00:00'), NOW)).toBe('4d ago')
  })

  it('falls back to a short date beyond a week', () => {
    const label = relativeTime(new Date('2026-07-01T12:00:00'), NOW)
    expect(label).toMatch(/Jul\s*1/)
  })

  it('clamps future skew to just now', () => {
    expect(relativeTime(new Date('2026-08-26T15:01:00'), NOW)).toBe('just now')
  })
})
