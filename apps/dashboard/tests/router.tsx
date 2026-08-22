import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { buildRouteTree } from '../src/router'

export function renderAtLocation(path: string) {
  const router = createRouter({
    routeTree: buildRouteTree({ authGuard: false }),
    history: createMemoryHistory({ initialEntries: [path] }),
    basepath: '/',
  })
  render(<RouterProvider router={router as never} />)
  return {
    currentPath: () => router.state.location.pathname,
    currentSearch: () => router.state.location.search,
    rawRouter: router,
  }
}

export interface StubRoute {
  method?: string
  path: string | RegExp
  status: number
  body?: unknown
}

const AUTH_ME_RESPONSE = {
  id: 'u_test',
  email: 'owner@test.dev',
  name: 'Owner',
  role: 'agency',
}

export function stubApi(routes: StubRoute[]) {
  const all = [
    { method: 'GET', path: '/api/auth/me', status: 200, body: AUTH_ME_RESPONSE },
    ...routes,
  ]
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const hit = all.find(
      (r) =>
        (r.method ?? 'GET') === method &&
        (typeof r.path === 'string' ? String(path) === r.path : r.path.test(String(path))),
    )
    if (!hit) throw new Error(`Unhandled fetch: ${method} ${String(path)}`)
    return {
      ok: hit.status < 400,
      status: hit.status,
      json: async () => hit.body ?? {},
      text: async () => JSON.stringify(hit.body ?? {}),
    }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
