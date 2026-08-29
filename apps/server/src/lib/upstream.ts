import { Agent, fetch as undiciFetch } from 'undici'

const KEEP_ALIVE_IDLE_TIMEOUT_MS = 55_000
const KEEP_ALIVE_MAX_TIMEOUT_MS = 60_000

const agent = new Agent({
  keepAliveTimeout: KEEP_ALIVE_IDLE_TIMEOUT_MS,
  keepAliveMaxTimeout: KEEP_ALIVE_MAX_TIMEOUT_MS,
})

type FetchInit = Parameters<typeof undiciFetch>[1]

export async function upstreamFetch(url: string, init: FetchInit) {
  return undiciFetch(url, { ...init, dispatcher: agent })
}
