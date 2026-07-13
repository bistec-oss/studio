import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, parseBody } from '@/lib/api/handler'
import { briefDraftPayloadSchema } from '@/lib/brief/briefDraftPayload'
import { listBriefDrafts, saveBriefDraft } from '@/lib/brief/briefDrafts'

// Unfinished-brief autosave. Strictly owner-scoped (withAuth, no admin
// override — private working state); all lifecycle rules (TTL sweep, 5-cap
// eviction, image cleanup) live in the briefDrafts service.

// GET /api/brief-drafts — the current user's unfinished briefs, newest first.
// List omits payloads (dashboard only needs topic + freshness).
export const GET = withAuth(async (_req, _ctx, user) => {
  const rows = await listBriefDrafts(user.userId)
  return NextResponse.json({
    drafts: rows.map((r) => ({ id: r.id, topic: r.topic, updatedAt: r.updatedAt })),
  })
})

const putSchema = z.object({
  // Present ⇒ update that owned row; absent ⇒ create (evicting past the cap).
  id: z.string().optional(),
  payload: briefDraftPayloadSchema,
})

// PUT /api/brief-drafts — debounced wizard autosave upsert.
export const PUT = withAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, putSchema)
  if (body.response) return body.response

  const result = await saveBriefDraft(user.userId, body.data.id, body.data.payload)
  if (!result.ok) {
    // not_found: the row was deleted (e.g. Generate succeeded, or another tab
    // discarded it) — a late autosave must not resurrect it. The wizard stops
    // saving on 404/410.
    if (result.reason === 'not_found') {
      return NextResponse.json({ error: 'Draft no longer exists' }, { status: 404 })
    }
    if (result.reason === 'too_large') {
      return NextResponse.json({ error: 'Draft payload too large' }, { status: 413 })
    }
    // trivial: nothing worth saving — not an error, just no row (AC-7).
    return NextResponse.json({ error: 'Nothing to save' }, { status: 422 })
  }
  return NextResponse.json({ id: result.id })
})
