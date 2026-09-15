// The revision CHAIN boundary: a rejected revision (a refine render the
// verifier threw away, retained out-of-chain with a NEGATIVE revisionNumber —
// migration 20260915140000) must never reach a chain consumer. One test per
// surface: the version-switch list, the restore/Undo lookup AND its URL param,
// next-number allocation, the poll's revision count, and the one deliberate
// exception (the draft-delete sweep, which must stay unfiltered).
//
// Nothing writes rejected=true yet (that is T10), so every case constructs the
// condition itself. Prisma is mocked with a store that actually applies the
// where-clause, so these assert EXCLUSION, not just the shape of a query.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

interface Row {
  id: string
  draftId: string
  revisionNumber: number
  rejected: boolean
  instruction: string
}

const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  txFindFirst: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draftRevision: { findMany: h.findMany, findFirst: h.findFirst },
    $transaction: h.transaction,
  },
}))

const {
  listChainRevisions,
  findChainRevision,
  withNextRevisionNumber,
  parseChainRevisionNumber,
  CHAIN_REVISION_COUNT_FILTER,
} = await import('@/lib/drafts/revisions')

// A draft holding two chain revisions plus one rejected render.
const STORE: Row[] = [
  { id: 'r1', draftId: 'd1', revisionNumber: 1, rejected: false, instruction: 'Original design' },
  { id: 'r2', draftId: 'd1', revisionNumber: 2, rejected: false, instruction: 'Darker background' },
  { id: 'rx', draftId: 'd1', revisionNumber: -1, rejected: true, instruction: 'Add a QR code' },
]

// Minimal where-matcher covering the fields these queries use.
function query(rows: Row[], where: Record<string, unknown> = {}): Row[] {
  return rows.filter(
    (r) =>
      (where.draftId === undefined || r.draftId === where.draftId) &&
      (where.revisionNumber === undefined || r.revisionNumber === where.revisionNumber) &&
      (where.rejected === undefined || r.rejected === where.rejected),
  )
}

function useStore(rows: Row[]) {
  h.findMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
    query(rows, where).sort((a, b) => b.revisionNumber - a.revisionNumber),
  )
  h.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => query(rows, where)[0] ?? null,
  )
  h.txFindFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) =>
      query(rows, where).sort((a, b) => b.revisionNumber - a.revisionNumber)[0] ?? null,
  )
}

beforeEach(() => {
  h.findMany.mockReset()
  h.findFirst.mockReset()
  h.txFindFirst.mockReset()
  h.transaction
    .mockReset()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ draftRevision: { findFirst: h.txFindFirst } }),
    )
  useStore(STORE)
})

// ── Surface: restore / Undo URL parameter ──────────────────────────────────
describe('parseChainRevisionNumber (restore route param)', () => {
  it('accepts a positive chain number', () => {
    expect(parseChainRevisionNumber('1')).toBe(1)
    expect(parseChainRevisionNumber('12')).toBe(12)
  })

  it('REJECTS a negative number — the hole that let a rejected render be restored', () => {
    expect(parseChainRevisionNumber('-1')).toBeNull()
    expect(parseChainRevisionNumber('-42')).toBeNull()
  })

  it('rejects zero, which is not a chain number either', () => {
    expect(parseChainRevisionNumber('0')).toBeNull()
  })

  it('still rejects non-integers and junk', () => {
    expect(parseChainRevisionNumber('1.5')).toBeNull()
    expect(parseChainRevisionNumber('abc')).toBeNull()
    expect(parseChainRevisionNumber('')).toBeNull()
    expect(parseChainRevisionNumber('NaN')).toBeNull()
    expect(parseChainRevisionNumber('Infinity')).toBeNull()
  })
})

// ── Surface: the version-switch list ───────────────────────────────────────
describe('listChainRevisions', () => {
  it('omits the rejected render from the version-switch list', async () => {
    const rows = await listChainRevisions('d1')
    expect(rows.map((r) => r.revisionNumber)).toEqual([2, 1])
    expect(rows.some((r) => r.id === 'rx')).toBe(false)
  })

  it('filters at the query, not in the caller', async () => {
    await listChainRevisions('d1')
    expect(h.findMany.mock.calls[0][0].where).toEqual({ draftId: 'd1', rejected: false })
  })
})

// ── Surface: restore / Undo lookup by number ───────────────────────────────
describe('findChainRevision', () => {
  it('resolves a chain revision by number', async () => {
    expect((await findChainRevision('d1', 2))?.id).toBe('r2')
  })

  it('returns null for a rejected render even when its number is named directly', async () => {
    // The row exists at -1; the filter — not the route guard — is what stops it
    // here, so the two halves of the fix are independently load-bearing.
    expect(await findChainRevision('d1', -1)).toBeNull()
  })
})

// ── Surface: next-number allocation ────────────────────────────────────────
describe('withNextRevisionNumber', () => {
  it('allocates after the last CHAIN revision, ignoring the rejected row', async () => {
    const n = await withNextRevisionNumber('d1', async (_tx, revisionNumber) => revisionNumber)
    expect(n).toBe(3)
  })

  it('allocates 1 on a draft whose only revision is rejected (unfiltered would mint 0)', async () => {
    useStore([STORE[2]])
    const n = await withNextRevisionNumber('d1', async (_tx, revisionNumber) => revisionNumber)
    expect(n).toBe(1)
  })

  it('allocates 1 on a draft with no revisions at all', async () => {
    useStore([])
    const n = await withNextRevisionNumber('d1', async (_tx, revisionNumber) => revisionNumber)
    expect(n).toBe(1)
  })
})

// ── Surface: the poll's revisionCount, and the one exception ───────────────
// These live in a route module that cannot be imported without its auth
// wrappers and a DB, so they are asserted against the source: both the presence
// of the filter and — just as important — its ABSENCE on the delete sweep,
// where adding one would orphan the rejected rows and break the draft delete on
// a foreign key.
const draftRoute = fs.readFileSync(
  path.resolve(__dirname, '../../src/app/api/drafts/[id]/route.ts'),
  'utf8',
)

describe('draft GET revision count', () => {
  it('exposes the chain filter as a relation-count fragment', () => {
    expect(CHAIN_REVISION_COUNT_FILTER).toEqual({ where: { rejected: false } })
  })

  it('counts the chain only', () => {
    expect(draftRoute).toContain('_count: { select: { revisions: CHAIN_REVISION_COUNT_FILTER } }')
  })
})

describe('draft DELETE revision sweep', () => {
  it('stays unfiltered — rejected rows are FK children and must be deleted too', () => {
    expect(draftRoute).toContain('tx.draftRevision.deleteMany({ where: { draftId: draft.id } })')
  })
})
