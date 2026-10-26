// 031 T10 (FR-29): POST /api/campaigns/[id]/briefing/upgrade. Prisma, auth and
// the model are faked; the real route wrapper, detector, validator and seam run.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  campaign: vi.fn(),
  briefing: vi.fn(),
  resolveKit: vi.fn(),
  user: vi.fn(),
  team: vi.fn(),
  resolve: vi.fn(),
  run: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    campaign: { findFirst: h.campaign },
    campaignBriefing: { findFirst: h.briefing },
  },
}))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: h.resolveKit }))
vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { getCurrentUser: h.user, hasRole: roles.hasRole }
})
vi.mock('@/lib/authz/teamContext', () => ({
  ACTIVE_TEAM_COOKIE: 'bistec-active-team',
  resolveActiveTeam: h.team,
}))
vi.mock('@/lib/agent/userToken', () => ({
  withClaudeAuth: (_u: unknown, _t: unknown, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/agent/config', () => ({ pipelineMode: () => 'cli' }))
vi.mock('@/lib/campaign/briefingAssistant', () => {
  class AssistantModelError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message)
    }
  }
  return { AssistantModelError, resolveAssistantModel: h.resolve, runBriefingModel: h.run }
})

import type { ModelCallRecord } from '@/lib/models/modelCalls'

const MODEL = {
  surface: 'ASSISTANT_BRIEFING',
  key: 'SONNET',
  arg: 'sonnet',
  source: 'system',
  substitutedFrom: null,
}
const TEXT =
  'Give the logo generous clear space. Keep the logo a similar size to the wordmark. Leave plenty of breathing room around the logo.'
const reply = (proposals: unknown) => '```kitedits\n' + JSON.stringify(proposals) + '\n```'

let calls: ModelCallRecord[]
let logs: string[]

async function load(mock: boolean) {
  vi.resetModules()
  vi.stubEnv('MOCK_AI', mock ? 'true' : 'false')
  const recorder = await import('@/lib/models/modelCalls')
  recorder.setModelCallSink({
    record: (r) => calls.push(r),
    read: () => calls,
    clear: () => (calls.length = 0),
  })
  return (await import('@/app/api/campaigns/[id]/briefing/upgrade/route')).POST
}
type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const post = (fn: unknown, body: unknown, id = 'c1') =>
  (fn as Handler)(
    new NextRequest('http://localhost/api', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )

beforeEach(() => {
  for (const f of Object.values(h)) f.mockReset()
  h.user.mockResolvedValue({ userId: 'u1', role: 'editor' })
  h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'ADMIN' })
  h.resolve.mockResolvedValue(MODEL)
  h.campaign.mockResolvedValue({ id: 'c1' })
  h.briefing.mockResolvedValue({ version: 3 })
  h.resolveKit.mockResolvedValue({ colors: ['#0b3d91'], fonts: [{ name: 'Poppins', url: 'u' }] })
  calls = []
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('briefing upgrade route', () => {
  it('403 for a team editor, before anything is read', async () => {
    h.team.mockResolvedValue({ kind: 'ok', teamId: 'team1', teamRole: 'EDITOR' })
    const POST = await load(false)
    expect((await post(POST, { text: TEXT, baseVersion: 3 })).status).toBe(403)
    expect(h.campaign).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
  })

  it('404 when the campaign is not in the team (scoped by teamId)', async () => {
    h.campaign.mockResolvedValue(null)
    const POST = await load(false)
    expect((await post(POST, { text: TEXT, baseVersion: 3 })).status).toBe(404)
    expect(h.campaign.mock.calls[0][0].where).toMatchObject({ id: 'c1', teamId: 'team1' })
    expect(h.run).not.toHaveBeenCalled()
  })

  it('400 for a bad body', async () => {
    const POST = await load(false)
    for (const body of [
      {},
      { text: TEXT },
      { baseVersion: 3 },
      { text: TEXT, baseVersion: -1 },
      { text: TEXT, baseVersion: 1.5 },
      { text: '', baseVersion: 3 },
      { text: 'x'.repeat(20_001), baseVersion: 3 },
      { text: TEXT, baseVersion: 3, extra: 1 },
      'not json',
    ]) {
      expect((await post(POST, body)).status).toBe(400)
    }
    expect(h.run).not.toHaveBeenCalled()
  })

  it('409 STALE_BASE with the active version and no model call', async () => {
    const POST = await load(false)
    const res = await post(POST, { text: TEXT, baseVersion: 2 })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ code: 'STALE_BASE', activeVersion: 3 })
    expect(h.resolve).not.toHaveBeenCalled()
    expect(h.run).not.toHaveBeenCalled()
  })

  it('baseVersion 0 matches a campaign with no briefing', async () => {
    h.briefing.mockResolvedValue(null)
    h.run.mockResolvedValue(reply([]))
    const POST = await load(false)
    expect((await post(POST, { text: TEXT, baseVersion: 0 })).status).toBe(200)
  })

  it('passes the briefing surface and label, and builds the prompt from roles only', async () => {
    h.run.mockResolvedValue(
      reply([
        {
          candidateId: 'logo-clear-space:14',
          replacement: 'clear space of 1 to 2 wordmark letters',
        },
      ]),
    )
    const POST = await load(false)
    const res = await post(POST, { text: TEXT, baseVersion: 3 })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.outcome).toBe('edits')
    expect(body.baseVersion).toBe(3)
    expect(h.resolve.mock.calls[0][0]).toBe('ASSISTANT_BRIEFING')
    const [system, messages, , , opts] = h.run.mock.calls[0]
    expect(opts).toMatchObject({ label: 'briefing-upgrade' })
    const all = system + JSON.stringify(messages)
    expect(all).toContain('the headline font')
    expect(all).not.toMatch(/#0b3d91|Poppins/i)
    expect(logs.some((l) => l.startsWith('[briefing-upgrade] team=team1 campaign=c1 '))).toBe(true)
  })

  it('502 on an unreadable reply and 422 when no model can run', async () => {
    h.run.mockResolvedValue('no block here')
    const POST = await load(false)
    const bad = await post(POST, { text: TEXT, baseVersion: 3 })
    expect(bad.status).toBe(502)
    expect((await bad.json()).code).toBe('UPGRADE_PARSE_FAILED')
    const { AssistantModelError } = await import('@/lib/campaign/briefingAssistant')
    h.resolve.mockRejectedValue(new AssistantModelError('MODEL_NOT_ALLOWED' as never, 'nope'))
    const res = await post(POST, { text: TEXT, baseVersion: 3 })
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({ code: 'MODEL_NOT_ALLOWED', message: 'nope' })
  })

  it('MOCK_AI: records one briefing-upgrade call on the ASSISTANT_BRIEFING model, no model call', async () => {
    const POST = await load(true)
    const res = await post(POST, { text: TEXT, baseVersion: 3 })
    expect(res.status).toBe(200)
    expect(h.run).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ surface: 'ASSISTANT_BRIEFING', label: 'briefing-upgrade' })
  })
})
