import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole('admin')
  if (auth instanceof NextResponse) return auth

  const body = await req.json()
  const { description } = body

  if (!description?.trim()) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  const kit = await prisma.brandKit.findUnique({
    where: { id: params.id },
    include: { artifacts: { where: { feedToAI: true }, select: { name: true, type: true } } },
  })
  if (!kit || kit.isDeleted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const colors = Array.isArray(kit.colors) ? (kit.colors as string[]).join(', ') : 'none specified'
  const fonts = Array.isArray(kit.fonts)
    ? (kit.fonts as Array<{ name: string }>).map(f => f.name).join(', ')
    : 'none specified'
  const artifactNames = kit.artifacts.map(a => `${a.name} (${a.type})`).join(', ') || 'none'

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a brand strategist. Write a brand voice prompt for an AI design agent.

Brand name: ${kit.name}
Brand colors: ${colors}
Brand fonts: ${fonts}
Brand artifacts: ${artifactNames}
Admin description: ${description}

Write a detailed system prompt (2–4 paragraphs) that instructs an AI design agent to maintain brand consistency when creating social media posts. Cover: visual style, tone of voice, color usage, typography guidance, and what to avoid. Write the prompt in second person addressed to the AI ("You are...").`,
      },
    ],
  })

  const textBlock = message.content.find(b => b.type === 'text')
  const draft = textBlock && 'text' in textBlock ? textBlock.text : ''

  // Return the draft — admin must explicitly save it as a new version
  return NextResponse.json({ draft })
}
