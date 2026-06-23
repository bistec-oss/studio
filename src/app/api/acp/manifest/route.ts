import { NextRequest, NextResponse } from 'next/server'
import { AGENT_MANIFEST } from '@/acp/agent'
import { isValidKey } from '@/mcp/auth'

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get('x-bistec-api-key')
  if (!isValidKey(apiKey)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  return NextResponse.json(AGENT_MANIFEST)
}
