import type { HandoffField } from '@sitelift/shared'
import { eq } from 'drizzle-orm'
import nodemailer from 'nodemailer'
import { db } from '../db'
import { clientAssignments, user } from '../db/schema'
import { logger } from '../lib/logger'
import { getSmtpConfig, type SmtpConfig } from './settings'

export type MailTransport = {
  sendMail: (options: {
    from: string
    to: string
    subject: string
    text: string
    html: string
  }) => Promise<unknown>
}

let transportOverride: MailTransport | null = null

export function setMailTransportForTests(transport: MailTransport | null): void {
  transportOverride = transport
}

function assignedOwnerEmails(chatbotId: string): string[] {
  const rows = db
    .select({ email: user.email })
    .from(clientAssignments)
    .innerJoin(user, eq(user.id, clientAssignments.userId))
    .where(eq(clientAssignments.chatbotId, chatbotId))
    .all()
  return [...new Set(rows.map((r) => r.email.trim().toLowerCase()).filter(Boolean))]
}

function createTransport(config: SmtpConfig): MailTransport {
  if (transportOverride) return transportOverride
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  })
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function publicAppBase(): string {
  return (process.env.BETTER_AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(
    /\/$/,
    '',
  )
}

function buildLeadEmail(input: {
  botName: string
  chatbotId: string
  reason: string
  fields: HandoffField[]
  answers: Record<string, string>
  transcript: Array<{ role: string; content: string }>
}): { subject: string; text: string; html: string } {
  const nameField = input.fields.find((f) => f.type === 'name')
  const emailField = input.fields.find((f) => f.type === 'email')
  const visitorName = nameField ? input.answers[nameField.id] : undefined
  const visitorEmail = emailField ? input.answers[emailField.id] : undefined
  const who = visitorName || visitorEmail || 'New lead'
  const link = `${publicAppBase()}/admin/chatbots/${input.chatbotId}`

  const answerLines = input.fields
    .map((field) => {
      const value = input.answers[field.id]
      if (!value) return null
      return `${field.label}: ${value}`
    })
    .filter(Boolean) as string[]

  const transcriptLines = input.transcript.map(
    (m) => `${m.role === 'user' ? 'Visitor' : 'Bot'}: ${m.content}`,
  )

  const text = [
    `New lead on ${input.botName}`,
    '',
    input.reason,
    '',
    ...answerLines,
    '',
    'Recent chat:',
    ...transcriptLines,
    '',
    `Open in SiteLift: ${link}`,
  ].join('\n')

  const htmlAnswers = input.fields
    .map((field) => {
      const value = input.answers[field.id]
      if (!value) return ''
      let display = escapeHtml(value)
      if (field.type === 'email') {
        display = `<a href="mailto:${escapeHtml(value)}">${escapeHtml(value)}</a>`
      } else if (field.type === 'phone') {
        display = `<a href="tel:${escapeHtml(value)}">${escapeHtml(value)}</a>`
      }
      return `<tr><td style="padding:4px 12px 4px 0;color:#71717a;vertical-align:top;">${escapeHtml(field.label)}</td><td style="padding:4px 0;">${display}</td></tr>`
    })
    .join('')

  const htmlTranscript = transcriptLines
    .map((line) => `<div style="margin:0 0 6px;color:#3f3f46;">${escapeHtml(line)}</div>`)
    .join('')

  const html = `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px;color:#18181b;">
      <p style="margin:0 0 4px;font-size:13px;color:#71717a;">New lead · ${escapeHtml(input.botName)}</p>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;">${escapeHtml(who)}</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${escapeHtml(input.reason)}</p>
      <table style="border-collapse:collapse;margin:0 0 24px;font-size:14px;">${htmlAnswers}</table>
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#52525b;">Recent chat</p>
      <div style="padding:12px 14px;background:#f4f4f5;border-radius:10px;font-size:13px;line-height:1.45;">${htmlTranscript || '<em>No messages yet</em>'}</div>
      <p style="margin:24px 0 0;"><a href="${escapeHtml(link)}" style="color:#18181b;">Open in SiteLift →</a></p>
    </div>
  `.trim()

  return {
    subject: `New lead on ${input.botName}: ${who}`,
    text,
    html,
  }
}

export async function notifyLeadHandoff(input: {
  chatbotId: string
  botName: string
  reason: string
  fields: HandoffField[]
  answers: Record<string, string>
  transcript: Array<{ role: string; content: string }>
}): Promise<void> {
  const smtp = getSmtpConfig()
  if (!smtp) {
    logger.info({ chatbotId: input.chatbotId }, 'lead handoff skipped — SMTP not configured')
    return
  }

  const recipients = new Set(assignedOwnerEmails(input.chatbotId))
  if (smtp.alsoNotify) recipients.add(smtp.alsoNotify)
  if (recipients.size === 0) {
    logger.info({ chatbotId: input.chatbotId }, 'lead handoff skipped — no recipients')
    return
  }

  const email = buildLeadEmail(input)
  const transport = createTransport(smtp)
  await transport.sendMail({
    from: smtp.from,
    to: [...recipients].join(', '),
    subject: email.subject,
    text: email.text,
    html: email.html,
  })
  logger.info(
    { chatbotId: input.chatbotId, recipients: [...recipients] },
    'lead handoff email sent',
  )
}

export async function sendSmtpTestEmail(to: string): Promise<void> {
  const smtp = getSmtpConfig()
  if (!smtp) throw new Error('SMTP is not configured')
  const transport = createTransport(smtp)
  await transport.sendMail({
    from: smtp.from,
    to,
    subject: 'SiteLift SMTP test',
    text: 'Your SiteLift email settings are working. Lead notifications will use this SMTP connection.',
    html: '<p>Your SiteLift email settings are working. Lead notifications will use this SMTP connection.</p>',
  })
}
