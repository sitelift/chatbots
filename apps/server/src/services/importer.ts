import { lookup } from 'node:dns/promises'
import { type BusinessFacts, businessFactsSchema } from '@sitelift/shared'
import { env } from '../env'
import { completeJson } from './provider'
import { resolveProviderCredentials } from './settings'

const MAX_SITE_TEXT = 40_000
const MAX_HTML = 250_000
const MAX_TOTAL_CHARS = 60_000
const MAX_PAGES = 5
const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

const SKIP_PATH_SEGMENTS = new Set([
  'login',
  'signin',
  'signup',
  'register',
  'cart',
  'checkout',
  'account',
  'admin',
  'wp-admin',
  'wp-login',
  'api',
  'search',
  'tag',
  'cgi-bin',
  'feed',
  'privacy',
  'terms',
  'sitemap',
])

export class ImportError extends Error {
  constructor(
    public code:
      | 'INVALID_URL'
      | 'BLOCKED_HOST'
      | 'FETCH_FAILED'
      | 'NO_CONTENT'
      | 'EXTRACTION_FAILED',
    message: string,
  ) {
    super(message)
  }
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null
  const [a, b, c, d] = parts
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
}

const PRIVATE_V4: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10
  [0x7f000000, 8], // 127.0.0.0/8
  [0xa9fe0000, 16], // 169.254.0.0/16
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15
  [0xe0000000, 4], // 224.0.0.0/4
  [0xf0000000, 4], // 240.0.0.0/4
]

function ipv4InRange(int: number, base: number, bits: number): boolean {
  const mask = (0xffffffff << (32 - bits)) >>> 0
  return (int & mask) === (base & mask)
}

export function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const lower = ip.toLowerCase()
    if (lower === '::1' || lower === '::') return true
    if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped?.[1]) return isPrivateIp(mapped[1])
    return false
  }
  const int = ipv4ToInt(ip)
  if (int === null) return true
  return PRIVATE_V4.some(([base, bits]) => ipv4InRange(int, base, bits))
}

async function assertPublicTarget(url: URL): Promise<void> {
  if (process.env.ALLOW_PRIVATE_IMPORT === '1') return
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ImportError('INVALID_URL', 'Only http(s) website URLs are supported')
  }
  const host = url.hostname
  if (host === 'localhost') {
    throw new ImportError('BLOCKED_HOST', 'Local addresses cannot be imported')
  }
  const direct = ipv4ToInt(host)
  if (direct !== null) {
    if (isPrivateIp(host))
      throw new ImportError('BLOCKED_HOST', 'Private addresses cannot be imported')
    return
  }
  let addresses: string[] = []
  try {
    const result = await lookup(host, { all: true })
    addresses = result.map((r) => r.address)
  } catch {
    throw new ImportError('BLOCKED_HOST', 'Could not resolve the website host')
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a))) {
    throw new ImportError('BLOCKED_HOST', 'Private addresses cannot be imported')
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/g, "'")
}

export function htmlToText(html: string): string {
  let s = html
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(
    /<(script|style|noscript|head|nav|footer|header|iframe|svg|form|aside)[^>]*>[\s\S]*?<\/\1\s*>/gi,
    ' ',
  )
  s = s.replace(/<(meta|link|input|button|img|br|hr|source|path)[^>]*>/gi, ' ')
  s = s.replace(/<\/(p|div|li|h[1-6]|section|article|tr|blockquote|pre|table|ul|ol)>/gi, '\n')
  s = s.replace(/<(p|div|li|h[1-6]|section|article|br|tr)\b[^>]*>/gi, '\n')
  s = s.replace(/<[^>]+>/g, ' ')
  s = decodeEntities(s)
  return s
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
}

async function fetchWithRedirects(
  url: URL,
  redirects = 0,
): Promise<{ html: string; text: string; source: string }> {
  await assertPublicTarget(url)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': 'SiteLift-Importer/1.0', Accept: 'text/html,text/plain' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'manual',
    })
  } catch {
    throw new ImportError('FETCH_FAILED', 'Could not reach the website')
  }

  const location = res.headers.get('location')
  if (res.status >= 300 && res.status < 400 && location) {
    if (redirects >= MAX_REDIRECTS) throw new ImportError('FETCH_FAILED', 'Too many redirects')
    try {
      return fetchWithRedirects(new URL(location, url), redirects + 1)
    } catch {
      throw new ImportError('FETCH_FAILED', 'Redirected to an unsupported address')
    }
  }

  if (!res.ok) {
    throw new ImportError('FETCH_FAILED', `The website responded with status ${res.status}`)
  }

  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('html') && !type.includes('text')) {
    throw new ImportError('NO_CONTENT', 'The website does not serve readable text')
  }

  const raw = await res.text()
  const text = htmlToText(raw).slice(0, MAX_SITE_TEXT)
  if (text.trim().length === 0) {
    throw new ImportError('NO_CONTENT', 'Could not find readable text on the page')
  }
  return { html: raw.slice(0, MAX_HTML), text, source: url.toString() }
}

