import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/handler'

// Lists brand-kit templates for the brief wizard's template picker. Available to
// any signed-in user (editors included) — the /api/admin/brandkits routes are
// admin-gated and would 403 for editors. Pass ?brandKitId= to restrict the list
// to a single kit (the wizard filters templates to the selected brand kit).
export const GET = withAuth(async (req: NextRequest) => {
  const brandKitId = req.nextUrl.searchParams.get('brandKitId') ?? undefined

  const templates = await prisma.brandKitTemplate.findMany({
    where: { brandKit: { isDeleted: false }, ...(brandKitId ? { brandKitId } : {}) },
    select: {
      id: true,
      name: true,
      brandKitId: true,
      aspectRatio: true,
      createdAt: true,
      brandKit: { select: { name: true, colors: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const result = templates.map((t) => {
    const colors = Array.isArray(t.brandKit?.colors) ? (t.brandKit.colors as string[]) : []
    return {
      id: t.id,
      name: t.name,
      brandKitId: t.brandKitId,
      aspectRatio: t.aspectRatio,
      brandKitName: t.brandKit?.name ?? null,
      previewColor: colors[0] ?? '#0284c7',
    }
  })

  return NextResponse.json(result)
})
