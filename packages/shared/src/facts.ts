import { z } from 'zod'

export const faqPairSchema = z.object({
  q: z.string().trim().min(1, 'FAQ question is required').max(300),
  a: z.string().trim().min(1, 'FAQ answer is required').max(2000),
})

export type FaqPair = z.infer<typeof faqPairSchema>

export const businessFactsSchema = z.object({
  overview: z.string().trim().max(4000).optional(),
  hours: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(2000).optional(),
  contact: z.string().trim().max(2000).optional(),
  services: z.string().trim().max(4000).optional(),
  pricing: z.string().trim().max(2000).optional(),
  policies: z.string().trim().max(4000).optional(),
  misc: z.string().trim().max(12000).optional(),
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

function factsToJson(facts: BusinessFacts): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(facts)) {
    if (key === 'faqs') {
      const faqs = (facts.faqs ?? []).filter((f) => f.q.trim() && f.a.trim())
      if (faqs.length) out.faqs = faqs
      continue
    }
    if (typeof value === 'string' && value.trim() !== '') out[key] = value.trim()
  }
  return out
}

/**
 * Deterministic assembly used by BOTH the server (when storing/sending) and
 * the dashboard (live preview) — they must never drift.
 */
export function composeSystemPrompt(facts: BusinessFacts): string {
  const factsJson = JSON.stringify(factsToJson(facts))
  if (factsJson === '{}') return ''
  return `${GUARDRAILS}\n\n---\n\nBusiness facts (JSON):\n${factsJson}`
}
