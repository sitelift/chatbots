const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20

const hits = new Map<string, number[]>()

let lastSweep = Date.now()

function sweep(now: number): void {
  if (now - lastSweep < WINDOW_MS) return
  lastSweep = now
  for (const [key, timestamps] of hits) {
    const alive = timestamps.filter((t) => now - t < WINDOW_MS)
    if (alive.length === 0) hits.delete(key)
    else hits.set(key, alive)
  }
}

export function checkRateLimit(key: string, now = Date.now()): boolean {
  sweep(now)
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) return false
  recent.push(now)
  hits.set(key, recent)
  return true
}

export function resetRateLimits(): void {
  hits.clear()
}
