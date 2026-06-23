import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const templates = await prisma.brandKitTemplate.findMany({
    where: { brandKitId: params.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(templates)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { name, htmlTemplate } = body

  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!htmlTemplate?.trim()) return NextResponse.json({ error: 'htmlTemplate is required' }, { status: 400 })

  const template = await prisma.brandKitTemplate.create({
    data: { brandKitId: params.id, name: name.trim(), htmlTemplate: htmlTemplate.trim() },
  })

  return NextResponse.json(template, { status: 201 })
}
