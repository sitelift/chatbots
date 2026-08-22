import { type ModelOption, PROVIDER_PRESETS } from '@sitelift/shared'

const CACHE_TTL_MS = 10 * 60 * 1000

const cache = new Map<string, { at: number; models: ModelOption[] }>()

export class CatalogError extends Error {
  constructor(
    public code: 'INVALID_URL' | 'UNSUPPORTED_PROVIDER' | 'UPSTREAM_ERROR',
    message: string,
  ) {
    super(message)
  }
}

function isAllowedCatalogTarget(url: URL): boolean {
  const host = url.hostname
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
  return PROVIDER_PRESETS.some((p) => p.baseUrl !== '' && new URL(p.baseUrl).origin === url.origin)
}

function toPerM(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = Number.parseFloat(value)
  return Number.isFinite(n) ? n * 1_000_000 : null
}

export async function fetchModelCatalog(baseUrlRaw: string): Promise<ModelOption[]> {
  let url: URL
  try {
    url = new URL(baseUrlRaw)
  } catch {
    throw new CatalogError('INVALID_URL', 'Base URL is not a valid URL')
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new CatalogError('INVALID_URL', 'Only http(s) base URLs are supported')
  }
  if (!isAllowedCatalogTarget(url)) {
    throw new CatalogError(
      'UNSUPPORTED_PROVIDER',
      'Model catalogs can only be loaded for known providers or local endpoints',
    )
  }

  const cached = cache.get(baseUrlRaw)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.models

  let res: Response
  try {
    res = await fetch(`${baseUrlRaw.replace(/\/+$/, '')}/models`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new CatalogError('UPSTREAM_ERROR', 'Provider did not respond')
  }
  if (!res.ok) {
    throw new CatalogError('UPSTREAM_ERROR', `Provider returned ${res.status}`)
  }

  const body = (await res.json()) as {
    data?: Array<{
      id?: string
      name?: string
      context_length?: number | null
      pricing?: { prompt?: string; completion?: string }
    }>
  }

  const models = (body.data ?? [])
    .filter((m) => typeof m.id === 'string' && m.id.length > 0)
    .map((m) => ({
      id: m.id as string,
      name: m.name ?? (m.id as string),
      contextLength: m.context_length ?? null,
      promptPricePerM: toPerM(m.pricing?.prompt),
      completionPricePerM: toPerM(m.pricing?.completion),
    }))

  cache.set(baseUrlRaw, { at: Date.now(), models })
  return models
}
