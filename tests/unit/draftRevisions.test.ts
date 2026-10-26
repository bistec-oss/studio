import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

// T16 (change 004 Phase 2) — the revision-chain query helpers in
// src/lib/drafts/revisions.ts are the single filter that keeps rejected refine
// renders (revisionNumber NULL + rejectedAt set, FR-13) out of every consumer:
// the version-switch list, restore/Undo, and next-number allocation.
//
// The fake prisma below evaluates `where` for real and sorts with POSTGRES
// semantics — NULLs FIRST under ORDER BY … DESC — because that is exactly the
// hazard: an unfiltered "latest revision" query returns the rejected row. It
// throws on any where-key it doesn't understand so a helper can't silently
// drift into an unsupported (and so untested) filter.

interface Row {
  id: string
  draftId: string
  revisionNumber: number | null
  rejectedAt: Date | null
  instruction: string
  htmlSnapshot: string
  exportUrl: string | null
  createdAt: Date
  rejection?: unknown
  adoptedAt?: Date | null
  adoptedRevisionNumber?: number | null
  discardedAt?: Date | null
  // F3 (AC-04): the render stamp each row carries.
  // 009: the composition stamp (a JSON value, or Prisma.DbNull for none).
  composition?: unknown
  // 027: the post-style stamp (a JSON value, or Prisma.DbNull for none).
  postStyle?: unknown
  // 030: the rendered-text stamp (a JSON value, or Prisma.DbNull for none).
  renderedText?: unknown
  // 031: the render note (a JSON value, or Prisma.DbNull for none).
  renderNotes?: unknown
  fontSet?: string | null
  promptVersion?: string | null
  // 008 FR-08: the model whose output the row's HTML is.
  model?: string | null
  modelSubstitutedFrom?: string | null
}

const fake = vi.hoisted(() => {
  // 030: what the render mock returns as its headline check, and what it was asked to check.
  const renderState = () => ({
    calls: 0,
    fail: false,
    composites: [] as unknown[],
    failWith: null as Error | null,
    check: 'painted' as string,
    headlines: [] as Array<string | null>,
    // 031: what the render mock returns as its font check.
    fontsMissing: [] as string[],
  })
  const db = {
    rows: [] as Row[],
    draftUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    // The draft's current not-applied pointer.
    notAppliedRevisionId: null as string | null,
    // The draft's in-flight action marker — T19's adoptRejectedRevisionId
    // guard re-checks this (fix round 1, Minor 1).
    pendingAction: null as string | null,
    // 019: the token the draft's claim carries (pendingActionClaimId).
    claimId: null as string | null,
    // The draft's revision pointer — the element-edit CAS (expectedRevisionNumber,
    // change 004 T23 fix round 1) guards on it.
    currentRevisionNumber: null as number | null,
    render: renderState(),
    // 030: the draft's stored headline and its brief topic (designHeadline's inputs),
    // and the order of headline reads against renders.
    headline: 'Launch Day' as string | null,
    topic: 'Brief topic',
    events: [] as string[],
    // 025: what compositeRenderForCanvas was asked for.
    composite: { calls: [] as unknown[], fail: false },
    uploads: [] as string[],
    deletes: [] as string[],
    txOptions: [] as unknown[],
    // Every write/read the code under test issues, in order (fix round 2:
    // the lock-order assertions — every writer must insert the revision row
    // BEFORE it writes the draft row). A rolled-back transaction appends
    // 'rollback'.
    ops: [] as string[],
    // Runs at the start of draftRevision.create — lets a test simulate a
    // concurrent writer committing first (it may throw a P2002).
    onCreate: null as null | ((data: { revisionNumber: number | null }) => void),
    // Writes a CONCURRENT transaction commits while ours is open: applied
    // after our rollback, so they survive it (they were never ours).
    external: [] as Array<() => void>,
  }

  function matches(row: Row, where: Record<string, unknown>): boolean {
    for (const [key, cond] of Object.entries(where)) {
      const value = (row as unknown as Record<string, unknown>)[key]
      if (key === 'draftId' || key === 'id') {
        if (value !== cond) return false
      } else if (key === 'notAppliedOn') {
        // The single fake draft's back-reference: { some: { id, ...claim } }.
        if (row.id !== db.notAppliedRevisionId) return false
        const some = (cond as { some: Record<string, unknown> }).some
        if ('pendingAction' in some && some.pendingAction !== db.pendingAction) return false
        if ('pendingActionClaimId' in some && some.pendingActionClaimId !== db.claimId) return false
      } else if (key === 'adoptedAt' || key === 'discardedAt') {
        if (cond !== null) throw new Error(`fake prisma: unsupported condition on ${key}`)
        if (value != null) return false
      } else if (key === 'rejectedAt' || key === 'revisionNumber' || key === 'exportUrl') {
        if (cond === null) {
          if (value !== null) return false
        } else if (typeof cond === 'number') {
          if (value !== cond) return false
        } else if (
          typeof cond === 'object' &&
          cond &&
          'not' in cond &&
          (cond as { not: unknown }).not === null
        ) {
          if (value === null) return false
        } else {
          throw new Error(`fake prisma: unsupported condition on ${key}: ${JSON.stringify(cond)}`)
        }
      } else {
        throw new Error(`fake prisma: unsupported where key ${key}`)
      }
    }
    return true
  }

  // Postgres default ordering: ASC → NULLS LAST, DESC → NULLS FIRST.
  function sorted(rows: Row[], orderBy?: { revisionNumber: 'asc' | 'desc' }): Row[] {
    if (!orderBy) return rows
    const dir = orderBy.revisionNumber
    return [...rows].sort((a, b) => {
      const x = a.revisionNumber
      const y = b.revisionNumber
      if (x === null && y === null) return 0
      if (x === null) return dir === 'desc' ? -1 : 1
      if (y === null) return dir === 'desc' ? 1 : -1
      return dir === 'desc' ? y - x : x - y
    })
  }

  function project(row: Row | undefined, select?: Record<string, boolean>) {
    if (!row) return null
    if (!select) return { ...row }
    return Object.fromEntries(
      Object.keys(select).map((k) => [k, (row as unknown as Record<string, unknown>)[k]]),
    )
  }

  type Args = {
    where?: Record<string, unknown>
    orderBy?: { revisionNumber: 'asc' | 'desc' }
    select?: Record<string, boolean>
  }

  const draftRevision = {
    findFirst: async (args: Args) =>
      project(
        sorted(
          db.rows.filter((r) => matches(r, args.where ?? {})),
          args.orderBy,
        )[0],
        args.select,
      ),
    findMany: async (args: Args) =>
      sorted(
        db.rows.filter((r) => matches(r, args.where ?? {})),
        args.orderBy,
      ).map((r) => project(r, args.select)),
    updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
      db.ops.push('revision.updateMany')
      const hit = db.rows.filter((r) => matches(r, where))
      for (const r of hit) Object.assign(r, data)
      return { count: hit.length }
    },
    create: async ({
      data,
    }: {
      data: Partial<Row> & { draftId: string; revisionNumber: number | null }
    }) => {
      db.ops.push('revision.create')
      db.onCreate?.(data)
      const clash =
        data.revisionNumber !== null &&
        db.rows.some((r) => r.draftId === data.draftId && r.revisionNumber === data.revisionNumber)
      if (clash) throw new Error('unexpected unique violation in fake')
      const row: Row = {
        id: `rev-${db.rows.length + 1}`,
        rejectedAt: null,
        exportUrl: null,
        createdAt: new Date(),
        instruction: '',
        htmlSnapshot: '',
        ...data,
      }
      db.rows.push(row)
      return { id: row.id }
    },
  }

  // A commit-shaped write to the single implicit fake draft.
  function applyDraft(args: { where: unknown; data: Record<string, unknown> }) {
    db.draftUpdates.push(args)
    if ('notAppliedRevisionId' in args.data) db.notAppliedRevisionId = args.data.notAppliedRevisionId as string | null
    if ('pendingAction' in args.data) db.pendingAction = args.data.pendingAction as string | null
    if ('currentRevisionNumber' in args.data) {
      db.currentRevisionNumber = args.data.currentRevisionNumber as number | null
    }
  }

  const client = {
    draftRevision,
    draft: {
      update: async (args: { where: unknown; data: Record<string, unknown> }) => {
        db.ops.push('draft.update')
        applyDraft(args)
        return {}
      },
      // Single implicit fake draft (matches `update` above, which also
      // ignores `where.id`). The guarded final draft write of the CAS and
      // adopt paths (fix round 2): the WHERE is evaluated against the current
      // fake draft, and a match applies + records the data like `update`.
      updateMany: async (args: {
        where: {
          id?: string
          pendingAction?: string | null
          pendingActionClaimId?: string | null
          notAppliedRevisionId?: string | null
          currentRevisionNumber?: number | null
        }
        data: Record<string, unknown>
      }) => {
        db.ops.push('draft.updateMany')
        const { where } = args
        if ('pendingAction' in where && where.pendingAction !== db.pendingAction) return { count: 0 }
        if ('pendingActionClaimId' in where && where.pendingActionClaimId !== db.claimId) return { count: 0 }
        if ('notAppliedRevisionId' in where && where.notAppliedRevisionId !== db.notAppliedRevisionId) {
          return { count: 0 }
        }
        if ('currentRevisionNumber' in where && where.currentRevisionNumber !== db.currentRevisionNumber) {
          return { count: 0 }
        }
        applyDraft(args)
        return { count: 1 }
      },
      findUnique: async (args?: { select?: Record<string, unknown> }) => {
        // 030: the headline read is not a lock-order op; it is recorded apart.
        if (args?.select && 'headline' in args.select) {
          db.events.push('headline-read')
          return { headline: db.headline, brief: { topic: db.topic } }
        }
        db.ops.push('draft.findUnique')
        return {
          pendingAction: db.pendingAction,
          currentRevisionNumber: db.currentRevisionNumber,
          notAppliedRevisionId: db.notAppliedRevisionId,
          // 025: the draft's team (compositeRenderForDraft reads it).
          teamId: 'team-1',
        }
      },
    },
    // Interactive transactions ROLL BACK on a throw, like Postgres: every
    // row's fields, row membership and the draft's fields are restored (row
    // object identities are kept, so references a test holds stay valid).
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>, opts?: unknown) => {
      db.txOptions.push(opts)
      const rows = [...db.rows]
      const rowState = rows.map((r) => ({ ...r }))
      const draftState = {
        draftUpdates: [...db.draftUpdates],
        notAppliedRevisionId: db.notAppliedRevisionId,
        pendingAction: db.pendingAction,
        claimId: db.claimId,
        currentRevisionNumber: db.currentRevisionNumber,
      }
      try {
        return await fn(client)
      } catch (err) {
        rows.forEach((r, k) => {
          for (const key of Object.keys(r)) delete (r as unknown as Record<string, unknown>)[key]
          Object.assign(r, rowState[k])
        })
        db.rows = rows
        Object.assign(db, draftState)
        db.ops.push('rollback')
        const external = db.external
        db.external = []
        external.forEach((apply) => apply())
        throw err
      }
    },
  }
  return { db, client, renderState }
})
const db = fake.db
vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/renderer/puppeteer', () => ({
  renderPost: async (
    _html: string,
    _w: number,
    _h: number,
    composites: unknown,
    check: { headline: string } | null,
  ) => {
    fake.db.render.calls++
    fake.db.events.push('render')
    fake.db.render.composites.push(composites)
    fake.db.render.headlines.push(check ? check.headline : null)
    if (fake.db.render.failWith) throw fake.db.render.failWith
    if (fake.db.render.fail) throw new Error('Chromium crashed')
    return {
      png: Buffer.from('png'),
      headlineCheck: check ? fake.db.render.check : null,
      fontsMissing: fake.db.render.fontsMissing,
    }
  },
}))
vi.mock('@/lib/composite/assets', () => ({
  compositeRenderForCanvas: async (stamp: unknown, teamId: string, canvas: unknown) => {
    fake.db.composite.calls.push({ stamp, teamId, canvas })
    if (fake.db.composite.fail) {
      const { CompositeRenderError } = await import('@/lib/composite/render')
      throw new CompositeRenderError('composite-source-missing', 'gone')
    }
    return { token: '__COMPOSITE_0__', dataUri: 'data:image/png;base64,AA==', rectPx: { left: 1, top: 2, width: 3, height: 4 } }
  },
}))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_EXPORTS: 'exports',
  exportKey: (kind: string, id: string) => `exports/${kind}-${id}-test.png`,
  uploadObject: async (_b: Buffer, _bucket: string, key: string) => {
    fake.db.uploads.push(key)
  },
  deleteObject: async (_bucket: string, key: string) => {
    fake.db.deletes.push(key)
  },
  resolveExportUrl: async (key: string | null) => (key ? `https://signed.test/${key}` : null),
}))

