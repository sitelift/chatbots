import { Plus, X } from 'lucide-react'
import { inputClass, labelClass } from '../../lib/ui'
import { uid } from '../../lib/uid'
import type { EditableDomain } from './state'

export function DomainsList({
  domains,
  onChange,
}: {
  domains: EditableDomain[]
  onChange: (domains: EditableDomain[]) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="ed-domains" className={labelClass}>
          Allowed domains{' '}
          <span className="font-normal text-muted-foreground/80">· widget only answers here</span>
        </label>
        <button
          type="button"
          onClick={() => onChange([...domains, { _key: uid(), value: '' }])}
          disabled={domains.length >= 20}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
        >
          <Plus className="size-3" /> Add domain
        </button>
      </div>
      <div className="mt-1.5 space-y-2">
        {domains.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No domains yet — add the sites that may embed this widget.
          </p>
        ) : (
          domains.map((domain, i) => (
            <div key={domain._key} className="flex items-center gap-2">
              <input
                id={i === 0 ? 'ed-domains' : undefined}
                aria-label={`Allowed domain ${i + 1}`}
                type="text"
                value={domain.value}
                onChange={(e) => {
                  const next = [...domains]
                  next[i] = { _key: domain._key, value: e.target.value }
                  onChange(next)
                }}
                placeholder="acme.com"
                className={`${inputClass} font-mono`}
              />
              <button
                type="button"
                onClick={() => onChange(domains.filter((d) => d._key !== domain._key))}
                aria-label={`Remove domain ${i + 1}`}
                className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
