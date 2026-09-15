import { NextResponse } from 'next/server'
import { listChainRevisions } from '@/lib/drafts/revisions'
import { getDraftAccessInfo } from '@/lib/auth'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const info = await getDraftAccessInfo(params.id)
  if (!info || !canAccessContent(user, info)) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  // This is the version-switch list, so it must be the CHAIN and nothing else —
  // a rejected render (retained out-of-chain with a negative number) appearing
  // here would offer the user a version to switch to that was deliberately not
  // applied. The filter lives in listChainRevisions, not in this route.
  const revisions = await listChainRevisions(params.id)

  // exportUrl is stored as an EXPORTS object key — sign each for the browser.
  const signed = await Promise.all(
    revisions.map(async (r) => ({ ...r, exportUrl: await resolveExportUrl(r.exportUrl) }))
  )

  return NextResponse.json(signed)
})