import { prisma } from '@/lib/prisma'
import {
  COMMITTED_REVISION,
  committedRevisionWhere,
  listCommittedRevisions,
  findCommittedRevision,
  nextRevisionNumber,
  withNextRevisionNumber,
  commitDraftRevision,
  AdoptConflictError,
  DraftBusyError,
  restoreDraftToRevision,
  RevisionConflictError,
  recordRejectedRender,
  resolveNotAppliedOutcome,
  rejectionDiagnosticsSchema,
  MAX_NOT_APPLIED_REASON,
  TX_MAX_WAIT_MS,
  currentRenderStamp,
  restoredRenderStamp,
  revisionStampFields,
  draftCompositionStamp,
  draftPostStyleStamp,
  draftStampFields,
  postStyleColumn,
  modelStampOf,
  draftModelStamp,
  type RejectionDiagnostics,
} from '@/lib/drafts/revisions'
import { DraftClaimLostError, type DraftClaim } from '@/lib/drafts/claim'
import { internalModel, decideModel } from '@/lib/models/resolve'
import { DEFAULT_POLICY } from '@/lib/models/policyRules'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'

let seq = 0
function committed(
  draftId: string,
  revisionNumber: number,
  instruction = `v${revisionNumber}`,
): Row {
  return {
    id: `c-${++seq}`,
    draftId,
    revisionNumber,
    rejectedAt: null,
    instruction,
    htmlSnapshot: `<html>${instruction}</html>`,
    exportUrl: `exports/${draftId}-${revisionNumber}.png`,
    createdAt: new Date(2026, 8, 1, 0, seq),
  }
}
function rejected(draftId: string, instruction = 'make the logo bigger'): Row {
  return {
    id: `x-${++seq}`,
    draftId,
    revisionNumber: null,
    rejectedAt: new Date(),
    instruction,
    htmlSnapshot: '<html>REJECTED RENDER</html>',
    exportUrl: `exports/${draftId}-rejected.png`,
    createdAt: new Date(2026, 8, 2, 0, seq),
  }
}

beforeEach(() => {
  db.rows = []
  db.draftUpdates = []
  db.notAppliedRevisionId = null
  db.pendingAction = null
  db.claimId = null
  db.render = fake.renderState()
  db.headline = 'Launch Day'
  db.topic = 'Brief topic'
  db.events = []
  db.composite = { calls: [], fail: false }
  db.uploads = []
  db.deletes = []
  db.currentRevisionNumber = null
  db.txOptions = []
  db.ops = []
  db.onCreate = null
  db.external = []
})

describe('COMMITTED_REVISION / committedRevisionWhere', () => {
  it('states both halves of the chain invariant', () => {
    expect(COMMITTED_REVISION).toEqual({ rejectedAt: null, revisionNumber: { not: null } })
  })

  it('scopes to the draft and carries the committed filter', () => {
    expect(committedRevisionWhere('d1')).toEqual({
      draftId: 'd1',
      rejectedAt: null,
      revisionNumber: { not: null },
    })
  })
})

describe('the hazard the filter exists for', () => {
  it('an UNFILTERED newest-first query returns the rejected row under Postgres ordering', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2), rejected('d1')]
    const latest = await prisma.draftRevision.findFirst({
      where: { draftId: 'd1' },
      orderBy: { revisionNumber: 'desc' },
    })
    // Without the helper, "latest" is the rejected render and next = null+1.
    expect(latest?.revisionNumber).toBeNull()
  })
})

describe('nextRevisionNumber', () => {
  it('counts committed rows only — a rejected row consumes no number', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2), rejected('d1'), rejected('d1')]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(3)
  })

  it('is 1 for a draft whose only rows are rejected', async () => {
    db.rows = [rejected('d1')]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(1)
  })

  it('ignores other drafts', async () => {
    db.rows = [committed('d1', 1), committed('d2', 7)]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(2)
  })

  it('excludes a row carrying rejectedAt even if it somehow has a number', async () => {
    // Impossible under the CHECK constraint; the filter still holds on its own.
    db.rows = [committed('d1', 1), { ...rejected('d1'), revisionNumber: 9 }]
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(2)
  })
})

describe('withNextRevisionNumber', () => {
  it('hands the body the next COMMITTED number (contiguous chain)', async () => {
    db.rows = [committed('d1', 1), rejected('d1'), committed('d1', 2), rejected('d1')]
    const got = await withNextRevisionNumber('d1', async (_tx, n) => n)
    expect(got).toBe(3)
  })
})

describe('listCommittedRevisions (version-switch list)', () => {
  it('lists committed rows newest first and never the rejected render', async () => {
    const r = rejected('d1')
    db.rows = [committed('d1', 1), r, committed('d1', 2), committed('d2', 1)]
    const list = await listCommittedRevisions('d1')
    expect(list.map((x) => x.revisionNumber)).toEqual([2, 1])
    expect(list.some((x) => x.id === r.id)).toBe(false)
    expect(list.every((x) => typeof x.revisionNumber === 'number')).toBe(true)
  })

  it('selects only the listing fields (no htmlSnapshot) — 008 FR-16 adds the model, FR-20 its substitution', async () => {
    db.rows = [{ ...committed('d1', 1), model: 'claude-sonnet-5-5', modelSubstitutedFrom: 'OPUS' }]
    const [row] = await listCommittedRevisions('d1')
    expect(Object.keys(row).sort()).toEqual([
      'createdAt',
      'exportUrl',
      'id',
      'instruction',
      'model',
      'modelSubstitutedFrom',
      'revisionNumber',
    ])
    expect(row.model).toBe('claude-sonnet-5-5')
    // The Versions sheet's "(substituted)" title (008 FR-20).
    expect(row.modelSubstitutedFrom).toBe('OPUS')
  })
})

describe('findCommittedRevision (restore / Undo target)', () => {
  it('returns the committed row with that number', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    const row = await findCommittedRevision('d1', 2)
    expect(row?.instruction).toBe('v2')
  })

  it('never resolves to a rejected render — not at the would-be next number, not ever', async () => {
    db.rows = [committed('d1', 1), rejected('d1')]
    expect(await findCommittedRevision('d1', 2)).toBeNull()
    const corrupt = { ...rejected('d1'), revisionNumber: 5 }
    db.rows.push(corrupt)
    expect(await findCommittedRevision('d1', 5)).toBeNull()
  })

  it('does not cross drafts', async () => {
    db.rows = [committed('d2', 1)]
    expect(await findCommittedRevision('d1', 1)).toBeNull()
  })
})

describe('commitDraftRevision (refine + inline-edit writer)', () => {
  it('writes a committed row at the next committed number and points the draft at it', async () => {
    db.rows = [committed('d1', 1), rejected('d1')]
    const { exportKey } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1',
      instruction: 'darker background',
      html: '<html>new</html>',
      width: 1080,
      height: 1080,
      exportKey: 'exports/new.png',
    })
    expect(exportKey).toBe('exports/new.png')
    const written = db.rows.find((r) => r.instruction === 'darker background')
    expect(written).toMatchObject({ revisionNumber: 2, rejectedAt: null })
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].data.currentRevisionNumber).toBe(2)
    expect(db.draftUpdates[0].data.htmlContent).toBe('<html>new</html>')
  })

  it('returns the new revision number (the pointer the draft now carries)', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    const out = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
    })
    expect(out.revisionNumber).toBe(3)
  })
})

// Change 004 T23 fix round 1 (amended Ruling W5-B): the element-edit
// compare-and-swap. The route checks the client's baseRevisionNumber first;
// this is the in-transaction half that closes the render window between that
// check and the write (review Important 1, lost update).
describe('commitDraftRevision expectedRevisionNumber (element-edit CAS)', () => {
  const args = (over: Partial<Parameters<typeof commitDraftRevision>[0]> = {}) => ({
    draftId: 'd1',
    instruction: 'Element edit: text',
    html: '<html>edited</html>',
    width: 1080,
    height: 1080,
    composition: null, postStyle: null,
    ...over,
  })

  it('commits when the draft still points at the expected revision', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    db.currentRevisionNumber = 2
    const out = await commitDraftRevision(args({ expectedRevisionNumber: 2 }))
    expect(out.revisionNumber).toBe(3)
    expect(db.currentRevisionNumber).toBe(3)
    expect(db.rows.filter((r) => r.revisionNumber !== null)).toHaveLength(3)
  })

  it('a moved pointer aborts WITHOUT writing: no revision row, no draft update, typed error', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2), committed('d1', 3)]
    db.currentRevisionNumber = 3 // another edit committed after the caller read 2
    await expect(commitDraftRevision(args({ expectedRevisionNumber: 2 }))).rejects.toBeInstanceOf(
      RevisionConflictError,
    )
    expect(db.rows).toHaveLength(3)
    expect(db.draftUpdates).toEqual([])
    expect(db.currentRevisionNumber).toBe(3)
  })

  it('on a CAS miss the export it rendered + uploaded itself is removed (no orphan)', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    await expect(commitDraftRevision(args({ expectedRevisionNumber: 0 }))).rejects.toBeInstanceOf(
      RevisionConflictError,
    )
    expect(db.uploads).toHaveLength(1)
    expect(db.deletes).toEqual(db.uploads)
  })

  it('on a CAS miss a CALLER-supplied export key is never deleted (not ours to remove)', async () => {
    db.currentRevisionNumber = 5
    await expect(
      commitDraftRevision(args({ expectedRevisionNumber: 4, exportKey: 'exports/caller.png' })),
    ).rejects.toBeInstanceOf(RevisionConflictError)
    expect(db.deletes).toEqual([])
  })

  it('a failed cleanup does not mask the conflict', async () => {
    db.currentRevisionNumber = 2
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = db.deletes.push
    db.deletes.push = () => {
      throw new Error('minio down')
    }
    try {
      await expect(commitDraftRevision(args({ expectedRevisionNumber: 1 }))).rejects.toBeInstanceOf(
        RevisionConflictError,
      )
      expect(errors).toHaveBeenCalled()
    } finally {
      db.deletes.push = original
      errors.mockRestore()
    }
  })

  it('null matches a legacy draft that has no revision pointer yet', async () => {
    db.rows = []
    db.currentRevisionNumber = null
    const out = await commitDraftRevision(args({ expectedRevisionNumber: null }))
    expect(out.revisionNumber).toBe(1)
  })

  it('null does NOT match a draft that has a pointer', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    await expect(commitDraftRevision(args({ expectedRevisionNumber: null }))).rejects.toBeInstanceOf(
      RevisionConflictError,
    )
  })

  it('omitted → unchanged behaviour: commits whatever the pointer is (whole-document mode, refine, adopt)', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    db.currentRevisionNumber = 1 // e.g. after a restore
    const out = await commitDraftRevision(args())
    expect(out.revisionNumber).toBe(3)
    expect(db.deletes).toEqual([])
  })
})

