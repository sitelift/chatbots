import { inputClass, labelClass } from '../../lib/ui'
import type { FormSetter, FormState } from './state'

export function GreetingFields({ form, set }: { form: FormState; set: FormSetter }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <h2 className="text-base font-medium">How it greets visitors</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        The welcome message and quick replies show before anyone types.
      </p>
      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor="ed-welcome" className={labelClass}>
            Welcome message
          </label>
          <input
            id="ed-welcome"
            type="text"
            value={form.welcomeMessage}
            onChange={(e) => set('welcomeMessage', e.target.value)}
            placeholder="Hi! How can I help?"
            className={`${inputClass} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="ed-chips" className={labelClass}>
            Quick replies <span className="font-normal text-muted-foreground/80">· up to 6</span>
          </label>
          <input
            id="ed-chips"
            type="text"
            value={form.quickReplies}
            onChange={(e) => set('quickReplies', e.target.value)}
            placeholder="Opening hours, Pricing, Book a visit"
            className={`${inputClass} mt-1.5`}
          />
        </div>
      </div>
    </section>
  )
}
