import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/handler'
import { resolveBrandKit } from '@/lib/brandkit/resolve'

export const GET = withAuth<{ id: string }>(async (_req, { params }) => {
  const resolved = await resolveBrandKit(params.id)
  if (!resolved) return NextResponse.json({ kit: null, source: null })

  return NextResponse.json({ kit: resolved, source: resolved.source })
})
