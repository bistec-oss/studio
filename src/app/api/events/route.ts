import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { CATALOGUE, CLIENT_EVENTS } from '@/lib/analytics/catalogue'
import { allow } from '@/lib/analytics/rateLimit'
import { count, track } from '@/lib/analytics/track'

// POST /api/events: the browser's way into the event store (006 FR-08). Only
// the CLIENT_EVENTS names are accepted. teamId, userId and source come from the
// session; anything of those in the body is ignored. A brief draft id is kept
// only when it belongs to the caller; a foreign or missing one writes nothing
// (404, the existing brief-draft semantics). The body is capped at 2 KB on the
// raw text, and each user may send 60 events a minute: the excess is answered
// 204 like any other (the client must not learn or react) and counted in
// AnalyticsDrop, which the insights page shows.
export const MAX_BODY_BYTES = 2048

// The body as text, or null once it passes the cap. A declared Content-Length
// over the cap is refused without reading; otherwise the stream is read with a
// running byte count and cancelled the moment it passes the cap, so a missing or
// lying Content-Length cannot make the server buffer more than the cap.
async function readCapped(req: Request): Promise<string | null> {
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null
  if (!req.body) return ''
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export const POST = withTeamAuth(async (req, _ctx, user) => {
  const text = await readCapped(req)
  if (text === null) {
    return NextResponse.json({ error: 'Body too large' }, { status: 413 })
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  const name = body?.name
  if (typeof name !== 'string' || !(CLIENT_EVENTS as readonly string[]).includes(name)) {
    return NextResponse.json({ error: 'Unknown event' }, { status: 400 })
  }
  const eventName = name as (typeof CLIENT_EVENTS)[number]
  const payload = CATALOGUE[eventName].schema.safeParse(body?.payload ?? {})
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (!allow(user.userId)) {
    await count('dropped', eventName, 'rate-limit')
    return new NextResponse(null, { status: 204 })
  }

  const data = payload.data as { step: number; briefDraftId?: string | null }
  if (data.briefDraftId) {
    const owned = await prisma.briefDraft.findFirst({
      where: { id: data.briefDraftId, userId: user.userId },
      select: { id: true },
    })
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await track(eventName, {
    source: 'web',
    teamId: user.teamId,
    userId: user.userId,
    payload: data,
  })
  return new NextResponse(null, { status: 204 })
})
