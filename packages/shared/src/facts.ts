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
  '- Be brief: reply in 1-2 short sentences, under ~30 words. Only write more when the visitor asks for detail.',
  '- Reply in plain text only. Never use JSON, code blocks, or markup the visitor would have to decode.',
  '- For anything urgent or sensitive, point the visitor to the listed phone or contact details.',
].join('\n')

const SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  hours: 'Hours',
  location: 'Location',
  contact: 'Contact',
  services: 'Services',
  pricing: 'Pricing',
  policies: 'Policies',
  misc: 'Notes',
}

const SECTION_ORDER = [
  'overview',
  'hours',
  'location',
  'contact',
  'services',
  'pricing',
  'policies',
  'misc',
] as const

function toSections(facts: BusinessFacts): string[] {
  const sections: string[] = []
  for (const key of SECTION_ORDER) {
    const value = facts[key]
    if (typeof value === 'string' && value.trim() !== '') {
      sections.push(`${SECTION_LABELS[key]}:\n${value.trim()}`)
    }
  }
  const faqs = (facts.faqs ?? []).filter((f) => f.q.trim() && f.a.trim())
  if (faqs.length) {
    sections.push(`FAQ:\n${faqs.map((f) => `Q: ${f.q.trim()}\nA: ${f.a.trim()}`).join('\n\n')}`)
  }
  return sections
}

/**
 * Deterministic assembly used by BOTH the server (when storing/sending) and
 * the dashboard (live preview) — they must never drift.
 */
export function composeSystemPrompt(facts: BusinessFacts): string {
  const sections = toSections(facts)
  if (sections.length === 0) return ''
  return `${GUARDRAILS}\n\n---\n\nBusiness facts:\n\n${sections.join('\n\n')}`
}
