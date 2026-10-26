import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { MOCK_AI } from '@/lib/testHooks'

/**
 * Test-only seam (030): set `renderedText` to SQL NULL on a draft and all its
 * revisions, which is what a draft from before 030 looks like (AC-15). Dormant
 * in production, gated like /api/test/worker-heartbeat: a hard 404 in prod
 * builds, a 404 unless MOCK_AI is set, and admin-only on top (a team admin or a
 * super admin). Team-scoped: a draft of another team is a 404.
 */
const bodySchema = z.object({ draftId: z.string().min(1) })

const nullStamp = withTeamAdmin(async (req, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { draftId } = body.data

  const draft = await prisma.draft.findUnique({ where: { id: draftId }, select: { teamId: true } })
  if (!draft || draft.teamId !== user.teamId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction([
    prisma.draft.update({ where: { id: draftId }, data: { renderedText: Prisma.DbNull } }),
    prisma.draftRevision.updateMany({ where: { draftId }, data: { renderedText: Prisma.DbNull } }),
  ])
  return NextResponse.json({ ok: true })
})

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!MOCK_AI) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return nullStamp(req, { params: Promise.resolve({}) })
}
