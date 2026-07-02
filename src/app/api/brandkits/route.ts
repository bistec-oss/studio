import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/api/handler'

// Lists non-deleted brand kits for selection in the brief wizard and the
// project/campaign forms. Available to any signed-in user (editors included) —
// the /api/admin/brandkits routes are admin-gated and would 403 for editors.
// Read-only and minimal (id, name, preview swatch); management stays in /admin.
export const GET = withAuth(async () => {
  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, colors: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })

  const result = kits.map((k) => {
    const colors = Array.isArray(k.colors) ? (k.colors as string[]) : []
    return {
      id: k.id,
      name: k.name,
      isDefault: k.isDefault,
      previewColor: colors[0] ?? '#0284c7',
    }
  })

  return NextResponse.json(result)
})
