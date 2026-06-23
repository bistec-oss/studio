import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const kits = await prisma.brandKit.findMany({
    where: { isDeleted: false },
    include: {
      prompts: { where: { isActive: true }, take: 1, select: { content: true, version: true } },
      _count: { select: { templates: true, artifacts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(kits)
}

export async function POST(req: NextRequest) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { name, colors, fonts, logoUrl, isDefault } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  // Only one kit can be the system default
  if (isDefault) {
    await prisma.brandKit.updateMany({ where: { isDefault: true }, data: { isDefault: false } })
  }

  const kit = await prisma.brandKit.create({
    data: {
      name: name.trim(),
      colors: colors ?? [],
      fonts: fonts ?? [],
      logoUrl: logoUrl ?? null,
      isDefault: isDefault ?? false,
    },
  })

  return NextResponse.json(kit, { status: 201 })
}
