import type { BusinessFacts, ImportResult } from '@sitelift/shared'
import { Check, Copy, LoaderCircle, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { type AdminApiError, apiFetch } from '../../lib/api'
import { inputClass, textareaClass } from '../../lib/ui'
import { uid } from '../../lib/uid'
import { GreetingFields } from './GreetingFields'
import { emptyFacts, type FormSetter, type FormState } from './state'

export const FACT_FIELDS = [
  {
    key: 'overview',
    question: 'Who are you?',
    label: 'About us',
    hint: 'What you do, since when, what makes you different.',
    example: 'Family-owned HVAC company in Austin since 1998. NATE-certified, licensed and bonded.',
    rows: 4,
  },
  {
    key: 'hours',
    question: 'When are you open?',
    label: 'Hours',
    hint: 'Opening hours, including exceptions and emergency lines.',
    example: 'Mon–Fri 8am–6pm\nSat 9am–1pm\nClosed Sundays',
    rows: 3,
  },
  {
    key: 'location',
    question: 'Where are you, and who do you serve?',
    label: 'Location & service area',
    hint: 'Address plus the areas you cover.',
    example: '123 Main St, Austin TX\nServing Travis, Hays and Williamson counties',
    rows: 3,
  },
  {
    key: 'contact',
    question: 'How do I reach you?',
    label: 'Contact',
    hint: 'Phone, email, booking links.',
    example: 'Phone: (512) 555-0100\nEmail: hello@acme.com\nBook online: acmehvac.com',
    rows: 3,
  },
  {
    key: 'services',
    question: 'What do you do?',
    label: 'Services',
    hint: 'Products and services you offer.',
    example:
      'AC repair, installation, seasonal tune-ups, duct cleaning, air-quality testing. Free estimates on new installs.',
    rows: 4,
  },
  {
    key: 'pricing',
    question: 'What do you charge?',
    label: 'Pricing & payment',
    hint: 'Prices, packages and payment methods — only what you want public.',
    example: 'Free estimates. Service calls from $89. Financing available.',
    rows: 3,
  },
  {
    key: 'policies',
    question: 'What are your policies?',
    label: 'Policies & notes',
    hint: 'Warranties, returns, guarantees, languages spoken.',
    example: '1-year workmanship warranty on repairs. Spanish spoken. 10% military discount.',
    rows: 3,
  },
] as const

export type FactKey = (typeof FACT_FIELDS)[number]['key']

function focusFact(key: string) {
  const el = document.getElementById(`fact-${key}`)
  if (!el) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
  const field = el.querySelector('textarea')
  if (field instanceof HTMLElement) field.focus({ preventScroll: true })
}

export function KnowledgeEditor({
  form,
  set,
  preview,
  showGreeting = true,
  keepImportVisible = false,
  canImport = true,
  aside = true,
}: {
  form: FormState
  set: FormSetter
  preview: string
  showGreeting?: boolean
  keepImportVisible?: boolean
  canImport?: boolean
  aside?: boolean
}) {
  const [importUrl, setImportUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [pendingImport, setPendingImport] = useState<BusinessFacts | null>(null)
  const [previewCopied, setPreviewCopied] = useState(false)
  const [armedClear, setArmedClear] = useState(false)

  const facts = form.facts

  function setFacts(next: Omit<BusinessFacts, 'faqs'> & { faqs?: FormState['facts']['faqs'] }) {
    set('facts', next)
  }

  function setFact<K extends FactKey>(key: K, value: string) {
    setFacts({ ...facts, [key]: value })
  }

  function setMisc(value: string) {
    setFacts({ ...facts, misc: value })
  }

  function setFaq(index: number, patch: { q?: string; a?: string }) {
    const faqs = [...(facts.faqs ?? [])]
    const current = faqs[index]
    if (!current) return
    faqs[index] = { q: patch.q ?? current.q, a: patch.a ?? current.a, _key: current._key }
    setFacts({ ...facts, faqs })
  }

  function addFaq() {
    setFacts({ ...facts, faqs: [...(facts.faqs ?? []), { q: '', a: '', _key: uid() }] })
  }

  function removeFaq(index: number) {
    setFacts({ ...facts, faqs: (facts.faqs ?? []).filter((_, i) => i !== index) })
  }

  async function copyPreview() {
    await navigator.clipboard.writeText(preview)
    setPreviewCopied(true)
    setTimeout(() => setPreviewCopied(false), 2000)
  }

  async function runImport() {
    const url = importUrl.trim()
    if (!url) {
      setImportError('Enter a website URL to import from')
      return
    }
    setImporting(true)
    setImportError('')
    setPendingImport(null)
    try {
      const result = await apiFetch<ImportResult>('/api/admin/import', {
        method: 'POST',
        body: JSON.stringify({ url, model: form.model.trim() || undefined }),
      })
      setPendingImport(result.facts)
    } catch (err) {
      const api = (err as Error & { api?: AdminApiError }).api
      setImportError(api?.message ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function applyImport(facts: BusinessFacts) {
    setFacts({
      ...emptyFacts(),
      overview: facts.overview ?? '',
      hours: facts.hours ?? '',
      location: facts.location ?? '',
      contact: facts.contact ?? '',
      services: facts.services ?? '',
      pricing: facts.pricing ?? '',
      policies: facts.policies ?? '',
      misc: facts.misc ?? '',
      faqs: (facts.faqs ?? []).map((pair) => ({ ...pair, _key: uid() })),
    })
    setPendingImport(null)
  }

  const coveredCount = FACT_FIELDS.filter((f) => (facts[f.key] ?? '').trim() !== '').length
  const hasFacts =
    coveredCount > 0 || Boolean((facts.misc ?? '').trim()) || (facts.faqs?.length ?? 0) > 0

  function clearFacts() {
    if (!armedClear) {
      setArmedClear(true)
      setTimeout(() => setArmedClear(false), 3000)
      return
    }
    setFacts(emptyFacts())
    setPendingImport(null)
    setArmedClear(false)
  }

  return (
    <div className={aside ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]' : ''}>
      <div className="min-w-0 space-y-5">
        {canImport && (!hasFacts || keepImportVisible) ? (
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-medium">Import a website</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                  Paste your site URL and we read it, then fill as many of the fields below as we
                  can. You confirm and adjust — nothing is invented.
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                aria-label="Website URL to import"
                type="text"
                inputMode="url"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck="false"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder={form.websiteUrl || 'acme.com'}
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={importing}
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                {importing ? <LoaderSpinner /> : null}
                Import
              </button>
            </div>
            {importError && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importError}
              </p>
            )}
            {pendingImport && <ImportReview facts={pendingImport} onApply={applyImport} />}
          </section>
        ) : null}

        {showGreeting && <GreetingFields form={form} set={set} />}

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div>
            <h2 className="text-base font-medium">What the bot knows</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Answer the questions visitors actually ask. Filled sections are woven into the bot's
              instructions — it never invents the rest.
            </p>
          </div>

          <div className="mt-6 space-y-6">
            {FACT_FIELDS.map((field) => {
              const filled = ((facts[field.key] ?? '') as string).trim() !== ''
              return (
                <div
                  key={field.key}
                  id={`fact-${field.key}`}
                  className="border-t border-border/60 pt-6"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-medium">{field.label}</h3>
                    {!filled ? (
                      <button
                        type="button"
                        onClick={() => setFact(field.key, field.example)}
                        className="shrink-0 text-[12px] font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        title="Fill with a sample you can edit"
                      >
                        Show example
                      </button>
                    ) : (facts[field.key] ?? '') === field.example ? (
                      <button
                        type="button"
                        onClick={() => setFact(field.key, '')}
                        className="shrink-0 text-[12px] font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-destructive hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        title="Remove the example text"
                      >
                        Clear example
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {field.question} — {field.hint}
                  </p>
                  <textarea
                    aria-label={field.label}
                    rows={field.rows}
                    value={(facts[field.key] ?? '') as string}
                    onChange={(e) => setFact(field.key, e.target.value)}
                    className={`${textareaClass} mt-2`}
                  />
                </div>
              )
            })}

            <div className="border-t border-border/60 pt-6">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-medium">FAQ pairs</h3>
                  <p className="tnum mt-1 text-[13px] text-muted-foreground">
                    Question → answer pairs that steer answers hardest · {facts.faqs?.length ?? 0}
                    /50
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addFaq}
                  disabled={(facts.faqs?.length ?? 0) >= 50}
                  title={(facts.faqs?.length ?? 0) >= 50 ? 'FAQ limit reached (50)' : undefined}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                >
                  <Plus className="size-3" /> Add FAQ
                </button>
              </div>
              {(facts.faqs ?? []).length === 0 ? (
                <p className="mt-3 text-[13px] text-muted-foreground">
                  Nothing yet — add the pairs visitors actually type.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {(facts.faqs ?? []).map((faq, i) => (
                    <div key={faq._key} className="flex items-start gap-3">
                      <span className="tnum mt-2.5 w-6 shrink-0 text-center text-xs font-medium text-muted-foreground">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <input
                          aria-label={`FAQ ${i + 1} question`}
                          value={faq.q}
                          onChange={(e) => setFaq(i, { q: e.target.value })}
                          placeholder="Do you offer emergency service?"
                          className={inputClass}
                        />
                        <textarea
                          aria-label={`FAQ ${i + 1} answer`}
                          rows={2}
                          value={faq.a}
                          onChange={(e) => setFaq(i, { a: e.target.value })}
                          placeholder="Yes — 24/7 for maintenance plan members."
                          className={`${textareaClass} mt-0 resize-y`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFaq(i)}
                        aria-label={`Remove FAQ ${i + 1}`}
                        className="mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-border/60 pt-6">
              <h3 className="text-base font-medium">Misc</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                Anything else the bot should know — pasted About pages, policies, extra details.
                Added word-for-word to the bot's instructions.
              </p>
              <textarea
                aria-label="Misc"
                rows={4}
                value={facts.misc ?? ''}
                onChange={(e) => setMisc(e.target.value)}
                placeholder="Paste additional content here — the more context, the better."
                className={`${textareaClass} mt-2`}
              />
            </div>
          </div>
        </section>

        {hasFacts && (
          <section className="rounded-xl border border-destructive/30 bg-card p-5 shadow-sm">
            <h2 className="text-base font-medium text-destructive">Clear all facts</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Removes everything the bot knows — the sections above, FAQ pairs and misc. The import
              option returns so you can start over.
            </p>
            <button
              type="button"
              onClick={clearFacts}
              aria-label={armedClear ? 'Confirm clear all facts' : 'Clear all facts'}
              className={`mt-4 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive ${
                armedClear
                  ? 'bg-destructive text-white'
                  : 'border border-destructive/40 text-destructive hover:bg-destructive/10'
              }`}
            >
              {armedClear ? 'Confirm clear all facts' : 'Clear all facts'}
            </button>
          </section>
        )}
      </div>

      {aside && (
        <div className="min-w-0 space-y-5 lg:sticky lg:top-0 lg:self-start">
          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="text-base font-medium">Visitors will ask</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              {coveredCount === FACT_FIELDS.length
                ? 'Everything covered. Nice.'
                : `${coveredCount} of ${FACT_FIELDS.length} covered — add the rest so it never blanks.`}
            </p>
            <ul className="mt-3 space-y-1">
              {FACT_FIELDS.map((field) => {
                const filled = (facts[field.key] ?? '').trim() !== ''
                return (
                  <li key={field.key}>
                    <button
                      type="button"
                      onClick={() => focusFact(field.key)}
                      title={filled ? `Edit “${field.label}”` : `Add “${field.label}”`}
                      className="-mx-1.5 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span
                        className={`grid size-4 shrink-0 place-items-center rounded-full ${
                          filled
                            ? 'bg-success/15 text-success'
                            : 'bg-muted text-muted-foreground/60'
                        }`}
                      >
                        {filled ? (
                          <Check className="size-3" />
                        ) : (
                          <span className="size-1 rounded-full bg-current" />
                        )}
                      </span>
                      <span className={filled ? '' : 'text-muted-foreground'}>
                        {field.question}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-medium">Final prompt</h2>
              <button
                type="button"
                onClick={() => void copyPreview()}
                disabled={!preview}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
              >
                {previewCopied ? (
                  <Check className="size-3 text-success" />
                ) : (
                  <Copy className="size-3" />
                )}
                {previewCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
              Exactly what the bot reads each message — facts as JSON, live.
            </p>
            <pre className="mt-3 max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-muted-foreground">
              {preview || 'Fill in any field to see the assembled prompt.'}
            </pre>
          </section>
        </div>
      )}
    </div>
  )
}

function LoaderSpinner() {
  return <LoaderCircle className="size-3.5 animate-spin" />
}

function ImportReview({
  facts,
  onApply,
}: {
  facts: BusinessFacts
  onApply: (facts: BusinessFacts) => void
}) {
  const filled = FACT_FIELDS.filter((f) => (facts[f.key] ?? '').trim() !== '').length
  const miscFilled = Boolean((facts.misc ?? '').trim())
  const faqCount = facts.faqs?.length ?? 0
  const total = FACT_FIELDS.length + 1
  return (
    <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Read {filled + (miscFilled ? 1 : 0)} of {total} sections from your site
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {faqCount > 0 ? `Including ${faqCount} FAQ pair${faqCount === 1 ? '' : 's'}. ` : ''}
            Use them as a starting point — you can edit anything before saving.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onApply(facts)}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Check className="size-3.5" /> Use these facts
        </button>
      </div>
    </div>
  )
}