// Fix round 2 (review of 88b6b35b, Important): lock order. Every writer must
// take the revision-number unique-index slot (the insert) BEFORE the draft
// row lock (the draft write); a guard that locked the draft row first could
// deadlock (40P01 → 500) against a concurrent non-CAS commit or
// regenerate-design, which insert first. So the CAS and the adopt guard are
// the FINAL draft write, not a leading touch.
describe('commitDraftRevision lock order: the revision insert precedes every draft-row write', () => {
  const draftWrites = (ops: string[]) => ops.filter((o) => o.startsWith('draft.update'))
  const beforeCreate = (ops: string[]) => ops.slice(0, ops.indexOf('revision.create'))

  it('CAS path: insert first, then ONE guarded draft write (the CAS), nothing on the draft before', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'Element edit: text', html: '<html/>', width: 1080, height: 1080,
      exportKey: 'k', expectedRevisionNumber: 1,
    })
    expect(draftWrites(beforeCreate(db.ops))).toEqual([])
    expect(draftWrites(db.ops)).toEqual(['draft.updateMany'])
    expect(db.ops.indexOf('draft.updateMany')).toBeGreaterThan(db.ops.indexOf('revision.create'))
    // The CAS write IS the commit write: it carries the new pointer + document.
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].where).toMatchObject({ currentRevisionNumber: 1, pendingAction: null })
    expect(db.draftUpdates[0].data).toMatchObject({ currentRevisionNumber: 2, htmlContent: '<html/>' })
  })

  it('adopt path: insert, then the rejected-row stamp, then ONE guarded draft write', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId: rejectedId, exportKey } = await recordHeld(rejectArgs())
    db.ops = []
    db.draftUpdates = []
    await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'Use anyway: reduce the text', html: '<html/>', width: 1080, height: 1080,
      exportKey: exportKey!, adoptRejectedRevisionId: rejectedId,
    })
    expect(draftWrites(beforeCreate(db.ops))).toEqual([])
    expect(draftWrites(db.ops)).toEqual(['draft.updateMany'])
    const create = db.ops.indexOf('revision.create')
    const stamp = db.ops.indexOf('revision.updateMany') // the adopt stamp (before discard's)
    expect(stamp).toBeGreaterThan(create)
    expect(db.ops.indexOf('draft.updateMany')).toBeGreaterThan(db.ops.lastIndexOf('revision.updateMany'))
    // Exact guard semantics kept: single-flight + still the live outcome.
    expect(db.draftUpdates[0].where).toMatchObject({ pendingAction: null, notAppliedRevisionId: rejectedId })
    expect(db.draftUpdates[0].data).toMatchObject({ notAppliedRevisionId: null, currentRevisionNumber: 2 })
  })

  it('non-CAS path is unchanged: insert, then a plain draft.update (no guard)', async () => {
    db.rows = [committed('d1', 1)]
    await commitDraftRevision({ composition: null, postStyle: null, draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(draftWrites(db.ops)).toEqual(['draft.update'])
    expect(db.ops.indexOf('draft.update')).toBeGreaterThan(db.ops.indexOf('revision.create'))
  })

  it('a CAS miss rolls back the insert it already made', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    db.currentRevisionNumber = 2
    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1', instruction: 'Element edit: color', html: '<html/>', width: 1080, height: 1080,
        exportKey: 'k', expectedRevisionNumber: 1,
      }),
    ).rejects.toBeInstanceOf(RevisionConflictError)
    expect(db.ops).toContain('revision.create')
    expect(db.ops.at(-1)).toBe('rollback')
    expect(db.rows.map((r) => r.revisionNumber)).toEqual([1, 2])
    expect(db.currentRevisionNumber).toBe(2)
  })

  it('a concurrent insert of the same number surfaces as P2002; the retry re-reads and then misses the CAS', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    let first = true
    db.onCreate = ({ revisionNumber }) => {
      if (!first) return
      first = false
      // Another writer committed #2 while we were computing ours: our
      // insert collides with it (P2002) and our attempt rolls back.
      db.external.push(() => {
        db.rows.push(committed('d1', revisionNumber!, 'other writer'))
        db.currentRevisionNumber = revisionNumber
      })
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' })
    }
    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1', instruction: 'Element edit: text', html: '<html/>', width: 1080, height: 1080,
        exportKey: 'k', expectedRevisionNumber: 1,
      }),
    ).rejects.toBeInstanceOf(RevisionConflictError)
    expect(db.ops.filter((o) => o === 'revision.create')).toHaveLength(2) // it retried, at #3
    expect(db.rows.map((r) => r.instruction)).toEqual(['v1', 'other writer'])
    expect(db.currentRevisionNumber).toBe(2)
  })
})

// Fix round 2, Minor 3: the element CAS is also single-flight — it can't
// commit while a refine/regenerate claimed the draft during its render (the
// same pendingAction IS NULL condition adopt's guard has). A miss says which.
describe('commitDraftRevision CAS single-flight (pendingAction)', () => {
  const casArgs = (expectedRevisionNumber: number) => ({
    draftId: 'd1', instruction: 'Element edit: text', html: '<html/>', width: 1080, height: 1080,
    exportKey: 'k', expectedRevisionNumber, composition: null, postStyle: null,
  })

  it('a claimed pendingAction refuses the commit, writes nothing, and reports the action', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    db.pendingAction = 'REFINE'
    const err = await commitDraftRevision(casArgs(1)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RevisionConflictError)
    expect((err as InstanceType<typeof RevisionConflictError>).pendingAction).toBe('REFINE')
    expect(db.rows).toHaveLength(1)
    expect(db.currentRevisionNumber).toBe(1)
    expect(db.draftUpdates).toEqual([])
  })

  it('a moved pointer with no action running reports pendingAction null (stale)', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    db.currentRevisionNumber = 2
    const err = await commitDraftRevision(casArgs(1)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RevisionConflictError)
    expect((err as InstanceType<typeof RevisionConflictError>).pendingAction).toBeNull()
  })

  it('the non-CAS path still commits while an action is claimed (refine commits under its own claim)', async () => {
    db.rows = [committed('d1', 1)]
    db.pendingAction = 'REFINE'
    const out = await commitDraftRevision({ composition: null, postStyle: null, draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(out.revisionNumber).toBe(2)
  })
})

// ── T17: the not-applied outcome and its rejected render ─────────────────────

function diagnostics(over: Partial<Omit<RejectionDiagnostics, 'export'>> = {}): Omit<RejectionDiagnostics, 'export'> {
  const attempt = (n: 1 | 2) => ({
    attempt: n,
    document: 'complete' as const,
    classes: ['remove' as const],
    classificationDefaulted: false,
    effectiveClasses: ['remove' as const],
    downgraded: [],
    supersedes: ['Join us for'],
    constrains: [],
    reconcile: { kind: 'clean' as const, missing: [] },
    verdict: 'miss' as const,
    reasons: ['remove: "Join us for" was neither removed nor shortened'],
    verifierCalls: 0,
  })
  return {
    version: 1,
    refineCalls: 2,
    verifierCalls: 0,
    attempts: [attempt(1), attempt(2)],
    reasons: ['remove: "Join us for" was neither removed nor shortened'],
    ...over,
  }
}

// 019: the claim a refine run holds while it records a rejected render.
const CLAIM: DraftClaim = { action: 'REFINE', claimId: 'claim-1' }

const rejectArgs = (over: Partial<Parameters<typeof recordRejectedRender>[0]> = {}) => ({
  claim: CLAIM,
  draftId: 'd1',
  instruction: 'reduce the text',
  html: '<!DOCTYPE html><html><body>still long</body></html>',
  width: 1080,
  height: 1350,
  reason: 'The edit could not be applied: remove missed.',
  diagnostics: diagnostics(),
  composition: null, postStyle: null,
  ...over,
})

// recordRejectedRender while the draft holds CLAIM (the refine's own claim),
// then back to the state the test had: the guarded final write needs the claim,
// and the adopt / CAS tests that follow need the draft unclaimed.
async function recordHeld(args: Parameters<typeof recordRejectedRender>[0]) {
  const before = { action: db.pendingAction, claimId: db.claimId }
  db.pendingAction = CLAIM.action
  db.claimId = CLAIM.claimId
  try {
    return await recordRejectedRender(args)
  } finally {
    db.pendingAction = before.action
    db.claimId = before.claimId
  }
}

describe('recordRejectedRender (FR-12/13, Ruling D/E)', () => {
  it('writes ONE unnumbered rejected row with the render, diagnostics and export; the chain and pointer are untouched', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    const { revisionId, exportKey } = await recordHeld(rejectArgs())
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row).toMatchObject({
      revisionNumber: null,
      instruction: 'reduce the text',
      htmlSnapshot: '<!DOCTYPE html><html><body>still long</body></html>',
      exportUrl: exportKey,
    })
    expect(row.rejectedAt).toBeInstanceOf(Date)
    expect(exportKey).toBe('exports/refine-d1-test.png')
    expect(db.uploads).toEqual([exportKey])
    // Retrievable with its instruction, classes and the verifier's miss (AC-17).
    const rejection = rejectionDiagnosticsSchema.parse(row.rejection)
    expect(rejection.attempts[1].classes).toEqual(['remove'])
    expect(rejection.reasons[0]).toMatch(/neither removed nor shortened/)
    expect(rejection.export).toBe('stored')
    // The draft carries the outcome; nothing about the chain moved (AC-16).
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].data).toEqual({ notAppliedReason: 'The edit could not be applied: remove missed.', notAppliedRevisionId: revisionId })
    expect(db.rows.filter((r) => r.revisionNumber !== null)).toHaveLength(2)
    expect(await nextRevisionNumber(prisma, 'd1')).toBe(3)
  })

  it('with no usable document: records the row for diagnosis, no render, no export', async () => {
    const { revisionId, exportKey } = await recordHeld(
      rejectArgs({ html: null, unusableHtml: '<!DOCTYPE html><html><body>cut off' }),
    )
    expect(exportKey).toBeNull()
    expect(db.render.calls).toBe(0)
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row.exportUrl).toBeNull()
    expect(row.htmlSnapshot).toBe('<!DOCTYPE html><html><body>cut off')
    expect(rejectionDiagnosticsSchema.parse(row.rejection).export).toBe('none')
  })

  it('a render failure does not mask the outcome: the row is recorded without an export', async () => {
    db.render.fail = true
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { revisionId, exportKey } = await recordHeld(rejectArgs())
    expect(exportKey).toBeNull()
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(rejectionDiagnosticsSchema.parse(row.rejection).export).toBe('render-failed')
    expect(db.notAppliedRevisionId).toBe(revisionId)
  })

  it('REPLACING an outcome stamps the previous rejected row discarded', async () => {
    const first = await recordHeld(rejectArgs())
    const second = await recordHeld(rejectArgs({ instruction: 'reduce it again' }))
    expect(db.rows.find((r) => r.id === first.revisionId)!.discardedAt).toBeInstanceOf(Date)
    expect(db.rows.find((r) => r.id === second.revisionId)!.discardedAt ?? null).toBeNull()
    expect(db.notAppliedRevisionId).toBe(second.revisionId)
  })

  it('caps the human-readable reason', async () => {
    await recordHeld(rejectArgs({ reason: 'x'.repeat(5000) }))
    expect((db.draftUpdates[0].data.notAppliedReason as string).length).toBe(MAX_NOT_APPLIED_REASON)
  })

  it('refuses diagnostics beyond the hard caps (AC-15 is part of the schema)', async () => {
    await expect(recordHeld(rejectArgs({ diagnostics: diagnostics({ refineCalls: 3 }) }))).rejects.toThrow()
    await expect(recordHeld(rejectArgs({ diagnostics: diagnostics({ verifierCalls: 3 }) }))).rejects.toThrow()
  })

  // Fix round 1, Minor 2: validation happens BEFORE the render/upload, so an
  // invalid record never orphans an export object.
  it('validates the diagnostics before rendering or uploading anything', async () => {
    const bad = diagnostics({ attempts: [{ ...diagnostics().attempts[0], verifierCalls: 2 }] })
    await expect(recordHeld(rejectArgs({ diagnostics: bad }))).rejects.toThrow()
    expect(db.render.calls).toBe(0)
    expect(db.uploads).toEqual([])
    expect(db.rows).toEqual([])
  })
})

