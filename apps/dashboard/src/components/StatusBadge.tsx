import type { ChatbotAdminView } from '@sitelift/shared'

export function StatusBadge({ status }: { status: ChatbotAdminView['status'] }) {
  const styles = {
    active: 'bg-success/10 text-success',
    paused: 'bg-warning/10 text-warning',
    archived: 'bg-muted text-muted-foreground',
  }[status]
  const dot = {
    active: 'bg-success',
    paused: 'bg-warning',
    archived: 'bg-muted-foreground/50',
  }[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  )
}
