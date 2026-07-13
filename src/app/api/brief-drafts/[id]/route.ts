import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { getBriefDraft, deleteBriefDraft } from '@/lib/brief/briefDrafts'

// Single unfinished brief — resume fetch + discard. Foreign ids are 404 (not
// 403): existence of another user's working state must not leak (FR-8).

// GET /api/brief-drafts/[id] — full payload for wizard rehydration.
export const GET = withAuth<{ id: string }>(async (_req, { params }, user) => {
  const row = await getBriefDraft(user.userId, params.id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    id: row.id,
    topic: row.topic,
    updatedAt: row.updatedAt,
    payload: row.payload,
  })
})

// DELETE /api/brief-drafts/[id] — discard (deletes the row's briefs/<uid>/…
// images). ?keepImages=true is the Generate-success variant: the new
// Brief.briefImages references those objects, so only the row goes.
export const DELETE = withAuth<{ id: string }>(async (req, { params }, user) => {
  const keepImages = new URL(req.url).searchParams.get('keepImages') === 'true'
  const deleted = await deleteBriefDraft(user.userId, params.id, { keepImages })
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
})
