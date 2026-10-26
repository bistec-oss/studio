import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { loopHealth, schedulerOffline, type HeartbeatLoop } from '@/lib/scheduler/heartbeatStatus'
import type { SchedulerStatus } from '@/lib/api-types'

// Is the scheduler worker ticking? Backs the "Scheduler offline" banner on the
// campaign queue panel (023). Any signed-in team member may read it. The
// WorkerHeartbeat table is global, so this selects three columns and reads no
// team, user or entry row; it echoes no request input.
const LOOPS: HeartbeatLoop[] = ['scheduler', 'generation']

export const GET = withTeamAuth(async () => {
  const rows = await prisma.workerHeartbeat.findMany({
    select: { loop: true, lastTickStartedAt: true, lastTickEndedAt: true },
  })
  const now = new Date()
  const loops = LOOPS.map((loop) => {
    const h = loopHealth(now, rows.find((r) => r.loop === loop) ?? null, loop)
    return { loop, state: h.state, lastSeenAt: h.lastSeenAt ? h.lastSeenAt.toISOString() : null }
  })
  const body: SchedulerStatus = { loops, offline: schedulerOffline(loops) }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
})