// Fix round 1, I1: an interactive transaction may wait up to TX_MAX_WAIT_MS
// for a pool connection (Prisma's 2 s default is shorter than one new
// connection takes on the test host — P2028 after the 202 in TC-REG-H7a).
describe('interactive transactions wait long enough for a pool connection', () => {
  it('commitDraftRevision and recordRejectedRender both pass maxWait = TX_MAX_WAIT_MS (10 s)', async () => {
    expect(TX_MAX_WAIT_MS).toBeGreaterThanOrEqual(10_000)
    await commitDraftRevision({ composition: null, postStyle: null, draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    await recordHeld(rejectArgs())
    expect(db.txOptions).toEqual([{ maxWait: TX_MAX_WAIT_MS }, { maxWait: TX_MAX_WAIT_MS }])
  })
})

describe('commitDraftRevision clears the not-applied outcome', () => {
  it('nulls notApplied* and stamps the referenced rejected row discarded', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId: rejectedId } = await recordHeld(rejectArgs())
    db.draftUpdates = []
    await commitDraftRevision({ composition: null, postStyle: null, draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(db.draftUpdates[0].data).toMatchObject({ notAppliedReason: null, notAppliedRevisionId: null, currentRevisionNumber: 2 })
    expect(db.rows.find((r) => r.id === rejectedId)!.discardedAt).toBeInstanceOf(Date)
  })

  it('never stamps an adopted rejected row', async () => {
    const { revisionId: rejectedId } = await recordHeld(rejectArgs())
    const row = db.rows.find((r) => r.id === rejectedId)!
    row.adoptedAt = new Date()
    await commitDraftRevision({ composition: null, postStyle: null, draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(row.discardedAt ?? null).toBeNull()
  })
})

// ── T19: adoptRejectedRevisionId ("Use anyway") ─────────────────────────────

describe('commitDraftRevision adoptRejectedRevisionId (T19 "Use anyway")', () => {
  it('adopts the rejected row: stamps adoptedAt/adoptedRevisionNumber, creates exactly one chain row with its snapshot+export, clears notApplied', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId: rejectedId, exportKey: rejectedExport } = await recordHeld(
      rejectArgs({ instruction: 'make the logo bigger' }),
    )
    db.draftUpdates = []
    db.render.calls = 0

    const before = db.rows.length
    const { revisionId, exportKey } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1',
      instruction: 'Use anyway: make the logo bigger',
      html: db.rows.find((r) => r.id === rejectedId)!.htmlSnapshot,
      width: 1080,
      height: 1080,
      exportKey: rejectedExport!,
      adoptRejectedRevisionId: rejectedId,
    })

    // Exactly one NEW chain row — the rejected row itself is never pointed at.
    expect(db.rows.length).toBe(before + 1)
    const created = db.rows.find((r) => r.id === revisionId)!
    expect(created).toMatchObject({
      revisionNumber: 2,
      rejectedAt: null,
      htmlSnapshot: '<!DOCTYPE html><html><body>still long</body></html>',
      exportUrl: rejectedExport,
    })
    expect(exportKey).toBe(rejectedExport)
    // The T17 ordering hazard: discardNotAppliedRender runs in this same
    // commit and skips rows with adoptedAt set — proof it ran AFTER the
    // guard stamp is that the adopted row carries adoptedAt but NOT
    // discardedAt (the reverse order would have discarded it instead).
    const rejectedRow = db.rows.find((r) => r.id === rejectedId)!
    expect(rejectedRow.adoptedAt).toBeInstanceOf(Date)
    expect(rejectedRow.adoptedRevisionNumber).toBe(2)
    expect(rejectedRow.discardedAt ?? null).toBeNull()
    // No render happened — the precomputed export key was reused as-is.
    expect(db.render.calls).toBe(0)
    // The draft's not-applied outcome is cleared and the pointer advanced.
    expect(db.draftUpdates[0].data).toMatchObject({
      notAppliedReason: null,
      notAppliedRevisionId: null,
      currentRevisionNumber: 2,
    })
  })

  it('a row superseded by a NEWER not-applied outcome (already discarded) is refused, and the live row is left untouched', async () => {
    // Simulates: the draft's CURRENT not-applied outcome now points at a
    // DIFFERENT (newer) rejected row than the one being adopted — e.g. a
    // race where a later refine already replaced the outcome before this
    // adopt reached the transaction. The fresh re-read of
    // Draft.notAppliedRevisionId inside the transaction must see that
    // mismatch and refuse, never touching the newer (live) row.
    const first = await recordHeld(rejectArgs({ instruction: 'first' }))
    const second = await recordHeld(rejectArgs({ instruction: 'second' }))
    // `second` is now the live outcome; `first` was already discarded by the
    // replace. Adopting the (already-discarded) `first` row must 409, and
    // the live `second` row must be untouched.
    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1',
        instruction: 'Use anyway: first',
        html: '<html/>',
        width: 1080,
        height: 1080,
        exportKey: 'exports/whatever.png',
        adoptRejectedRevisionId: first.revisionId,
      }),
    ).rejects.toThrow(AdoptConflictError)
    expect(db.rows.find((r) => r.id === second.revisionId)!.adoptedAt ?? null).toBeNull()
    expect(db.rows.find((r) => r.id === second.revisionId)!.discardedAt ?? null).toBeNull()
  })

  it('a second adopt of the same row is refused (single-flight) and creates no second chain row', async () => {
    const { revisionId: rejectedId, exportKey: rejectedExport } = await recordHeld(rejectArgs())
    const rowsBeforeFirstAdopt = db.rows.length

    await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1',
      instruction: 'Use anyway: reduce the text',
      html: '<html>REJECTED RENDER</html>',
      width: 1080,
      height: 1080,
      exportKey: rejectedExport!,
      adoptRejectedRevisionId: rejectedId,
    })
    const rowsAfterFirstAdopt = db.rows.length
    expect(rowsAfterFirstAdopt).toBe(rowsBeforeFirstAdopt + 1)

    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1',
        instruction: 'Use anyway: reduce the text',
        html: '<html>REJECTED RENDER</html>',
        width: 1080,
        height: 1080,
        exportKey: rejectedExport!,
        adoptRejectedRevisionId: rejectedId,
      }),
    ).rejects.toThrow(AdoptConflictError)
    // No second chain row was created by the refused second adopt.
    expect(db.rows.length).toBe(rowsAfterFirstAdopt)
  })

  it('a row without an export is refused (Ruling D)', async () => {
    const { revisionId } = await recordHeld(
      rejectArgs({ html: null, unusableHtml: '<!DOCTYPE html><html><body>cut off' }),
    )
    expect(db.rows.find((r) => r.id === revisionId)!.exportUrl).toBeNull()

    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1',
        instruction: 'Use anyway: reduce the text',
        html: '<html>whatever</html>',
        width: 1080,
        height: 1080,
        exportKey: 'exports/would-be-fabricated.png',
        adoptRejectedRevisionId: revisionId,
      }),
    ).rejects.toThrow(AdoptConflictError)
    expect(db.rows.find((r) => r.id === revisionId)!.adoptedAt ?? null).toBeNull()
  })

  it('a mismatched notAppliedRevisionId (row is not the draft\'s live outcome) is refused', async () => {
    db.rows = [committed('d1', 1)]
    const stray = rejected('d1', 'some other refine')
    db.rows.push(stray)
    // db.notAppliedRevisionId is null — no live outcome at all.
    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1',
        instruction: 'Use anyway: some other refine',
        html: stray.htmlSnapshot,
        width: 1080,
        height: 1080,
        exportKey: stray.exportUrl!,
        adoptRejectedRevisionId: stray.id,
      }),
    ).rejects.toThrow(AdoptConflictError)
    expect(db.rows.find((r) => r.id === stray.id)!.adoptedAt ?? null).toBeNull()
  })

  // Fix round 1, Minor 1 (FR-14a: adopt is single-flight "like every other
  // draft action" — a concurrent action 409s). A refine/regenerate that
  // claimed Draft.pendingAction after the route's own pre-check must still
  // make the in-transaction guard refuse — proof the guard re-checks
  // pendingAction itself, not just the not-applied pointer.
  it('a draft with a pendingAction already claimed (a refine/regenerate in flight) refuses the adopt, touching nothing', async () => {
    const { revisionId: rejectedId, exportKey: rejectedExport } = await recordHeld(rejectArgs())
    db.pendingAction = 'REFINE'

    await expect(
      commitDraftRevision({
        composition: null, postStyle: null,
        draftId: 'd1',
        instruction: 'Use anyway: reduce the text',
        html: '<html>REJECTED RENDER</html>',
        width: 1080,
        height: 1080,
        exportKey: rejectedExport!,
        adoptRejectedRevisionId: rejectedId,
      }),
    ).rejects.toThrow(AdoptConflictError)
    // The guarded final draft write refused it, so the transaction rolled
    // back: the rejected row's stamp and the chain insert made before it are
    // gone (fix round 2 — the draft row is locked last).
    expect(db.rows.find((r) => r.id === rejectedId)!.adoptedAt ?? null).toBeNull()
    expect(db.rows.some((r) => r.revisionNumber === 2)).toBe(false)
  })
})

// ── T18: resolveNotAppliedOutcome — the draft poll's `notApplied` field ─────

describe('resolveNotAppliedOutcome (T18, Ruling E)', () => {
  it('is null when the draft carries no not-applied outcome at all', async () => {
    expect(
      await resolveNotAppliedOutcome({ id: 'd1', notAppliedReason: null, notAppliedRevisionId: null }),
    ).toBeNull()
  })

  it('is null when notAppliedRevisionId is set but notAppliedReason is not (defensive — should never both-diverge)', async () => {
    db.rows = [rejected('d1')]
    expect(
      await resolveNotAppliedOutcome({ id: 'd1', notAppliedReason: null, notAppliedRevisionId: db.rows[0].id }),
    ).toBeNull()
  })

  it('reflects the live rejected row: reason from the draft, instruction/preview/time from the row', async () => {
    const row = rejected('d1', 'make the logo bigger')
    db.rows = [row]
    const outcome = await resolveNotAppliedOutcome({
      id: 'd1',
      notAppliedReason: 'The edit could not be applied — it failed the check on both attempts.',
      notAppliedRevisionId: row.id,
    })
    expect(outcome).toEqual({
      reason: 'The edit could not be applied — it failed the check on both attempts.',
      instruction: 'make the logo bigger',
      revisionId: row.id,
      previewUrl: `https://signed.test/${row.exportUrl}`,
      rejectedAt: row.rejectedAt!.toISOString(),
    })
  })

  it('previewUrl is null when the rejected row has no export (e.g. a truncated reply)', async () => {
    const row = rejected('d1')
    row.exportUrl = null
    db.rows = [row]
    const outcome = await resolveNotAppliedOutcome({
      id: 'd1',
      notAppliedReason: 'reason',
      notAppliedRevisionId: row.id,
    })
    expect(outcome?.previewUrl).toBeNull()
  })

  it('never trusts the FK alone: a discarded row (replaced by a later not-applied refine) resolves to null', async () => {
    const row = rejected('d1')
    row.discardedAt = new Date()
    db.rows = [row]
    expect(
      await resolveNotAppliedOutcome({ id: 'd1', notAppliedReason: 'reason', notAppliedRevisionId: row.id }),
    ).toBeNull()
  })

  it('never trusts the FK alone: a row belonging to a DIFFERENT draft resolves to null', async () => {
    const row = rejected('d2')
    db.rows = [row]
    expect(
      await resolveNotAppliedOutcome({ id: 'd1', notAppliedReason: 'reason', notAppliedRevisionId: row.id }),
    ).toBeNull()
  })

  it('never trusts the FK alone: a stale id that matches no row at all resolves to null', async () => {
    db.rows = []
    expect(
      await resolveNotAppliedOutcome({ id: 'd1', notAppliedReason: 'reason', notAppliedRevisionId: 'ghost' }),
    ).toBeNull()
  })

  it('never leaks htmlSnapshot or the rejection JSON', async () => {
    const row = rejected('d1')
    db.rows = [row]
    const outcome = await resolveNotAppliedOutcome({
      id: 'd1',
      notAppliedReason: 'reason',
      notAppliedRevisionId: row.id,
    })
    expect(Object.keys(outcome ?? {}).sort()).toEqual([
      'instruction',
      'previewUrl',
      'reason',
      'rejectedAt',
      'revisionId',
    ])
  })
})

