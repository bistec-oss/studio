import { describe, it, expect, vi, beforeEach } from 'vitest'

// 031 FR-02: one lost-claim cleanup (discardOnLostClaim). Regenerate design
// uploads its export before the guarded write; a lost claim or a revision
// conflict rolls the write back, so THIS run's export (result.exportUrl, never
// the draft row's) is removed. commitDraftRevision and recordRejectedRender
// keep their behaviour through the helper: their cases are in
// draftRevisions.test.ts (the "lost claim" / "revision conflict" deletes).

const fake = vi.hoisted(() => {
  const db = {
    guardedCount: 1,
    // A non-claim failure inside the transaction (e.g. a dropped connection).
    guardedThrows: null as Error | null,
    revisionCreates: [] as Array<Record<string, unknown>>,
    draft: null as null | Record<string, unknown>,
    deletes: [] as string[],
  }
  const tx = {
    teamModelPolicy: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
    team: { findUnique: async () => null },
    draft: {
      findUnique: async () => db.draft,
      updateMany: async () => {
        if (db.guardedThrows) throw db.guardedThrows
        return { count: db.guardedCount }
      },
    },
    draftRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        db.revisionCreates.push(data)
        return { id: 'rev' }
      },
      findFirst: async () => null,
    },
  }
  const client = {
    ...tx,
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg)
      const before = db.revisionCreates.length
      try {
        return await (arg as (t: typeof tx) => Promise<unknown>)(tx)
      } catch (err) {
        db.revisionCreates.length = before
        throw err
      }
    },
  }
  return { db, client }
})
const db = fake.db

vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/storage/minio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/minio')>()),
  deleteObject: vi.fn(async (_bucket: string, key: string) => {
    fake.db.deletes.push(key)
  }),
}))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/brandkit/resolve', () => ({ resolveBrandKit: async () => ({ id: 'kit', name: 'Kit' }) }))
vi.mock('@/lib/campaign/briefing', () => ({ getActiveCampaignBriefing: async () => null }))
vi.mock('@/lib/agent/briefInput', () => ({
  buildBriefInput: () => ({}),
  briefPostStyleStamp: () => null,
  imageRulesAtStamp: () => undefined,
}))
vi.mock('@/lib/agent/pathB', () => ({
  runPathBDesign: async () => ({
    htmlContent: '<html>b</html>',
    exportUrl: 'exports/this-run.png',
    backgroundImageUrl: null,
    headlineCheck: 'painted',
    composition: { requestedArchetype: 'classic', appliedArchetype: 'classic', contractVersion: null, imageQuality: 'default' },
  }),
}))
vi.mock('@/lib/api/handler', () => ({
  withTeamAuth:
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' }),
}))
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: async () => ({ action: 'REGENERATE_DESIGN', claimId: 'c1' }),
  touchGeneration: async () => {},
  startDraftAction: async (_d: string, _u: string, _t: string, _a: unknown, work: () => Promise<unknown>) => {
    await work()
  },
}))

import { POST as regenerateDesign } from '@/app/api/drafts/[id]/regenerate-design/route'
import { discardOnLostClaim, RevisionConflictError } from '@/lib/drafts/revisions'
import { DraftClaimLostError } from '@/lib/drafts/claim'

const brief = {
  id: 'b1', teamId: 'team1', userId: 'u1', campaignId: null, brandKitId: null,
  designMode: 'GENERATE', aspectRatio: 'SQUARE', copyProviderKey: null,
} as never
const req = new Request('http://test/x', { method: 'POST' }) as never
const ctx = { params: { id: 'd1' } } as never

beforeEach(() => {
  db.guardedCount = 1
  db.guardedThrows = null
  db.revisionCreates = []
  db.deletes = []
  db.draft = {
    id: 'd1', teamId: 'team1', brief, headline: 'h', htmlContent: '<html>v1</html>',
    exportUrl: 'exports/draft-live.png', currentRevisionNumber: 1,
  }
})

describe('regenerate design: a lost claim removes this run\'s export', () => {
  it('deletes the key the run uploaded, never the draft\'s own exportUrl', async () => {
    db.guardedCount = 0
    await expect(regenerateDesign(req, ctx)).rejects.toThrow(/no longer carries/)
    expect(db.deletes).toEqual(['exports/this-run.png'])
    expect(db.revisionCreates).toHaveLength(0)
  })

  it('a successful run deletes nothing', async () => {
    await regenerateDesign(req, ctx)
    expect(db.deletes).toEqual([])
  })

  it('a non-claim error deletes nothing (the commit may have landed)', async () => {
    db.guardedThrows = new Error('connection dropped')
    await expect(regenerateDesign(req, ctx)).rejects.toThrow(/connection dropped/)
    expect(db.deletes).toEqual([])
  })
})

describe('discardOnLostClaim', () => {
  it('removes the key for a lost claim and for a revision conflict', async () => {
    await discardOnLostClaim(new DraftClaimLostError(), 'exports/a.png', 'a lost claim')
    await discardOnLostClaim(new RevisionConflictError(null), 'exports/b.png', 'a revision conflict')
    expect(db.deletes).toEqual(['exports/a.png', 'exports/b.png'])
  })

  it('does nothing for another error or with no uploaded key', async () => {
    await discardOnLostClaim(new Error('boom'), 'exports/c.png', 'x')
    await discardOnLostClaim(new DraftClaimLostError(), null, 'x')
    expect(db.deletes).toEqual([])
  })
})