function extractPageLinks(html: string, base: URL): string[] {
  const hrefs = Array.from(html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi), (m) => m[1])
  const out: string[] = []
  for (const raw of hrefs) {
    const trimmed = raw?.trim()
    if (!trimmed || /^(mailto:|tel:|javascript:|#)/i.test(trimmed)) continue
    let url: URL
    try {
      url = new URL(trimmed, base)
    } catch {
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue
    if (url.hostname !== base.hostname) continue
    const first = url.pathname.split('/').filter(Boolean)[0]?.toLowerCase()
    if (first && SKIP_PATH_SEGMENTS.has(first)) continue
    url.hash = ''
    const href = url.toString()
    if (href === base.toString()) continue
    out.push(href)
  }
  return Array.from(new Set(out)).slice(0, MAX_PAGES - 1)
}

export async function fetchSiteText(rawUrl: string): Promise<{ text: string; source: string }> {
  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(rawUrl)
  const absolute = withScheme ? rawUrl : `https://${rawUrl}`
  let url: URL
  try {
    url = new URL(absolute)
  } catch {
    throw new ImportError('INVALID_URL', 'The website URL is not valid')
  }

  const home = await fetchWithRedirects(url)
  const pages = [{ text: home.text, source: home.source }]
  let total = home.text.length

  for (const link of extractPageLinks(home.html, url)) {
    if (pages.length >= MAX_PAGES || total >= MAX_TOTAL_CHARS) break
    try {
      const page = await fetchWithRedirects(new URL(link))
      if (!page.text.trim()) continue
      const budget = Math.min(page.text.length, MAX_TOTAL_CHARS - total)
      if (budget <= 0) break
      pages.push({ text: page.text.slice(0, budget), source: page.source })
      total += budget
    } catch (err) {
      if (err instanceof ImportError) continue
      throw err
    }
  }

  const text =
    pages.length === 1
      ? (pages[0]?.text ?? '')
      : pages.map((p, i) => `[Page ${i + 1}] ${p.source}\n${p.text}`).join('\n\n')
  return { text, source: home.source }
}

const EXTRACT_PROMPT = `You are an assistant that extracts structured business facts from website text. Read the text below and return a single JSON object (no markdown, no extra text) that describes the business on that website.

Respond with exactly this JSON shape:
{
  "overview": string,      // who they are, since when, what makes them different
  "hours": string,         // opening hours, including exceptions/emergency lines
  "location": string,      // one line: where the business is based / what area it serves
  "contact": string,       // one line: phone, email or booking URL — keep URLs verbatim
  "services": string,      // products and services offered
  "pricing": string,       // prices, packages, payment methods, if stated
  "policies": string,      // warranties, returns, guarantees, cancellation rules
  "misc": string,          // any other useful detail not covered above
  "faqs": [                // 15 to 20 likely visitor questions with short answers drawn from the text
    { "q": string, "a": string }
  ]
}

Rules:
- ONLY use information present in the text. Never invent prices, hours, services, or policies.
- Leave a field an empty string when the text gives nothing for it. Never write what is missing:
  no "not provided", "none listed", "N/A", "no phone number is listed", or similar commentary.
- State facts directly and tersely: one to two short sentences per field, no framing, no hedging.
- Never describe the text or attribute claims ("the site says", "according to", "described as",
  "it is stated that"). Write what is true, plainly.
- Summarize instead of enumerating incidental detail (client portfolios, conference talks,
  individual names). "Based in Iowa, serves customers nationally" beats a city list.
- When the text says where the business is based or who it serves, say so in one line. When a
  booking, contact or social URL exists, keep it in the contact line verbatim.
- Keep exact numbers, prices, phone numbers and URLs verbatim. Prefer the business's own words.
- The faqs must be answerable from the text alone.
- Extract EVERY distinct question the text can answer, up to 20. A handful (5 or fewer) is a failure:
  enumerate each FAQ entry, service detail, policy and contact question the text supports.

Website text:
"""

TEXT"""`

async function extractFactsWithRetry(text: string, model: string): Promise<BusinessFacts> {
  const credentials = resolveProviderCredentials()
  if (!credentials.apiKey) {
    throw new ImportError(
      'EXTRACTION_FAILED',
      'Connect an AI provider in Settings before importing',
    )
  }
  const messages = [
    {
      role: 'system' as const,
      content: 'You are a precise fact extractor. Return valid JSON only.',
    },
    { role: 'user' as const, content: EXTRACT_PROMPT.replace('TEXT', text) },
  ]
  const options = { model, baseUrl: null, temperature: 0, maxTokens: 8000 }

  let raw = await completeJson(messages, options, credentials)
  for (let attempt = 0; attempt < 1; attempt++) {
    const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
    const parsed = businessFactsSchema.safeParse(JSON.parse(trimmed) as unknown)
    if (parsed.success) return normalizeFacts(parsed.data)
    raw = await completeJson(
      [
        ...messages,
        {
          role: 'user' as const,
          content: `The previous response was not valid: ${(parsed.error as { issues?: { message?: string }[] }).issues?.[0]?.message ?? 'invalid JSON'}. Respond again with valid JSON only.`,
        },
      ],
      options,
      credentials,
    )
  }
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  const parsed = businessFactsSchema.safeParse(JSON.parse(trimmed) as unknown)
  if (!parsed.success) {
    throw new ImportError('EXTRACTION_FAILED', 'Could not read business facts from the website')
  }
  return normalizeFacts(parsed.data)
}

function normalizeFacts(facts: BusinessFacts): BusinessFacts {
  const out: BusinessFacts = {}
  for (const [key, value] of Object.entries(facts)) {
    if (key === 'faqs') {
      const faqs = (facts.faqs ?? []).filter((f) => f.q.trim() && f.a.trim()).slice(0, 50)
      if (faqs.length) out.faqs = faqs
      continue
    }
    if (typeof value === 'string' && value.trim() !== '') {
      out[key as Exclude<keyof BusinessFacts, 'faqs'>] = value.trim()
    }
  }
  return out
}

export function extractBusinessFacts(text: string, model?: string): Promise<BusinessFacts> {
  return extractFactsWithRetry(text, model || env.defaultModel)
}
