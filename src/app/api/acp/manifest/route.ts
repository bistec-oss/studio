import { NextRequest, NextResponse } from 'next/server'
import { AGENT_MANIFEST } from '@/acp/agent'
import { hasAnyKey } from '@/mcp/auth'

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-bistec-api-key')
  if (!hasAnyKey(apiKey)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  return NextResponse.json(AGENT_MANIFEST)
}
