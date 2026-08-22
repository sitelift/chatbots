import { z } from 'zod'

export const faqPairSchema = z.object({
  q: z.string().trim().min(1, 'FAQ question is required').max(300),
  a: z.string().trim().min(1, 'FAQ answer is required').max(2000),
})

export type FaqPair = z.infer<typeof faqPairSchema>

export const businessFactsSchema = z.object({
  overview: z.string().trim().max(2000).optional(),
  hours: z.string().trim().max(1000).optional(),
  contact: z.string().trim().max(1000).optional(),
  products: z.string().trim().max(2000).optional(),
  misc: z.string().trim().max(2000).optional(),
  faqs: z.array(faqPairSchema).max(50).optional(),
})

export type BusinessFacts = z.infer<typeof businessFactsSchema>

export const GUARDRAILS = [
  'You are the AI assistant for the business described below.',
  '- Answer ONLY from the facts provided. If something is not covered, say honestly that you are not sure.',
  '- Never invent prices, hours, availability, or policies.',
  '- Keep replies short, warm and helpful.',
  '- For anything urgent or sensitive, point the visitor to the listed phone or contact details.',
].join('\n')

function section(title: string, body?: string): string {
  const trimmed = body?.trim()
  return trimmed ? `${title}\n${trimmed}` : ''
}

/**
 * Deterministic assembly used by BOTH the server (when storing/sending) and
 * the dashboard (live preview) — they must never drift.
 */
export function composeSystemPrompt(facts: BusinessFacts): string {
  const sections = [
    section('BUSINESS OVERVIEW', facts.overview),
    section('HOURS', facts.hours),
    section('CONTACT', facts.contact),
    section('PRODUCTS & SERVICES', facts.products),
    facts.faqs?.length
      ? `FREQUENTLY ASKED QUESTIONS\n${facts.faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n')}`
      : '',
    section('ADDITIONAL NOTES', facts.misc),
  ].filter(Boolean)

  if (sections.length === 0) return ''

  return `${GUARDRAILS}\n\n---\n\n${sections.join('\n\n')}`
}
