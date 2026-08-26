const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function relativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime()
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) {
    const minutes = Math.floor(diff / MINUTE)
    return `${minutes}m ago`
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR)
    return `${hours}h ago`
  }
  if (diff < 7 * DAY) {
    const days = Math.floor(diff / DAY)
    return days === 1 ? 'yesterday' : `${days}d ago`
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
