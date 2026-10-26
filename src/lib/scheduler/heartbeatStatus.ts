// Pure health rule for the scheduler worker's two loops (023 FR-02). No I/O and
// no clock: the caller passes `now` and the row it read.
//
// The worker writes a tick's start and its end separately, so a loop that is
// inside a long tick (generation can run for many minutes) is judged against a
// per-loop ceiling, not against the idle threshold. A loop with no row has
// never reported, and counts as down.

export type HeartbeatLoop = 'scheduler' | 'generation'

// Three missed 60 s polls.
export const OFFLINE_THRESHOLD_MS = 180_000

// The longest a healthy loop can stay inside one tick. Publishing: the claim
// lease (jobRunner.ts CLAIM_LEASE_MS, 5 min). Generation: two generation leases
// (30 min), since the 15 min lease bounds each of a run's two segments.
export const TICK_CEILING_MS: Record<HeartbeatLoop, number> = {
  scheduler: 300_000,
  generation: 1_800_000,
}

export interface HeartbeatRow {
  lastTickStartedAt: Date
  lastTickEndedAt: Date | null
}

export interface LoopHealth {
  state: 'online' | 'offline' | 'never'
  lastSeenAt: Date | null
}

export function loopHealth(now: Date, row: HeartbeatRow | null, loop: HeartbeatLoop): LoopHealth {
  if (!row) return { state: 'never', lastSeenAt: null }
  const started = row.lastTickStartedAt.getTime()
  const ended = row.lastTickEndedAt ? row.lastTickEndedAt.getTime() : null
  const lastSeenAt = new Date(Math.max(started, ended ?? started))
  const inTick = ended === null || ended < started
  // Inclusive limits; a future timestamp (clock skew) gives a negative age.
  const online = inTick
    ? now.getTime() - started <= TICK_CEILING_MS[loop]
    : now.getTime() - lastSeenAt.getTime() <= OFFLINE_THRESHOLD_MS
  return { state: online ? 'online' : 'offline', lastSeenAt }
}

// True when any loop is not online: `never` is down too (the banner's B4 case).
export function schedulerOffline(healths: Pick<LoopHealth, 'state'>[]): boolean {
  return healths.some((h) => h.state !== 'online')
}
