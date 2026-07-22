import { NextRequest, NextResponse } from 'next/server'
import { AGENT_MANIFEST } from '@/acp/agent'
import { resolveApiKey } from '@/mcp/auth'

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get('x-bistec-api-key')
    const key = await resolveApiKey(apiKey)
    if (!key) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    return NextResponse.json(AGENT_MANIFEST)
  } catch (err) {
    console.error(`[api] GET ${req.nextUrl.pathname} failed:`, err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
