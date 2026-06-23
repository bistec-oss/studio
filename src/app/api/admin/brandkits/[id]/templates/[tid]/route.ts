import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; tid: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { name, htmlTemplate } = body

  const template = await prisma.brandKitTemplate.findFirst({
    where: { id: params.tid, brandKitId: params.id },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updated = await prisma.brandKitTemplate.update({
    where: { id: params.tid },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(htmlTemplate !== undefined && { htmlTemplate: htmlTemplate.trim() }),
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; tid: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const template = await prisma.brandKitTemplate.findFirst({
    where: { id: params.tid, brandKitId: params.id },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.brandKitTemplate.delete({ where: { id: params.tid } })

  return new NextResponse(null, { status: 204 })
}