// ── F2 (change 004 final fix wave): restore's draft write is guarded ────────
// The restore route pre-checks pendingAction, but a refine/regenerate can claim
// the draft between that read and the write. The guard is folded into the
// final draft write (like adopt's), so a late claim is a 409 that writes nothing.

const STAMP_V2 = {
  promptVersion: 'pv-v2',
  fontSet: 'fonts-v2',
  model: 'claude-sonnet-4-6',
  modelSubstitutedFrom: null,
  composition: null, postStyle: null, renderedText: null, renderNotes: null,
}

describe('restoreDraftToRevision (F2 — restore guard)', () => {
  it('moves the pointer and clears the not-applied outcome when no action is claimed', async () => {
    db.currentRevisionNumber = 3
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', STAMP_V2)
    expect(db.currentRevisionNumber).toBe(2)
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({
      htmlContent: '<html>v2</html>',
      exportUrl: 'exports/d1-2.png',
      currentRevisionNumber: 2,
    })
    // Lock order: the rejected-row stamp first, the draft row last.
    expect(db.ops).toEqual(['revision.updateMany', 'draft.updateMany'])
    // Interactive, so it must wait on the pool like every other one here —
    // Prisma's 2000 ms default throws P2028 when a new connection is opening.
    expect(db.txOptions).toEqual([{ maxWait: TX_MAX_WAIT_MS }])
  })

  it('a claimed action refuses the restore, writes nothing and rolls back', async () => {
    db.currentRevisionNumber = 3
    db.pendingAction = 'REFINE'
    await expect(
      restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', STAMP_V2),
    ).rejects.toThrow(DraftBusyError)
    expect(db.currentRevisionNumber).toBe(3)
    expect(db.draftUpdates).toEqual([])
    expect(db.ops.at(-1)).toBe('rollback')
  })
})

// ── F3 (change 004 final fix wave, AC-04): per-revision render stamps ───────
// "A draft record carries the font-set identifier used for its render,
// readable alongside promptVersion." Every DraftRevision row records the
// prompt version that produced its HTML and the font set that rasterized its
// PNG, so restore and adopt can carry the stamp of the render they reinstate
// instead of leaving (restore) or writing (adopt) the CURRENT values. The
// fontSet mock above resolves to 'fonts-test'; PROMPT_VERSION is the real one.

describe('F3 render stamps: every revision write records the render it holds', () => {
  it('currentRenderStamp is the prompt version + the installed font set (+ the 008 model, null when unknown)', () => {
    expect(currentRenderStamp(null, null, null, null, null)).toEqual({
      promptVersion: PROMPT_VERSION,
      fontSet: 'fonts-test',
      model: null,
      modelSubstitutedFrom: null,
      composition: null, postStyle: null, renderedText: null, renderNotes: null,
    })
  })

  it('commitDraftRevision stamps BOTH the new revision row and the draft (caller-supplied export)', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'darker', html: '<html>n</html>', width: 1080, height: 1080, exportKey: 'exports/n.png',
    })
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row.fontSet).toBe('fonts-test')
    expect(row.promptVersion).toBe(PROMPT_VERSION)
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
  })

  it('commitDraftRevision stamps both when it renders the export itself', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'inline edit', html: '<html>e</html>', width: 1080, height: 1080,
    })
    expect(db.render.calls).toBe(1)
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
  })

  it('commitDraftRevision CAS path stamps both too', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'el', html: '<html>c</html>', width: 1080, height: 1080, exportKey: 'k', expectedRevisionNumber: 1,
    })
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
  })

  it('recordRejectedRender stamps the rejected row with the values of ITS OWN render, and leaves the draft stamp alone', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await recordHeld(rejectArgs())
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
    // The draft's current render did not change, so neither does its stamp.
    const data = db.draftUpdates.at(-1)!.data
    expect('fontSet' in data).toBe(false)
    expect('promptVersion' in data).toBe(false)
  })

  it('a rejected row with no usable document still carries the stamp of the attempt', async () => {
    const { revisionId } = await recordHeld(rejectArgs({ html: null, unusableHtml: '<html>cut' }))
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
  })
})

describe("F3 restore: the draft takes the restored revision's stamp", () => {
  it('restoreDraftToRevision writes the given stamp onto the draft (008: the model as designModel)', async () => {
    db.currentRevisionNumber = 3
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', STAMP_V2)
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({
      promptVersion: 'pv-v2',
      fontSet: 'fonts-v2',
      designModel: 'claude-sonnet-4-6',
      designModelSubstitutedFrom: null,
    })
    expect(db.draftUpdates.at(-1)!.data).not.toHaveProperty('model')
  })

  it('a legacy (pre-F3) revision nulls the draft stamp: unknown is honest, a stale value is not', async () => {
    db.currentRevisionNumber = 3
    await restoreDraftToRevision(
      'd1', 2, '<html>v2</html>', 'exports/d1-2.png',
      restoredRenderStamp({ promptVersion: null, fontSet: null }, false, null),
    )
    const data = db.draftUpdates.at(-1)!.data
    expect(data).toHaveProperty('promptVersion', null)
    expect(data).toHaveProperty('fontSet', null)
  })

  it("restoredRenderStamp copies the revision's own values when its stored PNG is reused", () => {
    expect(restoredRenderStamp({ promptVersion: 'pv-old', fontSet: 'fonts-old' }, false, null)).toEqual({
      promptVersion: 'pv-old',
      fontSet: 'fonts-old',
      model: null,
      modelSubstitutedFrom: null,
      composition: null, postStyle: null, renderedText: null, renderNotes: null,
    })
  })

  it("restoredRenderStamp never lets the CURRENT font set leak onto a reused legacy PNG", () => {
    expect(restoredRenderStamp({ promptVersion: null, fontSet: null }, false, null)).toEqual({
      promptVersion: null,
      fontSet: null,
      model: null,
      modelSubstitutedFrom: null,
      composition: null, postStyle: null, renderedText: null, renderNotes: null,
    })
  })

  it('a restore that RE-RENDERS (legacy row with no stored PNG) stamps the font set that just rasterized it', () => {
    // The HTML is still the revision's (its prompt version, null if legacy);
    // the pixels are this render's.
    expect(restoredRenderStamp({ promptVersion: null, fontSet: null }, true, null)).toEqual({
      promptVersion: null,
      fontSet: 'fonts-test',
      model: null,
      modelSubstitutedFrom: null,
      composition: null, postStyle: null, renderedText: null, renderNotes: null,
    })
  })
})

describe('F3 adopt: "Use anyway" carries the rejected render\'s OWN stamp', () => {
  function liveRejected(over: Partial<Row> = {}): Row {
    const r = { ...rejected('d1'), ...over }
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    return r
  }

  function adopt(r: Row) {
    return commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1',
      instruction: `Use anyway: ${r.instruction}`,
      html: r.htmlSnapshot,
      width: 1080,
      height: 1080,
      exportKey: r.exportUrl!,
      adoptRejectedRevisionId: r.id,
    })
  }

  it("writes the rejected row's fontSet/promptVersion onto the new chain revision AND the draft, not the current ones", async () => {
    db.rows = [committed('d1', 1)]
    const r = liveRejected({ fontSet: 'fonts-old', promptVersion: 'pv-old' })
    const { revisionId } = await adopt(r)
    expect(db.rows.find((x) => x.id === revisionId)).toMatchObject({ fontSet: 'fonts-old', promptVersion: 'pv-old' })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ fontSet: 'fonts-old', promptVersion: 'pv-old' })
  })

  it("008 A6: copies the rejected row's OWN model onto the new revision and the draft", async () => {
    db.rows = [committed('d1', 1)]
    const r = liveRejected({ model: 'claude-opus-5-5', modelSubstitutedFrom: 'SONNET' })
    const { revisionId } = await adopt(r)
    expect(db.rows.find((x) => x.id === revisionId)).toMatchObject({
      model: 'claude-opus-5-5',
      modelSubstitutedFrom: 'SONNET',
    })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({
      designModel: 'claude-opus-5-5',
      designModelSubstitutedFrom: 'SONNET',
    })
  })

  it('a legacy (pre-F3) rejected row nulls both, on the revision and the draft', async () => {
    db.rows = [committed('d1', 1)]
    const r = liveRejected()
    const { revisionId } = await adopt(r)
    const created = db.rows.find((x) => x.id === revisionId)!
    expect(created.fontSet).toBeNull()
    expect(created.promptVersion).toBeNull()
    const data = db.draftUpdates.at(-1)!.data
    expect(data).toHaveProperty('fontSet', null)
    expect(data).toHaveProperty('promptVersion', null)
  })

  it('keeps the adopt lock order: the stamp lookup adds no write before the revision insert', async () => {
    db.rows = [committed('d1', 1)]
    const r = liveRejected({ fontSet: 'fonts-old', promptVersion: 'pv-old' })
    db.ops = []
    await adopt(r)
    expect(db.ops).toEqual(['revision.create', 'revision.updateMany', 'revision.updateMany', 'draft.updateMany'])
  })
})

// ── 008 T7 (FR-08, A6, AC-07): the model in every revision writer ───────────

