import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: {
      prompts: { orderBy: { version: 'desc' } },
      templates: { orderBy: { createdAt: 'asc' } },
      artifacts: { orderBy: { createdAt: 'desc' } },
    },
  })

  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(kit)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const kit = await prisma.brandKit.findUnique({ where: { id: params.id } })
  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { name, colors, fonts, logoUrl, isDefault } = body

  if (isDefault) {
    await prisma.brandKit.updateMany({
      where: { isDefault: true, id: { not: params.id } },
      data: { isDefault: false },
    })
  }

  const updated = await prisma.brandKit.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(colors !== undefined && { colors }),
      ...(fonts !== undefined && { fonts }),
      ...(logoUrl !== undefined && { logoUrl }),
      ...(isDefault !== undefined && { isDefault }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const kit = await prisma.brandKit.findUnique({ where: { id: params.id } })
  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.brandKit.update({
    where: { id: params.id },
    data: { isDeleted: true, deletedAt: new Date() },
  })

  return new NextResponse(null, { status: 204 })
}
