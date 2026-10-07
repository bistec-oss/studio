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
  fontSet?: string | null
  promptVersion?: string | null
}

const fake = vi.hoisted(() => {
  const db = {
    rows: [] as Row[],
    draftUpdates: [] as Array<{ where: unknown; data: Record<string, unknown> }>,
    // The draft's current not-applied pointer.
    notAppliedRevisionId: null as string | null,
    // The draft's in-flight action marker — T19's adoptRejectedRevisionId
    // guard re-checks this (fix round 1, Minor 1).
    pendingAction: null as string | null,
    // The draft's revision pointer — the element-edit CAS (expectedRevisionNumber,
    // change 004 T23 fix round 1) guards on it.
    currentRevisionNumber: null as number | null,
    render: { calls: 0, fail: false },
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
        // The single fake draft's back-reference: { some: { id } }.
        if (row.id !== db.notAppliedRevisionId) return false
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
          notAppliedRevisionId?: string | null
          currentRevisionNumber?: number | null
        }
        data: Record<string, unknown>
      }) => {
        db.ops.push('draft.updateMany')
        const { where } = args
        if ('pendingAction' in where && where.pendingAction !== db.pendingAction) return { count: 0 }
        if ('notAppliedRevisionId' in where && where.notAppliedRevisionId !== db.notAppliedRevisionId) {
          return { count: 0 }
        }
        if ('currentRevisionNumber' in where && where.currentRevisionNumber !== db.currentRevisionNumber) {
          return { count: 0 }
        }
        applyDraft(args)
        return { count: 1 }
      },
      findUnique: async () => {
        db.ops.push('draft.findUnique')
        return {
          pendingAction: db.pendingAction,
          currentRevisionNumber: db.currentRevisionNumber,
          notAppliedRevisionId: db.notAppliedRevisionId,
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
  return { db, client }
})
const db = fake.db
vi.mock('@/lib/prisma', () => ({ prisma: fake.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/renderer/puppeteer', () => ({
  renderHtmlToPng: async () => {
    fake.db.render.calls++
    if (fake.db.render.fail) throw new Error('Chromium crashed')
    return Buffer.from('png')
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
  type RejectionDiagnostics,
} from '@/lib/drafts/revisions'
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
  db.render = { calls: 0, fail: false }
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

  it('selects only the listing fields (no htmlSnapshot)', async () => {
    db.rows = [committed('d1', 1)]
    const [row] = await listCommittedRevisions('d1')
    expect(Object.keys(row).sort()).toEqual([
      'createdAt',
      'exportUrl',
      'id',
      'instruction',
      'revisionNumber',
    ])
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
    const { revisionId: rejectedId, exportKey } = await recordRejectedRender(rejectArgs())
    db.ops = []
    db.draftUpdates = []
    await commitDraftRevision({
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
    await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(draftWrites(db.ops)).toEqual(['draft.update'])
    expect(db.ops.indexOf('draft.update')).toBeGreaterThan(db.ops.indexOf('revision.create'))
  })

  it('a CAS miss rolls back the insert it already made', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    db.currentRevisionNumber = 2
    await expect(
      commitDraftRevision({
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
    exportKey: 'k', expectedRevisionNumber,
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
    const out = await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
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

const rejectArgs = (over: Partial<Parameters<typeof recordRejectedRender>[0]> = {}) => ({
  draftId: 'd1',
  instruction: 'reduce the text',
  html: '<!DOCTYPE html><html><body>still long</body></html>',
  width: 1080,
  height: 1350,
  reason: 'The edit could not be applied: remove missed.',
  diagnostics: diagnostics(),
  ...over,
})

describe('recordRejectedRender (FR-12/13, Ruling D/E)', () => {
  it('writes ONE unnumbered rejected row with the render, diagnostics and export; the chain and pointer are untouched', async () => {
    db.rows = [committed('d1', 1), committed('d1', 2)]
    const { revisionId, exportKey } = await recordRejectedRender(rejectArgs())
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
    const { revisionId, exportKey } = await recordRejectedRender(
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
    const { revisionId, exportKey } = await recordRejectedRender(rejectArgs())
    expect(exportKey).toBeNull()
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(rejectionDiagnosticsSchema.parse(row.rejection).export).toBe('render-failed')
    expect(db.notAppliedRevisionId).toBe(revisionId)
  })

  it('REPLACING an outcome stamps the previous rejected row discarded', async () => {
    const first = await recordRejectedRender(rejectArgs())
    const second = await recordRejectedRender(rejectArgs({ instruction: 'reduce it again' }))
    expect(db.rows.find((r) => r.id === first.revisionId)!.discardedAt).toBeInstanceOf(Date)
    expect(db.rows.find((r) => r.id === second.revisionId)!.discardedAt ?? null).toBeNull()
    expect(db.notAppliedRevisionId).toBe(second.revisionId)
  })

  it('caps the human-readable reason', async () => {
    await recordRejectedRender(rejectArgs({ reason: 'x'.repeat(5000) }))
    expect((db.draftUpdates[0].data.notAppliedReason as string).length).toBe(MAX_NOT_APPLIED_REASON)
  })

  it('refuses diagnostics beyond the hard caps (AC-15 is part of the schema)', async () => {
    await expect(recordRejectedRender(rejectArgs({ diagnostics: diagnostics({ refineCalls: 3 }) }))).rejects.toThrow()
    await expect(recordRejectedRender(rejectArgs({ diagnostics: diagnostics({ verifierCalls: 3 }) }))).rejects.toThrow()
  })

  // Fix round 1, Minor 2: validation happens BEFORE the render/upload, so an
  // invalid record never orphans an export object.
  it('validates the diagnostics before rendering or uploading anything', async () => {
    const bad = diagnostics({ attempts: [{ ...diagnostics().attempts[0], verifierCalls: 2 }] })
    await expect(recordRejectedRender(rejectArgs({ diagnostics: bad }))).rejects.toThrow()
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
    await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    await recordRejectedRender(rejectArgs())
    expect(db.txOptions).toEqual([{ maxWait: TX_MAX_WAIT_MS }, { maxWait: TX_MAX_WAIT_MS }])
  })
})

describe('commitDraftRevision clears the not-applied outcome', () => {
  it('nulls notApplied* and stamps the referenced rejected row discarded', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId: rejectedId } = await recordRejectedRender(rejectArgs())
    db.draftUpdates = []
    await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(db.draftUpdates[0].data).toMatchObject({ notAppliedReason: null, notAppliedRevisionId: null, currentRevisionNumber: 2 })
    expect(db.rows.find((r) => r.id === rejectedId)!.discardedAt).toBeInstanceOf(Date)
  })

  it('never stamps an adopted rejected row', async () => {
    const { revisionId: rejectedId } = await recordRejectedRender(rejectArgs())
    const row = db.rows.find((r) => r.id === rejectedId)!
    row.adoptedAt = new Date()
    await commitDraftRevision({ draftId: 'd1', instruction: 'x', html: '<html/>', width: 1080, height: 1080, exportKey: 'k' })
    expect(row.discardedAt ?? null).toBeNull()
  })
})

// ── T19: adoptRejectedRevisionId ("Use anyway") ─────────────────────────────

describe('commitDraftRevision adoptRejectedRevisionId (T19 "Use anyway")', () => {
  it('adopts the rejected row: stamps adoptedAt/adoptedRevisionNumber, creates exactly one chain row with its snapshot+export, clears notApplied', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId: rejectedId, exportKey: rejectedExport } = await recordRejectedRender(
      rejectArgs({ instruction: 'make the logo bigger' }),
    )
    db.draftUpdates = []
    db.render.calls = 0

    const before = db.rows.length
    const { revisionId, exportKey } = await commitDraftRevision({
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
    const first = await recordRejectedRender(rejectArgs({ instruction: 'first' }))
    const second = await recordRejectedRender(rejectArgs({ instruction: 'second' }))
    // `second` is now the live outcome; `first` was already discarded by the
    // replace. Adopting the (already-discarded) `first` row must 409, and
    // the live `second` row must be untouched.
    await expect(
      commitDraftRevision({
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
    const { revisionId: rejectedId, exportKey: rejectedExport } = await recordRejectedRender(rejectArgs())
    const rowsBeforeFirstAdopt = db.rows.length

    await commitDraftRevision({
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
    const { revisionId } = await recordRejectedRender(
      rejectArgs({ html: null, unusableHtml: '<!DOCTYPE html><html><body>cut off' }),
    )
    expect(db.rows.find((r) => r.id === revisionId)!.exportUrl).toBeNull()

    await expect(
      commitDraftRevision({
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
    const { revisionId: rejectedId, exportKey: rejectedExport } = await recordRejectedRender(rejectArgs())
    db.pendingAction = 'REFINE'

    await expect(
      commitDraftRevision({
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

const STAMP_V2 = { promptVersion: 'pv-v2', fontSet: 'fonts-v2' }

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
  it('currentRenderStamp is the prompt version + the installed font set', () => {
    expect(currentRenderStamp()).toEqual({ promptVersion: PROMPT_VERSION, fontSet: 'fonts-test' })
  })

  it('commitDraftRevision stamps BOTH the new revision row and the draft (caller-supplied export)', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await commitDraftRevision({
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
      draftId: 'd1', instruction: 'el', html: '<html>c</html>', width: 1080, height: 1080, exportKey: 'k', expectedRevisionNumber: 1,
    })
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
  })

  it('recordRejectedRender stamps the rejected row with the values of ITS OWN render, and leaves the draft stamp alone', async () => {
    db.rows = [committed('d1', 1)]
    const { revisionId } = await recordRejectedRender(rejectArgs())
    const row = db.rows.find((r) => r.id === revisionId)!
    expect(row).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
    // The draft's current render did not change, so neither does its stamp.
    const data = db.draftUpdates.at(-1)!.data
    expect('fontSet' in data).toBe(false)
    expect('promptVersion' in data).toBe(false)
  })

  it('a rejected row with no usable document still carries the stamp of the attempt', async () => {
    const { revisionId } = await recordRejectedRender(rejectArgs({ html: null, unusableHtml: '<html>cut' }))
    expect(db.rows.find((r) => r.id === revisionId)).toMatchObject({ fontSet: 'fonts-test', promptVersion: PROMPT_VERSION })
  })
})

describe("F3 restore: the draft takes the restored revision's stamp", () => {
  it('restoreDraftToRevision writes the given stamp onto the draft', async () => {
    db.currentRevisionNumber = 3
    await restoreDraftToRevision('d1', 2, '<html>v2</html>', 'exports/d1-2.png', STAMP_V2)
    expect(db.draftUpdates.at(-1)!.data).toMatchObject({ promptVersion: 'pv-v2', fontSet: 'fonts-v2' })
  })

  it('a legacy (pre-F3) revision nulls the draft stamp: unknown is honest, a stale value is not', async () => {
    db.currentRevisionNumber = 3
    await restoreDraftToRevision(
      'd1', 2, '<html>v2</html>', 'exports/d1-2.png',
      restoredRenderStamp({ promptVersion: null, fontSet: null }, false),
    )
    const data = db.draftUpdates.at(-1)!.data
    expect(data).toHaveProperty('promptVersion', null)
    expect(data).toHaveProperty('fontSet', null)
  })

  it("restoredRenderStamp copies the revision's own values when its stored PNG is reused", () => {
    expect(restoredRenderStamp({ promptVersion: 'pv-old', fontSet: 'fonts-old' }, false)).toEqual({
      promptVersion: 'pv-old',
      fontSet: 'fonts-old',
    })
  })

  it("restoredRenderStamp never lets the CURRENT font set leak onto a reused legacy PNG", () => {
    expect(restoredRenderStamp({ promptVersion: null, fontSet: null }, false)).toEqual({ promptVersion: null, fontSet: null })
  })

  it('a restore that RE-RENDERS (legacy row with no stored PNG) stamps the font set that just rasterized it', () => {
    // The HTML is still the revision's (its prompt version, null if legacy);
    // the pixels are this render's.
    expect(restoredRenderStamp({ promptVersion: null, fontSet: null }, true)).toEqual({
      promptVersion: null,
      fontSet: 'fonts-test',
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