describe('008 FR-08: commitDraftRevision / recordRejectedRender record the model', () => {
  // A REFINE model resolved with a substitution (Opus refused → Sonnet).
  const refineModel = (() => {
    const r = decideModel('REFINE', {
      policy: { ...DEFAULT_POLICY, allowed: ['HAIKU', 'SONNET'] },
      credential: 'n/a',
      mode: 'api',
      storedRequest: 'OPUS',
      designPath: 'B',
    })
    if (!r.ok) throw new Error(r.message)
    return r.resolved
  })()

  it('modelStampOf maps a ResolvedModel to arg + substitutedFrom, passes a stamp through, null → unknown', () => {
    expect(modelStampOf(refineModel)).toEqual({ model: 'claude-sonnet-5-5', modelSubstitutedFrom: 'OPUS' })
    expect(modelStampOf({ model: 'x', modelSubstitutedFrom: null })).toEqual({ model: 'x', modelSubstitutedFrom: null })
    expect(modelStampOf(null)).toEqual({ model: null, modelSubstitutedFrom: null })
    expect(draftModelStamp({ designModel: 'm', designModelSubstitutedFrom: 's' })).toEqual({ model: 'm', modelSubstitutedFrom: 's' })
    expect(draftModelStamp({})).toEqual({ model: null, modelSubstitutedFrom: null })
  })

  it('a refine commit stamps the new revision AND the draft with the refine model', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'darker', html: '<html>n</html>', width: 1080, height: 1080, model: refineModel,
    })
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: 'OPUS',
    })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({
      designModel: 'claude-sonnet-5-5',
      designModelSubstitutedFrom: 'OPUS',
    })
  })

  it('A6: a carried-forward stamp (inline edit) is written as-is, on the CAS path too', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    const carried = draftModelStamp({ designModel: 'claude-opus-5-5', designModelSubstitutedFrom: null })
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'el', html: '<html>c</html>', width: 1080, height: 1080, exportKey: 'k',
      expectedRevisionNumber: 1, model: carried,
    })
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({ model: 'claude-opus-5-5', modelSubstitutedFrom: null })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ designModel: 'claude-opus-5-5' })
  })

  it('no model given reads as unknown (null), never a stale value', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
    })
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({ model: null, modelSubstitutedFrom: null })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ designModel: null, designModelSubstitutedFrom: null })
  })

  it("an adopt ignores a passed model: the rejected row's own stamp wins", async () => {
    db.rows = [committed('d1', 1)]
    const r = { ...rejected('d1'), model: 'claude-haiku-4-5', modelSubstitutedFrom: null }
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    const { revisionId } = await commitDraftRevision({
      composition: null, postStyle: null,
      draftId: 'd1', instruction: 'Use anyway', html: r.htmlSnapshot, width: 1080, height: 1080,
      exportKey: r.exportUrl!, adoptRejectedRevisionId: r.id, model: refineModel,
    })
    expect(db.rows.find((x) => x.id === revisionId)).toMatchObject({ model: 'claude-haiku-4-5' })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ designModel: 'claude-haiku-4-5' })
  })

  it("recordRejectedRender stamps the rejected row with the attempt's model; the draft's design stamp is untouched", async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await recordHeld({ ...rejectArgs(), model: refineModel })
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: 'OPUS',
    })
    const data = db.draftUpdates.at(-1)!.data
    expect(data).not.toHaveProperty('designModel')
    expect(data).not.toHaveProperty('designModelSubstitutedFrom')
  })

  it('currentRenderStamp takes the internal / resolved model as its arg, never the key', () => {
    const m = internalModel('INTERNAL_VERIFIER', 'api')
    expect(currentRenderStamp(m, null, null, null, null)).toMatchObject({ model: m.arg, modelSubstitutedFrom: null })
  })
})

// ── 019: the content writes from a claimed run are guarded on the claim ──────
describe('019 commitDraftRevision with a claim (the refine commit)', () => {
  const claimArgs = (over: Partial<Parameters<typeof commitDraftRevision>[0]> = {}) => ({
    draftId: 'd1', instruction: 'refine', html: '<html/>', width: 1080, height: 1080, claim: CLAIM, composition: null, postStyle: null, ...over,
  })
  const hold = () => {
    db.pendingAction = CLAIM.action
    db.claimId = CLAIM.claimId
  }

  it('commits while the draft still carries the claim: ONE guarded final write whose WHERE is the claim', async () => {
    db.rows = [committed('d1', 1)]
    hold()
    const out = await commitDraftRevision(claimArgs())
    expect(out.revisionNumber).toBe(2)
    expect(db.ops.filter((o) => o.startsWith('draft.'))).toEqual(['draft.updateMany'])
    expect(db.ops.indexOf('draft.updateMany')).toBeGreaterThan(db.ops.indexOf('revision.create'))
    expect(db.draftUpdates[0].where).toEqual({ id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: 'claim-1' })
    expect(db.draftUpdates[0].where).not.toHaveProperty('currentRevisionNumber')
    expect(db.draftUpdates[0].data).toMatchObject({ currentRevisionNumber: 2, htmlContent: '<html/>' })
    expect(db.deletes).toEqual([])
  })

  it('a lost claim (swept, then a newer claim of the SAME action) throws, rolls back and removes the export it uploaded', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    db.pendingAction = 'REFINE'
    db.claimId = 'claim-2' // R2's token
    const err = await commitDraftRevision(claimArgs()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DraftClaimLostError)
    // Nothing landed: no revision row, no draft write, the pointer is where it was.
    expect(db.rows).toHaveLength(1)
    expect(db.draftUpdates).toEqual([])
    expect(db.currentRevisionNumber).toBe(1)
    expect(db.ops.at(-1)).toBe('rollback')
    // THIS call rendered and uploaded the export, so it is removed (best-effort).
    expect(db.uploads).toEqual(['exports/refine-d1-test.png'])
    expect(db.deletes).toEqual(['exports/refine-d1-test.png'])
  })

  it('a swept claim with no newer one (pendingAction null) is lost too', async () => {
    db.rows = [committed('d1', 1)]
    await expect(commitDraftRevision(claimArgs())).rejects.toBeInstanceOf(DraftClaimLostError)
    expect(db.rows).toHaveLength(1)
  })

  it('a caller-supplied export key is never removed by the lost-claim cleanup', async () => {
    db.rows = [committed('d1', 1)]
    await expect(commitDraftRevision(claimArgs({ exportKey: 'exports/theirs.png' }))).rejects.toBeInstanceOf(
      DraftClaimLostError,
    )
    expect(db.deletes).toEqual([])
  })

  it('a failed removal never masks the lost claim', async () => {
    db.rows = [committed('d1', 1)]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const minio = await import('@/lib/storage/minio')
    const del = vi.spyOn(minio, 'deleteObject').mockRejectedValueOnce(new Error('minio down'))
    await expect(commitDraftRevision(claimArgs())).rejects.toBeInstanceOf(DraftClaimLostError)
    expect(spy).toHaveBeenCalled()
    del.mockRestore()
    spy.mockRestore()
  })

  it('a claim cannot be combined with expectedRevisionNumber or adoptRejectedRevisionId', async () => {
    db.rows = [committed('d1', 1)]
    hold()
    await expect(commitDraftRevision(claimArgs({ expectedRevisionNumber: 1 }))).rejects.toThrow(/claim cannot be combined/)
    await expect(commitDraftRevision(claimArgs({ adoptRejectedRevisionId: 'x' }))).rejects.toThrow(/claim cannot be combined/)
    expect(db.uploads).toEqual([])
    expect(db.draftUpdates).toEqual([])
  })

  it('without a claim nothing changes: the plain commit is still the unguarded draft.update', async () => {
    db.rows = [committed('d1', 1)]
    await commitDraftRevision({ composition: null, postStyle: null, draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(db.ops.filter((o) => o.startsWith('draft.'))).toEqual(['draft.update'])
  })
})

describe('019 recordRejectedRender with a lost claim', () => {
  it('throws DraftClaimLostError, writes no row and no draft outcome, and removes the render it uploaded', async () => {
    db.rows = [committed('d1', 1)]
    db.pendingAction = 'REFINE'
    db.claimId = 'claim-2'
    const err = await recordRejectedRender(rejectArgs()).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DraftClaimLostError)
    expect(db.rows).toHaveLength(1)
    expect(db.notAppliedRevisionId).toBeNull()
    expect(db.ops.at(-1)).toBe('rollback')
    expect(db.deletes).toEqual(['exports/refine-d1-test.png'])
  })

  it('its final draft write and its discard both carry the claim; the draft write is last', async () => {
    db.rows = [committed('d1', 1)]
    await recordHeld(rejectArgs())
    expect(db.draftUpdates).toHaveLength(1)
    expect(db.draftUpdates[0].where).toEqual({ id: 'd1', pendingAction: 'REFINE', pendingActionClaimId: 'claim-1' })
    expect(db.ops.lastIndexOf('draft.updateMany')).toBeGreaterThan(db.ops.indexOf('revision.create'))
  })

  it('its discard only stamps the live rejected row while the claim holds (a late settle leaves a newer outcome alone)', async () => {
    db.rows = [committed('d1', 1)]
    const first = await recordHeld(rejectArgs({ instruction: 'first' }))
    db.pendingAction = 'REFINE'
    db.claimId = 'claim-2'
    await expect(recordRejectedRender(rejectArgs({ instruction: 'late' }))).rejects.toBeInstanceOf(DraftClaimLostError)
    const firstRow = db.rows.find((r) => r.id === first.revisionId)!
    expect(firstRow.discardedAt ?? null).toBeNull()
    expect(db.notAppliedRevisionId).toBe(first.revisionId)
  })

  it('no render, no cleanup: a lost claim with no upload deletes nothing', async () => {
    db.rows = [committed('d1', 1)]
    await expect(recordRejectedRender(rejectArgs({ html: null, unusableHtml: '<html>cut' }))).rejects.toBeInstanceOf(
      DraftClaimLostError,
    )
    expect(db.deletes).toEqual([])
  })
})

// ── 009 FR-12: the composition stamp rides every revision writer ────────────
// One JSON value on the revision row and the draft, copied as a unit: a fresh
// commit writes the caller's, an adopt the rejected row's own, a restore the
// restored row's own. No stamp is SQL NULL (Prisma.DbNull), never a JSON null.

const KEPT_STAMP = {
  requestedArchetype: 'product-showcase',
  appliedArchetype: 'product-showcase',
  contractVersion: 1,
  imageQuality: 'high' as const,
}
const FALLBACK_STAMP = {
  requestedArchetype: 'editorial-split',
  appliedArchetype: 'classic',
  contractVersion: null,
  fallbackReason: 'busy' as const,
  imageQuality: 'default' as const,
}

