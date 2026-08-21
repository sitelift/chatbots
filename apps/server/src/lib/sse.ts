import type { SseEvent } from '@sitelift/shared'

export function sseFrame(event: SseEvent): string {
  const { event: name, ...data } = event
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
}

export function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  }
}
