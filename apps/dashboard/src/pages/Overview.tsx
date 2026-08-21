import { ArrowRight, Bot, MessageSquare, Zap } from 'lucide-react'

const stats = [
  { label: 'Conversations', value: '0', hint: 'No conversations yet' },
  { label: 'Leads captured', value: '0', hint: 'Leads appear as visitors share contact details' },
  { label: 'Active chatbots', value: '0', hint: 'Create your first chatbot to get started' },
]

export function Overview() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">A live view of every chatbot you run.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map(({ label, value, hint }) => (
          <div
            key={label}
            className="rounded-lg border bg-card p-5 transition-colors duration-150 hover:bg-muted/40"
          >
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="tnum mt-2 text-3xl font-semibold tracking-tight">{value}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Bot className="size-4 text-muted-foreground" />
            <h2 className="text-base font-medium">Chatbots</h2>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            New chatbot
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <div className="flex flex-col items-center px-6 py-14 text-center">
          <div className="grid size-11 place-items-center rounded-full bg-muted">
            <MessageSquare className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-[15px] font-medium">No chatbots yet</h3>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Create your first chatbot, paste one script tag on your client's site, and start
            capturing leads today.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Zap className="size-3.5" />
            Create chatbot
          </button>
        </div>
      </div>
    </div>
  )
}
