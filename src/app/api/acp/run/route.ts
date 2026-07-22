import { NextRequest, NextResponse } from 'next/server'
import { resolveApiKey } from '@/mcp/auth'
import { generatePost } from '@/mcp/tools/generate'
import { publishPost } from '@/mcp/tools/publish'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-bistec-api-key')
    const key = await resolveApiKey(apiKey)
    if (!key) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    let body
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { capability, input } = body

    if (!capability || typeof capability !== 'string') {
      return NextResponse.json({ error: 'capability is required' }, { status: 400 })
    }
    if (!input || typeof input !== 'object') {
      return NextResponse.json({ error: 'input is required' }, { status: 400 })
    }

    try {
      switch (capability) {
        case 'generate_post': {
          const err = validateGenerateInput(input)
          if (err) return NextResponse.json({ error: err }, { status: 400 })
          const result = await generatePost({
            ...(input as Parameters<typeof generatePost>[0]),
            teamId: key.teamId,
          })
          return NextResponse.json({ output: result })
        }
        case 'publish_post': {
          const err = validatePublishInput(input)
          if (err) return NextResponse.json({ error: err }, { status: 400 })
          const result = await publishPost({
            ...(input as Parameters<typeof publishPost>[0]),
            teamId: key.teamId,
          })
          return NextResponse.json({ output: result })
        }
        default:
          return NextResponse.json({ error: `Unknown capability: ${capability}` }, { status: 400 })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: message }, { status: 422 })
    }
  } catch (err) {
    console.error(`[api] POST ${req.nextUrl.pathname} failed:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function validateGenerateInput(input: Record<string, unknown>): string | null {
  const required = ['topic', 'goal', 'tone', 'designMode'] as const
  for (const field of required) {
    if (typeof input[field] !== 'string' || !(input[field] as string).trim()) {
      return `${field} is required and must be a non-empty string`
    }
  }
  if (!['TEMPLATE', 'GENERATE'].includes(input.designMode as string)) {
    return 'designMode must be TEMPLATE or GENERATE'
  }
  if (!Array.isArray(input.channels) || input.channels.length === 0) {
    return 'channels must be a non-empty array'
  }
  return null
}

function validatePublishInput(input: Record<string, unknown>): string | null {
  if (typeof input.draftId !== 'string' || !input.draftId.trim()) {
    return 'draftId is required'
  }
  if (input.channel !== 'INSTAGRAM' && input.channel !== 'LINKEDIN') {
    return 'channel must be INSTAGRAM or LINKEDIN'
  }
  return null
}
