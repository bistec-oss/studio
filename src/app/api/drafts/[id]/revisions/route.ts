import { NextResponse } from 'next/server'
import { getDraftAccessInfo } from '@/lib/auth'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveExportUrl } from '@/lib/storage/minio'
import { listCommittedRevisions } from '@/lib/drafts/revisions'

type Params = { id: string }

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const info = await getDraftAccessInfo(params.id)
  if (!info || !canAccessContent(user, info)) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // The version-switch list: committed chain rows only. A rejected refine
  // render (change 004 FR-13) is never listed — it is not a version.
  const revisions = await listCommittedRevisions(params.id)

  // exportUrl is stored as an EXPORTS object key — sign each for the browser.
  const signed = await Promise.all(
    revisions.map(async (r) => ({ ...r, exportUrl: await resolveExportUrl(r.exportUrl) }))
  )

  return NextResponse.json(signed)
})
