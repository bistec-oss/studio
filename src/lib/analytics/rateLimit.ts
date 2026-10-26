// The per-user window for POST /api/events (006 FR-08): at most LIMIT events in
// any rolling WINDOW_MS. In-process on purpose (one web instance; a restart
// resets it, which only ever lets a few extra events through). The route counts
// each refused event in AnalyticsDrop, so a refusal never reads as a healthy zero.
export const EVENTS_PER_WINDOW = 60
export const WINDOW_MS = 60_000
// Above this many tracked users the map is swept of stale entries on the way in.
const SWEEP_AT = 1000

const windows = new Map<string, number[]>()

/** True when `userId` may send one more event now; records the event when so. */
export function allow(userId: string, now: number = Date.now()): boolean {
  if (windows.size > SWEEP_AT) {
    for (const [id, stamps] of windows) {
      if (stamps.length === 0 || now - stamps[stamps.length - 1] >= WINDOW_MS) windows.delete(id)
    }
  }
  const recent = (windows.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= EVENTS_PER_WINDOW) {
    windows.set(userId, recent)
    return false
  }
  recent.push(now)
  windows.set(userId, recent)
  return true
}

/** Test helper: forget every window. */
export function resetRateLimit(): void {
  windows.clear()
}
