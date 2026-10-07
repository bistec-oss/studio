import { describe, it, expect, vi, beforeEach } from 'vitest'

// F3 (change 004 final fix wave, AC-04): the generation and regenerate-design
// paths write DraftRevision rows outside revisions.ts. Each must stamp the row
// with the render it holds — the same prompt version + font set it stamps on
// the draft (draftRevisions.test.ts covers commit / reject / restore / adopt).

const fake = vi.hoisted(() => {
  const db = {
    draftWrites: [] as Array<{ op: string; data: Record<string, unknown> }>,
    revisionCreates: [] as Array<Record<string, unknown>>,
    draft: null as null | Record<string, unknown>,
  }
  const tx = {
    draft: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftWrites.push({ op: 'update', data })
        return { id: 'd1', ...data }
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.draftWrites.push({ op: 'create', data })
        return { id: 'd1', ...data }
      },
      findUnique: async () => db.draft,
    },
    draftRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.revisionCreates.push(data)
        return { id: `rev-${db.revisionCreates.length}` }
      },
      findFirst: async () => {
        const nums = db.revisionCreates.map((r) => r.revisionNumber as number)
        return nums.length ? { revisionNumber: Math.max(...nums) } : null
      },
    },
    brandKitTemplate: { findFirst: async () => ({ id: 't1', aspectRatio: 'SQUARE' }) },
  }
  const client = { ...tx, $transaction: async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx) }
  return { db, client }
})
const db = fake.db

vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit' }) }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/providers/registry', () => ({
  resolveCopyProvider: async () => ({ generateCopy: async () => 'the caption' }),
}))
vi.mock('@/lib/agent/briefInput', () => ({ buildBriefInput: () => ({}) }))
vi.mock('@/lib/agent/pathA', () => ({
  runPathADesign: async () => ({ htmlContent: '<html>a</html>', exportUrl: 'exports/a.png' }),
  assertTemplateMatchesBrief: () => {},
}))
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => ({ htmlContent: '<html>b</html>', exportUrl: 'exports/b.png', backgroundImageUrl: null }),
}))
vi.mock('@/lib/agent/generationErrors', () => ({ humanizeGenerationError: (e: unknown) => String(e) }))
// The route's auth wrapper → a pass-through with a fixed teammate.
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
// Run the claimed action's work inline so the test can observe its writes.
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => true,
  startDraftAction: async (_d: string, _u: string, _t: string, _a: string, work: () => Promise<unknown>) => {
    await work()
  },
}))

import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { generateDraftForBrief, runGenerationForDraft } from '@/lib/agent/generateDraft'
import { POST as regenerateDesign } from '@/app/api/drafts/[id]/regenerate-design/route'

const STAMP = { promptVersion: PROMPT_VERSION, fontSet: 'fonts-test' }

const brief = {
  id: 'b1',
  teamId: 'team1',
  userId: 'u1',
  campaignId: null,
  brandKitId: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  copyProviderKey: null,
} as never

beforeEach(() => {
  db.draftWrites = []
  db.revisionCreates = []
  db.draft = null
})

describe('generation v1 "Original design" revision', () => {
  it('sync path (MCP/ACP, scheduler): the v1 row and the draft carry the same stamp', async () => {
    await generateDraftForBrief(brief, { userId: null, teamId: 'team1' })
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ revisionNumber: 1, instruction: 'Original design', ...STAMP })
    expect(db.draftWrites.find((w) => w.op === 'create')!.data).toMatchObject(STAMP)
  })

  it('async path (brief wizard): finalizeDraftV1 stamps the v1 row and the draft', async () => {
    db.draft = { id: 'd1', templateId: null, brief }
    await runGenerationForDraft('d1', { userId: 'u1', teamId: 'team1' })
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ revisionNumber: 1, instruction: 'Original design', ...STAMP })
    const finalize = db.draftWrites.find((w) => w.data.status === 'EXPORTED')!
    expect(finalize.data).toMatchObject(STAMP)
  })
})

describe('regenerate-design', () => {
  const req = {} as never
  const ctx = { params: { id: 'd1' } } as never

  it('the regenerated revision and the draft carry the same (current) stamp', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, copyText: 'c', htmlContent: '<html>v1</html>', exportUrl: 'exports/v1.png',
      currentRevisionNumber: 1, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    const res = (await regenerateDesign(req, ctx)) as Response
    expect(res.status).toBe(202)
    expect(db.revisionCreates).toHaveLength(1)
    expect(db.revisionCreates[0]).toMatchObject({ instruction: 'Regenerated design', ...STAMP })
    expect(db.draftWrites.at(-1)!.data).toMatchObject(STAMP)
  })

  it("a legacy draft's 'Design before regenerate' snapshot keeps the DRAFT's own stamp (it is that render)", async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, copyText: 'c', htmlContent: '<html>legacy</html>', exportUrl: 'exports/l.png',
      currentRevisionNumber: null, promptVersion: 'pv-old', fontSet: 'fonts-old',
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates).toHaveLength(2)
    expect(db.revisionCreates[0]).toMatchObject({
      instruction: 'Design before regenerate',
      promptVersion: 'pv-old',
      fontSet: 'fonts-old',
    })
    expect(db.revisionCreates[1]).toMatchObject({ instruction: 'Regenerated design', ...STAMP })
  })

  it('a legacy snapshot of an unstamped draft is null, never undefined', async () => {
    db.draft = {
      id: 'd1', teamId: 'team1', brief, copyText: 'c', htmlContent: '<html>legacy</html>', exportUrl: 'exports/l.png',
      currentRevisionNumber: null, promptVersion: null, fontSet: null,
    }
    await regenerateDesign(req, ctx)
    expect(db.revisionCreates[0]).toHaveProperty('promptVersion', null)
    expect(db.revisionCreates[0]).toHaveProperty('fontSet', null)
  })
})