describe('009 composition stamp: every revision writer carries it', () => {
  it('commitDraftRevision writes the caller’s stamp to the new row and the draft', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
      composition: KEPT_STAMP, postStyle: null,
    })
    expect(db.rows.find((r) => r.id === revisionId)!.composition).toEqual(KEPT_STAMP)
    expect(db.draftUpdates.at(-1)!.data.composition).toEqual(KEPT_STAMP)
  })

  it('no stamp is SQL NULL on both (never a JSON null)', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
      composition: null, postStyle: null,
    })
    expect(db.rows.find((r) => r.id === revisionId)!.composition).toBe(Prisma.DbNull)
    expect(db.draftUpdates.at(-1)!.data.composition).toBe(Prisma.DbNull)
  })

  it('a stamp that breaks its invariants is refused at the write (the schema runs at every write)', async () => {
    db.rows = [committed('d1', 1)]
    await expect(
      commitDraftRevision({
        draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
        composition: { ...KEPT_STAMP, appliedArchetype: 'classic' }, postStyle: null,
      }),
    ).rejects.toThrow()
    expect(db.draftUpdates).toEqual([])
  })

  it('a CAS commit and a claimed commit carry it too', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    await commitDraftRevision({
      draftId: 'd1', instruction: 'el', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
      expectedRevisionNumber: 1, composition: FALLBACK_STAMP, postStyle: null,
    })
    expect(db.draftUpdates.at(-1)!.data.composition).toEqual(FALLBACK_STAMP)
  })

  it('recordRejectedRender stamps the rejected row and leaves the draft’s stamp alone', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await recordHeld(rejectArgs({ composition: KEPT_STAMP }))
    expect(db.rows.find((r) => r.id === revisionId)!.composition).toEqual(KEPT_STAMP)
    expect('composition' in db.draftUpdates.at(-1)!.data).toBe(false)
  })

  it('adopt carries the rejected row’s OWN stamp, whatever the caller passed', async () => {
    db.rows = [committed('d1', 1)]
    const r = { ...rejected('d1'), composition: FALLBACK_STAMP }
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'Use anyway', html: r.htmlSnapshot, width: 1080, height: 1080,
      exportKey: r.exportUrl!, adoptRejectedRevisionId: r.id, composition: null, postStyle: null,
    })
    expect(db.rows.find((x) => x.id === revisionId)!.composition).toEqual(FALLBACK_STAMP)
    expect(db.draftUpdates.at(-1)!.data.composition).toEqual(FALLBACK_STAMP)
  })

  it('restoredRenderStamp reads the revision’s own stamp; a legacy or corrupt value is null', () => {
    expect(restoredRenderStamp({ composition: KEPT_STAMP }, false, null).composition).toEqual(KEPT_STAMP)
    expect(restoredRenderStamp({ composition: null }, false, null).composition).toBeNull()
    expect(restoredRenderStamp({}, true, null).composition).toBeNull()
    expect(restoredRenderStamp({ composition: { appliedArchetype: 'nope' } }, false, null).composition).toBeNull()
  })

  it('restoreDraftToRevision writes the restored stamp onto the draft', async () => {
    db.currentRevisionNumber = 3
    await restoreDraftToRevision(
      'd1', 2, '<html>v2</html>', 'exports/d1-2.png',
      restoredRenderStamp({ promptVersion: 'pv', fontSet: 'f', composition: FALLBACK_STAMP }, false, null),
    )
    expect(db.draftUpdates.at(-1)!.data.composition).toEqual(FALLBACK_STAMP)
  })

  it('draftCompositionStamp parses the draft’s stored value (null when absent or corrupt)', () => {
    expect(draftCompositionStamp({ composition: KEPT_STAMP })).toEqual(KEPT_STAMP)
    expect(draftCompositionStamp({})).toBeNull()
    expect(draftCompositionStamp({ composition: 'x' })).toBeNull()
  })

  it('revisionStampFields is the revision row’s four old fields plus composition', () => {
    expect(revisionStampFields(currentRenderStamp(null, KEPT_STAMP, null, null, null))).toEqual({
      promptVersion: PROMPT_VERSION,
      fontSet: 'fonts-test',
      model: null,
      modelSubstitutedFrom: null,
      composition: KEPT_STAMP,
      postStyle: Prisma.DbNull,
      renderedText: Prisma.DbNull,
      renderNotes: Prisma.DbNull,
    })
  })
})

// ── 027 FR-05: the post-style stamp rides every revision writer ─────────────
// One JSON value ({ key, version, revision }) on the revision row and the
// draft. A fresh commit and a rejected render write the caller's, which every
// carry-forward writer takes from the draft (draftPostStyleStamp); an adopt
// writes the draft's current stamp, not the rejected row's; a restore carries
// the draft's too. No stamp is SQL NULL (Prisma.DbNull), never a JSON null.

const STYLE_STAMP = { key: 'promotion', version: 1, revision: 8 }
const OTHER_STYLE_STAMP = { key: 'event', version: 1, revision: 8 }

describe('027 post-style stamp: every revision writer carries it', () => {
  it('commitDraftRevision (refine, inline edit, override) writes the caller’s stamp to the new row and the draft', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
      composition: null, postStyle: STYLE_STAMP,
    })
    expect(db.rows.find((r) => r.id === revisionId)!.postStyle).toEqual(STYLE_STAMP)
    expect(db.draftUpdates.at(-1)!.data.postStyle).toEqual(STYLE_STAMP)
  })

  it('no stamp is SQL NULL on both (never a JSON null)', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
      composition: null, postStyle: null,
    })
    expect(db.rows.find((r) => r.id === revisionId)!.postStyle).toBe(Prisma.DbNull)
    expect(db.draftUpdates.at(-1)!.data.postStyle).toBe(Prisma.DbNull)
  })

  it('the compare-and-swap commit (element edit) carries it too', async () => {
    db.rows = [committed('d1', 1)]
    db.currentRevisionNumber = 1
    await commitDraftRevision({
      draftId: 'd1', instruction: 'el', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
      expectedRevisionNumber: 1, composition: null, postStyle: STYLE_STAMP,
    })
    expect(db.draftUpdates.at(-1)!.data.postStyle).toEqual(STYLE_STAMP)
  })

  it('a stamp that breaks its schema is refused at the write', async () => {
    db.rows = [committed('d1', 1)]
    await expect(
      commitDraftRevision({
        draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k',
        composition: null, postStyle: { key: '', version: 1, revision: 8 },
      }),
    ).rejects.toThrow()
    expect(db.draftUpdates).toEqual([])
  })

  it('recordRejectedRender stamps the rejected row with the caller’s and leaves the draft’s stamp alone', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await recordHeld(rejectArgs({ postStyle: STYLE_STAMP }))
    expect(db.rows.find((r) => r.id === revisionId)!.postStyle).toEqual(STYLE_STAMP)
    expect('postStyle' in db.draftUpdates.at(-1)!.data).toBe(false)
  })

  it('adopt writes the DRAFT’s current stamp, whatever the rejected row carries', async () => {
    db.rows = [committed('d1', 1)]
    const r = { ...rejected('d1'), postStyle: OTHER_STYLE_STAMP }
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'Use anyway', html: r.htmlSnapshot, width: 1080, height: 1080,
      exportKey: r.exportUrl!, adoptRejectedRevisionId: r.id, composition: null, postStyle: STYLE_STAMP,
    })
    expect(db.rows.find((x) => x.id === revisionId)!.postStyle).toEqual(STYLE_STAMP)
    expect(db.draftUpdates.at(-1)!.data.postStyle).toEqual(STYLE_STAMP)
  })

  it('restore carries the draft’s current stamp (the render pointer moves; the rules are not re-run)', async () => {
    db.currentRevisionNumber = 3
    const stamp = restoredRenderStamp({ promptVersion: 'pv', fontSet: 'f' }, false, STYLE_STAMP)
    expect(stamp.postStyle).toEqual(STYLE_STAMP)
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', stamp)
    expect(db.draftUpdates.at(-1)!.data.postStyle).toEqual(STYLE_STAMP)
  })

  it('draftPostStyleStamp parses the draft’s stored value (null when absent or corrupt)', () => {
    expect(draftPostStyleStamp({ postStyle: STYLE_STAMP })).toEqual(STYLE_STAMP)
    expect(draftPostStyleStamp({})).toBeNull()
    expect(draftPostStyleStamp({ postStyle: 'x' })).toBeNull()
    expect(draftPostStyleStamp({ postStyle: { key: 'a', version: 1, revision: 1, extra: true } })).toBeNull()
  })

  it('currentRenderStamp requires it and the field helpers write it as a column value', () => {
    const stamp = currentRenderStamp(null, null, STYLE_STAMP, null, null)
    expect(stamp.postStyle).toEqual(STYLE_STAMP)
    expect(revisionStampFields(stamp).postStyle).toEqual(STYLE_STAMP)
    expect(draftStampFields(stamp).postStyle).toEqual(STYLE_STAMP)
    expect(postStyleColumn(null)).toBe(Prisma.DbNull)
  })
})

// 025 T9 (FR-16, NFR-05, NFR-08): the stamp decides the screenshot on every
// re-render. The stored document is canonical for the stamp, the render gets the
// stamp's composite argument, and a failed placement writes nothing.
describe('025 composite stamp: every re-render writer places the screenshot from the stamp', () => {
  const RECT = { x: 17, y: 44, w: 72, h: 45 }
  const DEVICE_STAMP = {
    requestedArchetype: 'device-screen',
    appliedArchetype: 'device-screen',
    contractVersion: 1,
    imageQuality: 'default' as const,
    composites: [{ region: 0 as const, rect: RECT, source: { kind: 'brief-upload' as const, key: 'screenshots/team-1/u1/a.png' } }],
  }
  const BASE = '<!doctype html><html><body><p>Hello</p></body></html>'
  const CANVAS = { width: 1080, height: 1080 }

  it('a commit stores the canonical element and renders with the stamp’s composite (rect from the stamp)', async () => {
    db.rows = [committed('d1', 1)]
    const { insertComposite } = await import('@/lib/composite/insert')
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'x', html: BASE, width: 1080, height: 1080,
      composition: DEVICE_STAMP, postStyle: null,
    })
    const expected = insertComposite(BASE, RECT, CANVAS)
    expect(db.rows.find((r) => r.id === revisionId)!.htmlSnapshot).toBe(expected)
    expect(db.draftUpdates.at(-1)!.data.htmlContent).toBe(expected)
    expect(expected).toContain('__COMPOSITE_0__')
    expect(db.composite.calls).toHaveLength(1)
    expect(db.composite.calls[0]).toMatchObject({ teamId: 'team-1', canvas: CANVAS })
    expect(db.render.composites).toHaveLength(1)
    expect(db.render.composites[0]).toMatchObject({ token: '__COMPOSITE_0__' })
  })

  it('an editor document that lost or moved the element is stored with the canonical one restored', async () => {
    db.rows = [committed('d1', 1)]
    const { insertComposite } = await import('@/lib/composite/insert')
    const moved = insertComposite(BASE, { x: 1, y: 1, w: 10, h: 6 }, CANVAS).replace('__COMPOSITE_0__', '/api/briefs/screenshots?key=k&draftId=d1')
    for (const html of [BASE, moved]) {
      const { revisionId } = await commitDraftRevision({
        draftId: 'd1', instruction: 'x', html, width: 1080, height: 1080,
        composition: DEVICE_STAMP, postStyle: null,
      })
      expect(db.rows.find((r) => r.id === revisionId)!.htmlSnapshot).toBe(insertComposite(BASE, RECT, CANVAS))
    }
  })

  it('a classic stamp stores no composite element (a stray one is removed) and renders with null', async () => {
    db.rows = [committed('d1', 1)]
    const { insertComposite } = await import('@/lib/composite/insert')
    const stray = insertComposite(BASE, RECT, CANVAS)
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'x', html: stray, width: 1080, height: 1080,
      composition: FALLBACK_STAMP, postStyle: null,
    })
    expect(db.rows.find((r) => r.id === revisionId)!.htmlSnapshot).toBe(BASE)
    expect(db.render.composites).toEqual([null])
    expect(db.composite.calls).toEqual([])
  })

  it('a failed placement (unreadable screenshot) fails with the named error, writes nothing and uploads nothing', async () => {
    db.rows = [committed('d1', 1)]
    db.composite.fail = true
    await expect(
      commitDraftRevision({
        draftId: 'd1', instruction: 'x', html: BASE, width: 1080, height: 1080,
        composition: DEVICE_STAMP, postStyle: null,
      }),
    ).rejects.toMatchObject({
      name: 'CompositePlacementError',
      message: 'The product screenshot could not be placed; nothing was changed',
    })
    expect(db.rows).toHaveLength(1)
    expect(db.draftUpdates).toEqual([])
    expect(db.uploads).toEqual([])
    expect(db.render.calls).toBe(0)
  })

  it('a failed composite check in the renderer is the same error, with nothing written or uploaded', async () => {
    db.rows = [committed('d1', 1)]
    const { CompositeRenderError } = await import('@/lib/composite/render')
    db.render.failWith = new CompositeRenderError('composite-not-rendered', 'covered')
    await expect(
      commitDraftRevision({
        draftId: 'd1', instruction: 'x', html: BASE, width: 1080, height: 1080,
        composition: DEVICE_STAMP, postStyle: null,
      }),
    ).rejects.toMatchObject({ message: 'The product screenshot could not be placed; nothing was changed' })
    expect(db.rows).toHaveLength(1)
    expect(db.draftUpdates).toEqual([])
    expect(db.uploads).toEqual([])
  })

  it('a render error that is not a composite failure passes through unchanged', async () => {
    db.rows = [committed('d1', 1)]
    db.render.fail = true
    await expect(
      commitDraftRevision({
        draftId: 'd1', instruction: 'x', html: BASE, width: 1080, height: 1080,
        composition: DEVICE_STAMP, postStyle: null,
      }),
    ).rejects.toThrow('Chromium crashed')
  })

  it('a stamp that is kept by a classic fallback (refine replaced the image) has no element', async () => {
    db.rows = [committed('d1', 1)]
    const { refineReplacedStamp, compositionStampSchema } = await import('@/lib/designData')
    const replaced = refineReplacedStamp(compositionStampSchema.parse(DEVICE_STAMP))
    expect(replaced.fallbackReason).toBe('refine-replaced-image')
    expect(replaced.composites).toBeUndefined()
    const { insertComposite } = await import('@/lib/composite/insert')
    const { revisionId } = await commitDraftRevision({
      draftId: 'd1', instruction: 'new background', html: insertComposite(BASE, RECT, CANVAS), width: 1080, height: 1080,
      composition: replaced, postStyle: null,
    })
    expect(db.rows.find((r) => r.id === revisionId)!.htmlSnapshot).not.toContain('data-composite')
  })

  it('a rejected render is stored canonical and rendered with the stamp’s composite', async () => {
    db.rows = [committed('d1', 1)]
    const { insertComposite } = await import('@/lib/composite/insert')
    const { revisionId } = await recordHeld(rejectArgs({ html: BASE, composition: DEVICE_STAMP }))
    expect(db.rows.find((r) => r.id === revisionId)!.htmlSnapshot).toBe(insertComposite(BASE, RECT, { width: 1080, height: 1350 }))
    expect(db.render.composites[0]).toMatchObject({ token: '__COMPOSITE_0__' })
  })

  it('a rejected render whose placement fails is recorded without an export, as for any render failure', async () => {
    db.rows = [committed('d1', 1)]
    db.composite.fail = true
    const { exportKey } = await recordHeld(rejectArgs({ html: BASE, composition: DEVICE_STAMP }))
    expect(exportKey).toBeNull()
    expect(db.uploads).toEqual([])
  })

  it('NFR-05: a document that holds a screenshot URL is refused, never stored', async () => {
    db.rows = [committed('d1', 1)]
    const leak = '<html><body><img src="https://minio.test/docs/screenshots/team-1/u1/a.png"></body></html>'
    await expect(
      commitDraftRevision({
        draftId: 'd1', instruction: 'x', html: leak, width: 1080, height: 1080,
        composition: null, postStyle: null,
      }),
    ).rejects.toThrow(/screenshot URL/)
    expect(db.draftUpdates).toEqual([])
  })
})

