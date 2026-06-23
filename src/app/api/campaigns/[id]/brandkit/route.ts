import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { resolveBrandKit } from '@/lib/brandkit/resolve'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const resolved = await resolveBrandKit(params.id)
  if (!resolved) return NextResponse.json({ kit: null, source: null })

  return NextResponse.json({ kit: resolved, source: resolved.source })
}
