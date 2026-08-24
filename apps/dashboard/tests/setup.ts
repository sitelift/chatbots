import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom does not implement matchMedia; Shell uses it for theme init.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.log('[UNHANDLED REJECTION]:', e.reason?.message ?? e.reason)
})

Element.prototype.scrollIntoView = () => {}
window.scrollTo = () => {}