// ── 030 FR-04 (AC-04): the rendered-text stamp in every revision writer ─────
// A render that happens here is checked against the draft's own headline (read
// BEFORE the render, else the brief topic) and stamped from that check. A
// carried render (adopt, restore) keeps its row's stamp; an export stamps none.
describe('030 rendered-text stamp: commit, rejected render, adopt, restore', () => {
  const painted = { headline: { text: 'Launch Day', verified: true } }
  const commit = (over: Record<string, unknown> = {}) =>
    commitDraftRevision({
      draftId: 'd1', instruction: 'edit', html: '<html><body>x</body></html>', width: 1080, height: 1080,
      composition: null, postStyle: null, ...over,
    })
  const rowOf = (id: string) => db.rows.find((r) => r.id === id)!

  it('an inline-edit-like commit checks the draft headline, read before the render, and stamps both rows', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commit()
    expect(db.render.headlines).toEqual(['Launch Day'])
    expect(db.events).toEqual(['headline-read', 'render'])
    expect(rowOf(revisionId).renderedText).toEqual(painted)
    expect(db.draftUpdates.at(-1)!.data.renderedText).toEqual(painted)
  })

  it('a refine-like (claimed) commit does the same, and a failed check is stamped with its reason', async () => {
    db.rows = [committed('d1', 1)]
    db.pendingAction = CLAIM.action
    db.claimId = CLAIM.claimId
    db.render.check = 'not-visible'
    const { revisionId } = await commit({ claim: CLAIM })
    const want = { headline: { text: 'Launch Day', verified: false, reason: 'not-visible' } }
    expect(rowOf(revisionId).renderedText).toEqual(want)
    expect(db.draftUpdates.at(-1)!.data.renderedText).toEqual(want)
  })

  it('a draft with a null headline is checked against the brief topic', async () => {
    db.rows = [committed('d1', 1)]
    db.headline = null
    db.topic = 'Brief topic'
    const { revisionId } = await commit()
    expect(db.render.headlines).toEqual(['Brief topic'])
    expect(rowOf(revisionId).renderedText).toEqual({ headline: { text: 'Brief topic', verified: true } })
  })

  it('a rejected render does the same, for its own row, and leaves the draft stamp alone', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await recordHeld(rejectArgs())
    expect(db.render.headlines).toEqual(['Launch Day'])
    expect(rowOf(revisionId).renderedText).toEqual(painted)
    expect(db.draftUpdates.at(-1)!.data).not.toHaveProperty('renderedText')
  })

  it('a rejected render whose render fails is stamped not-checked; one with no document too', async () => {
    db.rows = [committed('d1', 1)]
    db.render.fail = true
    const failed = await recordHeld(rejectArgs())
    expect(rowOf(failed.revisionId).renderedText).toEqual({
      headline: { text: 'Launch Day', verified: false, reason: 'not-checked' },
    })
    const none = await recordHeld(rejectArgs({ html: null, unusableHtml: '<p>cut off' }))
    expect(rowOf(none.revisionId).renderedText).toEqual({
      headline: { text: 'Launch Day', verified: false, reason: 'not-checked' },
    })
  })

  it('adopt carries the rejected row\'s own stamp and renders nothing', async () => {
    db.rows = [committed('d1', 1)]
    const r = rejected('d1')
    r.renderedText = { headline: { text: 'Old headline', verified: false, reason: 'not-found' } }
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    const { revisionId } = await commit({ exportKey: r.exportUrl!, adoptRejectedRevisionId: r.id })
    const want = { headline: { text: 'Old headline', verified: false, reason: 'not-found' } }
    expect(rowOf(revisionId).renderedText).toEqual(want)
    expect(db.draftUpdates.at(-1)!.data.renderedText).toEqual(want)
    expect(db.render.calls).toBe(0)
  })

  it('adopt of a pre-030 row carries null (SQL NULL), never a stamp made now', async () => {
    db.rows = [committed('d1', 1)]
    const r = rejected('d1')
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    const { revisionId } = await commit({ exportKey: r.exportUrl!, adoptRejectedRevisionId: r.id })
    expect(rowOf(revisionId).renderedText).toBe(Prisma.DbNull)
    expect(db.draftUpdates.at(-1)!.data.renderedText).toBe(Prisma.DbNull)
  })

  it('restore carries the revision\'s stamp (also when re-rendered); a pre-030 row is null', () => {
    const own = { headline: { text: 'Then', verified: true } }
    expect(restoredRenderStamp({ renderedText: own }, false, null).renderedText).toEqual(own)
    expect(restoredRenderStamp({ renderedText: own }, true, null).renderedText).toEqual(own)
    expect(restoredRenderStamp({}, false, null).renderedText).toBeNull()
    expect(restoredRenderStamp({ renderedText: { headline: { text: 1 } } }, false, null).renderedText).toBeNull()
  })

  it('restoreDraftToRevision writes the carried stamp (SQL NULL for a pre-030 row)', async () => {
    db.currentRevisionNumber = 3
    const own = { headline: { text: 'Then', verified: true } }
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', restoredRenderStamp({ renderedText: own }, false, null))
    expect(db.draftUpdates.at(-1)!.data.renderedText).toEqual(own)
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', restoredRenderStamp({}, false, null))
    expect(db.draftUpdates.at(-1)!.data.renderedText).toBe(Prisma.DbNull)
  })
})

// ── 031 FR-24: the render note in every revision writer ─────────────────────
// Written exactly where renderedText is: a render made here stamps its own font
// check; a carried render (adopt, restore) keeps its row's note; a caller-supplied
// export with no adopt stamps none.
describe('031 render notes: commit, rejected render, adopt, restore', () => {
  const missing = { fontsMissing: ['Noto Sans Sinhala'] }
  const commit = (over: Record<string, unknown> = {}) =>
    commitDraftRevision({
      draftId: 'd1', instruction: 'edit', html: '<html><body>x</body></html>', width: 1080, height: 1080,
      composition: null, postStyle: null, ...over,
    })
  const rowOf = (id: string) => db.rows.find((r) => r.id === id)!

  it("a commit stamps the render's font check on the row and the draft", async () => {
    db.rows = [committed('d1', 1)]
    db.render.fontsMissing = ['Noto Sans Sinhala']
    const { revisionId } = await commit()
    expect(rowOf(revisionId).renderNotes).toEqual(missing)
    expect(db.draftUpdates.at(-1)!.data.renderNotes).toEqual(missing)
  })

  it('nothing missing is SQL NULL on both rows', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commit()
    expect(rowOf(revisionId).renderNotes).toBe(Prisma.DbNull)
    expect(db.draftUpdates.at(-1)!.data.renderNotes).toBe(Prisma.DbNull)
  })

  it('a caller-supplied export (no render here) stamps no note', async () => {
    db.rows = [committed('d1', 1)]
    db.render.fontsMissing = ['X']
    const { revisionId } = await commit({ exportKey: 'exports/given.png' })
    expect(db.render.calls).toBe(0)
    expect(rowOf(revisionId).renderNotes).toBe(Prisma.DbNull)
  })

  it('a rejected render stamps its own row and leaves the draft alone; a failed render stamps none', async () => {
    db.rows = [committed('d1', 1)]
    db.render.fontsMissing = ['Abhaya Libre']
    const ok = await recordHeld(rejectArgs())
    expect(rowOf(ok.revisionId).renderNotes).toEqual({ fontsMissing: ['Abhaya Libre'] })
    expect(db.draftUpdates.at(-1)!.data).not.toHaveProperty('renderNotes')
    db.render.fail = true
    const failed = await recordHeld(rejectArgs())
    expect(rowOf(failed.revisionId).renderNotes).toBe(Prisma.DbNull)
  })

  it("adopt carries the rejected row's own note and renders nothing", async () => {
    db.rows = [committed('d1', 1)]
    const r = rejected('d1')
    r.renderNotes = { fontsMissing: ['Old Font'] }
    db.rows.push(r)
    db.notAppliedRevisionId = r.id
    db.render.fontsMissing = ['Now Font']
    const { revisionId } = await commit({ exportKey: r.exportUrl!, adoptRejectedRevisionId: r.id })
    expect(rowOf(revisionId).renderNotes).toEqual({ fontsMissing: ['Old Font'] })
    expect(db.draftUpdates.at(-1)!.data.renderNotes).toEqual({ fontsMissing: ['Old Font'] })
    expect(db.render.calls).toBe(0)
  })

  it("restore carries the revision's note (also when re-rendered); a pre-031 or unreadable one is null", async () => {
    expect(restoredRenderStamp({ renderNotes: missing }, false, null).renderNotes).toEqual(missing)
    expect(restoredRenderStamp({ renderNotes: missing }, true, null).renderNotes).toEqual(missing)
    expect(restoredRenderStamp({}, false, null).renderNotes).toBeNull()
    expect(restoredRenderStamp({ renderNotes: { fontsMissing: [] } }, false, null).renderNotes).toBeNull()
    db.currentRevisionNumber = 3
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', restoredRenderStamp({ renderNotes: missing }, false, null))
    expect(db.draftUpdates.at(-1)!.data.renderNotes).toEqual(missing)
  })
})
