import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withSuperAdmin } from '@/lib/api/handler'
import { DEFAULT_RANGE, RANGES, insights } from '@/lib/analytics/queries'

// The insights read (006 FR-10, NFR-05). Super admin only, global across teams;
// every number comes from queries.ts. This route never writes or deletes.
const query = z.object({ range: z.enum(RANGES).default(DEFAULT_RANGE) })

export const GET = withSuperAdmin(async (req) => {
  const parsed = query.safeParse({ range: req.nextUrl.searchParams.get('range') ?? undefined })
  if (!parsed.success) return NextResponse.json({ error: 'range must be 7d, 30d or 90d' }, { status: 400 })
  return NextResponse.json(await insights(parsed.data.range))
})
