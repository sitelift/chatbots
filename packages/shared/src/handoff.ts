import { z } from 'zod'

export const handoffFieldTypeSchema = z.enum(['name', 'email', 'phone', 'text', 'textarea'])

export type HandoffFieldType = z.infer<typeof handoffFieldTypeSchema>

export const handoffFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z][a-z0-9_]*$/, 'Field id must be a lowercase slug'),
  type: handoffFieldTypeSchema,
  label: z.string().trim().min(1).max(80),
  required: z.boolean().optional(),
})

export type HandoffField = z.infer<typeof handoffFieldSchema>

export const offerHandoffArgsSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
    intro: z.string().trim().max(300).optional(),
    fields: z.array(handoffFieldSchema).min(1).max(6),
  })
  .transform((value) => {
    const fields = value.fields.map((field) => ({
      ...field,
      required: field.type === 'email' ? true : Boolean(field.required),
    }))
    const hasEmail = fields.some((field) => field.type === 'email')
    if (!hasEmail) {
      fields.unshift({
        id: 'email',
        type: 'email',
        label: 'Email',
        required: true,
      })
    }
    const seen = new Set<string>()
    const unique = fields.filter((field) => {
      if (seen.has(field.id)) return false
      seen.add(field.id)
      return true
    })
    return {
      reason: value.reason,
      intro: value.intro?.trim() ? value.intro.trim() : undefined,
      fields: unique.slice(0, 6),
    }
  })

export type OfferHandoffArgs = z.infer<typeof offerHandoffArgsSchema>

export const HANDOFF_TOOL_NAME = 'offer_handoff' as const

export const offerHandoffToolDefinition = {
  type: 'function' as const,
  function: {
    name: HANDOFF_TOOL_NAME,
    description:
      'Show an in-chat contact form for a human follow-up. Call ONLY when the visitor clearly asks to leave contact details, get a callback, book, or speak with a person. Do not call for greetings, FAQs, pricing curiosity, or the first message. Answer their question in text first whenever possible; use this tool as a later next step.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        reason: {
          type: 'string',
          description:
            '1–2 sentence summary for the business owner explaining what the visitor wants.',
        },
        intro: {
          type: 'string',
          description: 'Short line shown above the form to the visitor.',
        },
        fields: {
          type: 'array',
          minItems: 1,
          maxItems: 6,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              id: {
                type: 'string',
                description: 'Lowercase slug id, e.g. name, email, phone, timing',
              },
              type: {
                type: 'string',
                enum: ['name', 'email', 'phone', 'text', 'textarea'],
              },
              label: { type: 'string' },
              required: { type: 'boolean' },
            },
            required: ['id', 'type', 'label'],
          },
        },
      },
      required: ['reason', 'fields'],
    },
  },
} as const

export const handoffEventSchema = z.object({
  event: z.literal('handoff'),
  handoffId: z.string(),
  reason: z.string(),
  intro: z.string().optional(),
  fields: z.array(handoffFieldSchema),
})

export type HandoffEvent = z.infer<typeof handoffEventSchema>

export const submitHandoffRequestSchema = z.object({
  conversationId: z.string().min(1),
  visitorId: z.string().min(8).max(64),
  handoffId: z.string().min(1),
  answers: z.record(z.string(), z.string()),
})

export type SubmitHandoffRequest = z.infer<typeof submitHandoffRequestSchema>

export const submitHandoffReplySchema = z.object({ ok: z.literal(true) })

export type SubmitHandoffReply = z.infer<typeof submitHandoffReplySchema>

export const smtpSettingsInputSchema = z.object({
  host: z.string().trim().max(200).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  secure: z.boolean().optional(),
  user: z.string().trim().max(200).optional(),
  pass: z.string().max(500).optional(),
  from: z.string().trim().max(200).optional(),
  alsoNotify: z
    .string()
    .trim()
    .transform((value) => value.toLowerCase())
    .pipe(z.union([z.literal(''), z.string().email('Enter a valid email address')]))
    .optional(),
})

export type SmtpSettingsInput = z.infer<typeof smtpSettingsInputSchema>

export function parseOfferHandoffArgs(raw: unknown): OfferHandoffArgs | null {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  const parsed = offerHandoffArgsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
