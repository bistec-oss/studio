import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth'

// Lists every brand-kit template across all non-deleted kits, for the brief
// wizard's template picker. Available to any signed-in user (editors included) —
// the /api/admin/brandkits routes are admin-gated and would 403 for editors.
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.brandKitTemplate.findMany({
    where: { brandKit: { isDeleted: false } },
    select: {
      id: true,
      name: true,
      brandKitId: true,
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
      brandKitName: t.brandKit?.name ?? null,
      previewColor: colors[0] ?? '#0284c7',
    }
  })

  return NextResponse.json(result)
}
