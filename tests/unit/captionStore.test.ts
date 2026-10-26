// 012 T4 / 016 T2 — the caption store (design §6): the loader (stored rows, and
// a missing registry channel filled), the generation write and the draft-level
// claim. Prisma is mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const h = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  draftUpdateMany: vi.fn(),
  captionFindMany: vi.fn(),
  captionCreateMany: vi.fn(),
  captionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  refresh: vi.fn(),
}))

// 027: the facts check has its own tests; here only its write points are observed.
vi.mock('@/lib/factsCheck/refresh', () => ({ refreshFactsCheck: h.refresh }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUnique: h.draftFindUnique, updateMany: h.draftUpdateMany },
    draftCaption: {
      findMany: h.captionFindMany,
      createMany: h.captionCreateMany,
      updateMany: h.captionUpdateMany,
    },
    $transaction: h.transaction,
  },
}))

const {
  captionRowsFromFields,
  claimCaptionAction,
  loadCaptionTexts,
  loadDraftCaptions,
  saveCaptionEdit,
  saveGenerationCaptions,
  saveHeadlineEdit,
  settleCaptionAction,
  settlePendingCaptions,
} = await import('@/lib/captions/store')

const T = new Date('2026-10-11T00:00:00Z')
// The claim a caption action holds (019): the settle's draft-row guard carries it.
const CLAIM = { action: 'REGENERATE_COPY', claimId: 'tok-1' } as const
const GUARD = { id: 'd1', pendingAction: 'REGENERATE_COPY', pendingActionClaimId: 'tok-1' }
// The settle's own first write is the claim guard; the headline write is the one carrying `headline`.
const headlineWrites = () => h.draftUpdateMany.mock.calls.filter(([a]) => 'headline' in a.data)
const row = (channel: string, text = '', status = 'READY') => ({
  channel,
  text,
  status,
  failureReason: null,
  updatedAt: T,
})

beforeEach(() => {
  for (const fn of Object.values(h)) fn.mockReset()
  // Batch form: each op is the value its builder returned.
  h.transaction.mockImplementation(async (ops: unknown) =>
    typeof ops === 'function' ? ops({ draft: { updateMany: h.draftUpdateMany, findUnique: h.draftFindUnique }, draftCaption: { findMany: h.captionFindMany, updateMany: h.captionUpdateMany } }) : Promise.all(ops as unknown[]),
  )
  h.captionCreateMany.mockResolvedValue({ count: 2 })
  h.draftUpdateMany.mockResolvedValue({ count: 1 })
  h.captionUpdateMany.mockResolvedValue({ count: 1 })
})

describe('loadDraftCaptions (AC-03)', () => {
  it('returns null for an unknown draft', async () => {
    h.draftFindUnique.mockResolvedValue(null)
    expect(await loadDraftCaptions('nope')).toBeNull()
  })

  it('reads the stored rows, in registry order, hides a legacy WHATSAPP row (026 FR-04) and writes nothing', async () => {
    h.draftFindUnique.mockResolvedValue({
      captions: [row('LINKEDIN', 'b'), row('WHATSAPP', 'c', 'PENDING'), row('INSTAGRAM', 'a')],
    })

    const result = await loadDraftCaptions('d1')

    expect(result).toEqual({
      captions: [row('INSTAGRAM', 'a'), row('LINKEDIN', 'b')],
    })
    expect(h.captionCreateMany).not.toHaveBeenCalled()
    expect(h.captionFindMany).not.toHaveBeenCalled()
    expect(h.transaction).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).not.toHaveBeenCalled()
  })

  it('selects the caption rows only — no legacy column is read (016 FR-03)', async () => {
    h.draftFindUnique.mockResolvedValue({ captions: [] })
    h.captionFindMany.mockResolvedValue([])
    await loadDraftCaptions('d1')
    const { where, select } = h.draftFindUnique.mock.calls[0][0]
    expect(where).toEqual({ id: 'd1' })
    expect(Object.keys(select)).toEqual(['captions'])
  })

  it('fills a missing registry channel with an empty READY row, then returns one per channel', async () => {
    h.draftFindUnique.mockResolvedValue({ captions: [row('INSTAGRAM', 'a')] })
    h.captionFindMany.mockResolvedValue([row('LINKEDIN'), row('INSTAGRAM', 'a')])

    const result = await loadDraftCaptions('d1')

    expect(h.captionCreateMany).toHaveBeenCalledWith({
      data: [{ draftId: 'd1', channel: 'LINKEDIN', text: '', status: 'READY' }],
      skipDuplicates: true,
    })
    expect(result?.captions).toEqual([row('INSTAGRAM', 'a'), row('LINKEDIN')])
  })

  it('fills every channel of a draft with no rows, on the client it is given', async () => {
    const db = {
      draft: { findUnique: vi.fn().mockResolvedValue({ captions: [] }) },
      draftCaption: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([row('INSTAGRAM'), row('LINKEDIN')]),
      },
    }
    const result = await loadDraftCaptions('d1', db as never)
    expect(db.draftCaption.createMany).toHaveBeenCalledWith({
      data: ['INSTAGRAM', 'LINKEDIN'].map((channel) => ({ draftId: 'd1', channel, text: '', status: 'READY' })),
      skipDuplicates: true,
    })
    expect(result?.captions).toHaveLength(2)
    expect(h.draftFindUnique).not.toHaveBeenCalled()
  })
})

describe('loadCaptionTexts (017 FR-06)', () => {
  it('runs no query for an empty page', async () => {
    expect(await loadCaptionTexts([])).toEqual(new Map())
    expect(h.captionFindMany).not.toHaveBeenCalled()
  })

  it('reads every draft once, keys by draft and channel, and reads a missing row as empty, writing nothing', async () => {
    h.captionFindMany.mockResolvedValue([
      { draftId: 'd1', channel: 'INSTAGRAM', text: 'a' },
      { draftId: 'd1', channel: 'LINKEDIN', text: 'b' },
    ])

    const texts = await loadCaptionTexts([
      { draftId: 'd1', channel: 'INSTAGRAM' },
      { draftId: 'd1', channel: 'LINKEDIN' },
      { draftId: 'd2', channel: 'INSTAGRAM' },
      { draftId: 'd2', channel: 'LINKEDIN' },
    ])

    expect(h.captionFindMany).toHaveBeenCalledTimes(1)
    expect(h.captionFindMany.mock.calls[0][0].where).toEqual({ draftId: { in: ['d1', 'd2'] } })
    expect(Object.fromEntries(texts)).toEqual({ 'd1/INSTAGRAM': 'a', 'd1/LINKEDIN': 'b', 'd2/INSTAGRAM': '', 'd2/LINKEDIN': '' })
    expect(h.captionCreateMany).not.toHaveBeenCalled()
  })
})

describe('saveGenerationCaptions', () => {
  // 008 FR-08: the model that wrote the reply, and the value it substituted.
  const STAMP = { model: 'claude-haiku-4-5', substitutedFrom: 'OPUS', route: 'API_KEY' }

  it('writes READY text / FAILED-without-text per channel, guarded on PENDING, and the headline only when valid', async () => {
    await saveGenerationCaptions(
      'd1',
      {
        INSTAGRAM: { ok: true, text: 'ig' },
        LINKEDIN: { ok: false, reason: 'empty' },
        HEADLINE: { ok: false, reason: 'missing' },
      },
      STAMP,
    )

    expect(h.transaction).toHaveBeenCalledTimes(1)
    // AC-07: the stamp lands on the ok rows only; the failed row has no text,
    // so it names no model.
    expect(h.captionUpdateMany.mock.calls.map((c) => c[0])).toEqual([
      {
        where: { draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' },
        data: {
          text: 'ig',
          status: 'READY',
          failureReason: null,
          model: 'claude-haiku-4-5',
          modelSubstitutedFrom: 'OPUS',
          route: 'API_KEY',
        },
      },
      {
        where: { draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' },
        data: {
          text: '',
          status: 'FAILED',
          failureReason: 'empty',
          model: null,
          modelSubstitutedFrom: null,
          route: null,
        },
      },
    ])
    // A failed headline writes neither the headline nor its stamp.
    expect(h.draftUpdateMany).not.toHaveBeenCalled()

    h.captionUpdateMany.mockClear()
    await saveGenerationCaptions('d1', { HEADLINE: { ok: true, text: 'Big launch' } }, STAMP)
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: {
        headline: 'Big launch',
        headlineModel: 'claude-haiku-4-5',
        headlineModelSubstitutedFrom: 'OPUS',
        headlineRoute: 'API_KEY',
      },
    })
  })

  it('captionRowsFromFields covers only the channels it was given, stamping the ok ones', () => {
    expect(captionRowsFromFields({ LINKEDIN: { ok: true, text: 'x' } }, STAMP)).toEqual([
      {
        channel: 'LINKEDIN',
        text: 'x',
        status: 'READY',
        failureReason: null,
        model: 'claude-haiku-4-5',
        modelSubstitutedFrom: 'OPUS',
        route: 'API_KEY',
      },
    ])
    expect(captionRowsFromFields({ INSTAGRAM: { ok: false, reason: 'missing' } }, STAMP)).toEqual([
      { channel: 'INSTAGRAM', text: '', status: 'FAILED', failureReason: 'missing', model: null, modelSubstitutedFrom: null, route: null },
    ])
  })
})

describe('claimCaptionAction', () => {
  it('claims REGENERATE_COPY guarded on null and marks only the target channels PENDING', async () => {
    const claim = await claimCaptionAction('d1', ['LINKEDIN', 'HEADLINE'])
    expect(claim).toEqual({ action: 'REGENERATE_COPY', claimId: expect.any(String) })
    // The WHERE is still the empty slot; the data carries the fresh token (019).
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: { id: 'd1', pendingAction: null },
      data: { pendingAction: 'REGENERATE_COPY', pendingActionClaimId: claim!.claimId },
    })
    expect(h.captionUpdateMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', channel: { in: ['LINKEDIN'] } },
      data: { status: 'PENDING' },
    })
  })

  it('touches no row when another action holds the draft', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    expect(await claimCaptionAction('d1', ['INSTAGRAM'])).toBeNull()
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
  })

  it('a headline-only claim marks no row', async () => {
    expect(await claimCaptionAction('d1', ['HEADLINE'])).not.toBeNull()
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
  })

  it('two claims carry different tokens', async () => {
    const a = await claimCaptionAction('d1', ['HEADLINE'])
    const b = await claimCaptionAction('d1', ['HEADLINE'])
    expect(a!.claimId).not.toBe(b!.claimId)
  })
})

// T6 review NOTE 3: the claim takes the same db injection as the store's
// other functions.
describe('claimCaptionAction — db injection', () => {
  it('runs on the injected client, not the global one', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })
    const db = { $transaction: (fn: (tx: unknown) => unknown) => fn({ draft: { updateMany }, draftCaption: { updateMany } }) }
    expect(await claimCaptionAction('d1', ['INSTAGRAM'], db as never)).not.toBeNull()
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(h.transaction).not.toHaveBeenCalled()
  })
})

describe('settleCaptionAction (FR-11, design §5)', () => {
  it('settles only the PENDING target rows, each write guarded on PENDING, per settleCaptionRow', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'old ig' },
      { channel: 'LINKEDIN', text: '' },
      { channel: 'WHATSAPP', text: 'old wa' },
    ])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'], {
      INSTAGRAM: { ok: true, text: 'new ig' },
      LINKEDIN: { ok: false, reason: 'missing' },
      WHATSAPP: { ok: false, reason: 'empty' },
    })

    expect(h.captionFindMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', status: 'PENDING', channel: { in: ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'] } },
      select: { channel: true, text: true },
    })
    expect(h.captionUpdateMany.mock.calls.map(([a]) => a)).toEqual([
      {
        where: { draftId: 'd1', channel: 'INSTAGRAM', status: 'PENDING' },
        data: { status: 'READY', text: 'new ig', failureReason: null },
      },
      {
        where: { draftId: 'd1', channel: 'LINKEDIN', status: 'PENDING' },
        data: { status: 'FAILED', text: '', failureReason: 'missing' },
      },
      {
        // A7: good text survives a failed regenerate.
        where: { draftId: 'd1', channel: 'WHATSAPP', status: 'PENDING' },
        data: { status: 'READY', text: 'old wa', failureReason: 'Regenerate failed: empty' },
      },
    ])
    // The draft-row guard comes first (NFR-04), then no headline was requested.
    expect(h.draftUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.draftUpdateMany).toHaveBeenCalledWith({ where: GUARD, data: { updatedAt: expect.any(Date) } })
    expect(h.draftUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(h.captionFindMany.mock.invocationCallOrder[0])
    expect(headlineWrites()).toHaveLength(0)
  })

  it('writes a validated headline, guarded on the caption claim; a failed one changes nothing', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: true, text: 'New line' } })
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: GUARD,
      data: { headline: 'New line' },
    })

    h.draftUpdateMany.mockClear()
    await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: false, reason: 'empty' } })
    expect(headlineWrites()).toHaveLength(0)
  })

  it('reports the headline write and the value before it (030 FR-15)', async () => {
    h.captionFindMany.mockResolvedValue([])
    h.draftFindUnique.mockResolvedValue({ headline: 'Before' })
    expect(await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: true, text: 'New line' } })).toEqual({
      headlineWritten: true,
      headlineBefore: 'Before',
    })
    // The value is read in the transaction, before the write.
    expect(h.draftFindUnique.mock.invocationCallOrder[0]).toBeLessThan(h.draftUpdateMany.mock.invocationCallOrder.at(-1)!)
  })

  it('reports no headline write for a failed or unrequested headline, and for a lost claim', async () => {
    h.captionFindMany.mockResolvedValue([])
    const none = { headlineWritten: false, headlineBefore: null }
    expect(await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: false, reason: 'empty' } })).toEqual(none)
    expect(await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { HEADLINE: { ok: true, text: 'Sneaky' } })).toEqual(none)
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: true, text: 'New line' } })).toEqual(none)
    warn.mockRestore()
  })

  it('never writes a headline that was not requested, even if the reply carried one', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { HEADLINE: { ok: true, text: 'Sneaky' } })
    expect(headlineWrites()).toHaveLength(0)
  })
})

// 019 FR-04 / AC-03: a settle whose claim was swept and superseded writes
// nothing, even when the superseding claim is for the same action. A stateful
// fake: R2's claim re-marks the rows PENDING under its own token.
describe('settleCaptionAction: a late settle is a no-op (019 AC-03)', () => {
  const STALE = { action: 'REGENERATE_COPY', claimId: 'tok-1' } as const
  const LIVE = { action: 'REGENERATE_COPY', claimId: 'tok-2' } as const

  function install(heldToken: string) {
    const draft = { pendingAction: 'REGENERATE_COPY', pendingActionClaimId: heldToken, headline: 'old headline' }
    const rows = [
      { channel: 'INSTAGRAM', text: 'r2 ig', status: 'PENDING', failureReason: null as string | null },
      { channel: 'LINKEDIN', text: 'r2 li', status: 'PENDING', failureReason: null as string | null },
    ]
    h.draftUpdateMany.mockImplementation(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.pendingAction !== draft.pendingAction || where.pendingActionClaimId !== draft.pendingActionClaimId) {
        return { count: 0 }
      }
      if ('headline' in data) draft.headline = data.headline as string
      return { count: 1 }
    })
    h.captionFindMany.mockImplementation(async () => rows.filter((r) => r.status === 'PENDING').map(({ channel, text }) => ({ channel, text })))
    h.captionUpdateMany.mockImplementation(async ({ where, data }: { where: { channel: string }; data: Record<string, unknown> }) => {
      const row = rows.find((r) => r.channel === where.channel && r.status === 'PENDING')
      if (!row) return { count: 0 }
      Object.assign(row, data)
      return { count: 1 }
    })
    return { draft, rows }
  }

  it('success fields from the superseded run leave the rows PENDING with the new run text, and the headline', async () => {
    const { draft, rows } = install('tok-2')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await settleCaptionAction(
      'd1',
      STALE,
      ['INSTAGRAM', 'LINKEDIN', 'HEADLINE'],
      { INSTAGRAM: { ok: true, text: 'stale ig' }, LINKEDIN: { ok: true, text: 'stale li' }, HEADLINE: { ok: true, text: 'stale h' } },
      { model: 'm', substitutedFrom: null, route: null },
    )
    expect(rows.map((r) => [r.status, r.text])).toEqual([['PENDING', 'r2 ig'], ['PENDING', 'r2 li']])
    expect(draft.headline).toBe('old headline')
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).not.toContain('tok-')
    warn.mockRestore()
  })

  it('failure fields from the superseded run leave the rows PENDING too', async () => {
    const { rows } = install('tok-2')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await settleCaptionAction('d1', STALE, ['INSTAGRAM', 'LINKEDIN'], {
      INSTAGRAM: { ok: false, reason: 'boom' },
      LINKEDIN: { ok: false, reason: 'boom' },
    })
    expect(rows.map((r) => [r.status, r.text, r.failureReason])).toEqual([
      ['PENDING', 'r2 ig', null],
      ['PENDING', 'r2 li', null],
    ])
    warn.mockRestore()
  })

  it('the live claim settles the rows and the headline', async () => {
    const { draft, rows } = install('tok-2')
    await settleCaptionAction('d1', LIVE, ['INSTAGRAM', 'LINKEDIN', 'HEADLINE'], {
      INSTAGRAM: { ok: true, text: 'new ig' },
      LINKEDIN: { ok: true, text: 'new li' },
      HEADLINE: { ok: true, text: 'new h' },
    })
    expect(rows.map((r) => [r.status, r.text])).toEqual([['READY', 'new ig'], ['READY', 'new li']])
    expect(draft.headline).toBe('new h')
  })
})

describe('settlePendingCaptions (the stale sweep)', () => {
  it('settles every PENDING row of the draft as failed with the sweep reason, keeping text', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'kept' },
      { channel: 'LINKEDIN', text: '' },
    ])
    await settlePendingCaptions('d1', 'Generation was interrupted. Please retry.')
    expect(h.captionFindMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', status: 'PENDING' },
      select: { channel: true, text: true },
    })
    expect(h.captionUpdateMany.mock.calls.map(([a]) => a.data)).toEqual([
      { status: 'READY', text: 'kept', failureReason: 'Regenerate failed: Generation was interrupted. Please retry.' },
      { status: 'FAILED', text: '', failureReason: 'Generation was interrupted. Please retry.' },
    ])
  })
})

describe('saveCaptionEdit / saveHeadlineEdit (FR-12)', () => {
  it('stores the text exactly as typed, READY, failure cleared, refused on a PENDING row', async () => {
    expect(await saveCaptionEdit('d1', 'LINKEDIN', '  **as typed**  ')).toBe(true)
    expect(h.captionUpdateMany).toHaveBeenCalledWith({
      where: { draftId: 'd1', channel: 'LINKEDIN', status: { not: 'PENDING' } },
      data: { text: '  **as typed**  ', status: 'READY', failureReason: null },
    })
    h.captionUpdateMany.mockResolvedValue({ count: 0 })
    expect(await saveCaptionEdit('d1', 'LINKEDIN', 'x')).toBe(false)
  })

  it('saves the headline only while no caption action or generation may be writing it', async () => {
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(true)
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'd1',
        status: { not: 'IN_PROGRESS' },
        OR: [{ pendingAction: null }, { pendingAction: { not: 'REGENERATE_COPY' } }],
      },
      data: { headline: 'Line' },
    })
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(false)
  })
})

// ── 008 T7 (FR-08, AC-07): the caption action's stamp writes ─────────────────

describe('008 FR-08: settleCaptionAction stamps validated fields only', () => {
  const STAMP = { model: 'claude-sonnet-5-5', substitutedFrom: 'claude-opus-5-5', route: 'CLI' }
  const STAMP_FIELDS = ['model', 'modelSubstitutedFrom', 'route', 'headlineModel', 'headlineModelSubstitutedFrom', 'headlineRoute']

  it('an ok field gets the new stamp; a failed field writes no stamp field, so the row keeps its own', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'old ig' },
      { channel: 'LINKEDIN', text: '' },
      { channel: 'WHATSAPP', text: 'old wa' },
    ])
    await settleCaptionAction(
      'd1',
      CLAIM,
      ['INSTAGRAM', 'LINKEDIN', 'WHATSAPP'],
      {
        INSTAGRAM: { ok: true, text: 'new ig' },
        LINKEDIN: { ok: false, reason: 'missing' },
        WHATSAPP: { ok: false, reason: 'empty' },
      },
      STAMP,
    )
    const data = h.captionUpdateMany.mock.calls.map(([a]) => a.data)
    expect(data[0]).toEqual({
      status: 'READY',
      text: 'new ig',
      failureReason: null,
      model: 'claude-sonnet-5-5',
      modelSubstitutedFrom: 'claude-opus-5-5',
      route: 'CLI',
    })
    // The FAILED (no text) and the kept-text rows: no stamp key at all.
    for (const d of data.slice(1)) for (const k of STAMP_FIELDS) expect(d).not.toHaveProperty(k)
    expect(data[2]).toEqual({ status: 'READY', text: 'old wa', failureReason: 'Regenerate failed: empty' })
  })

  it('a validated headline writes headlineModel in the same claim-guarded update; a failed one writes nothing', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: true, text: 'New line' } }, STAMP)
    expect(h.draftUpdateMany).toHaveBeenCalledWith({
      where: GUARD,
      data: {
        headline: 'New line',
        headlineModel: 'claude-sonnet-5-5',
        headlineModelSubstitutedFrom: 'claude-opus-5-5',
        headlineRoute: 'CLI',
      },
    })
    h.draftUpdateMany.mockClear()
    await settleCaptionAction('d1', CLAIM, ['HEADLINE'], { HEADLINE: { ok: false, reason: 'empty' } }, STAMP)
    expect(headlineWrites()).toHaveLength(0)
  })

  it('the failure settles (no stamp: onError, an unstarted run) and the stale sweep never write a stamp field', async () => {
    h.captionFindMany.mockResolvedValue([
      { channel: 'INSTAGRAM', text: 'kept' },
      { channel: 'LINKEDIN', text: '' },
    ])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM', 'LINKEDIN'], {
      INSTAGRAM: { ok: false, reason: 'boom' },
      LINKEDIN: { ok: false, reason: 'boom' },
    })
    await settlePendingCaptions('d1', 'Generation was interrupted. Please retry.')
    expect(h.captionUpdateMany).toHaveBeenCalledTimes(4)
    for (const [a] of h.captionUpdateMany.mock.calls) {
      for (const k of STAMP_FIELDS) expect(a.data).not.toHaveProperty(k)
    }
  })

  it('without a stamp, even an ok field writes no stamp field (the pre-008 shape)', async () => {
    h.captionFindMany.mockResolvedValue([{ channel: 'INSTAGRAM', text: 'x' }])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'y' } })
    expect(h.captionUpdateMany.mock.calls[0][0].data).not.toHaveProperty('model')
  })
})

describe('008 A6: a user edit writes no stamp field', () => {
  const STAMP_FIELDS = ['model', 'modelSubstitutedFrom', 'headlineModel', 'headlineModelSubstitutedFrom']

  it('saveCaptionEdit and saveHeadlineEdit leave every stamp column untouched', async () => {
    await saveCaptionEdit('d1', 'LINKEDIN', 'typed')
    await saveHeadlineEdit('d1', 'typed')
    const writes = [...h.captionUpdateMany.mock.calls, ...h.draftUpdateMany.mock.calls].map(([a]) => a.data)
    expect(writes).toHaveLength(2)
    for (const d of writes) for (const k of STAMP_FIELDS) expect(d).not.toHaveProperty(k)
  })
})

describe('008 FR-09: loadDraftCaptions exposes each row stamp', () => {
  it('selects model and modelSubstitutedFrom with the row (the regenerate stamp tier reads them)', async () => {
    h.draftFindUnique.mockResolvedValue({
      captions: ['INSTAGRAM', 'LINKEDIN'].map((c) => ({
        ...row(c, 't'),
        model: c === 'LINKEDIN' ? 'claude-opus-5-5' : null,
        modelSubstitutedFrom: null,
      })),
    })
    const loaded = await loadDraftCaptions('d1')
    const select = h.draftFindUnique.mock.calls[0][0].select.captions.select
    expect(select).toMatchObject({ model: true, modelSubstitutedFrom: true })
    expect(loaded!.captions.map((c) => c.model)).toEqual([null, 'claude-opus-5-5'])
  })
})

// ── 027 FR-05 / FR-11 (AC-04, AC-11): the facts-check write points and the
// regenerate-copy stamp ─────────────────────────────────────────────────────

describe('027 FR-11: the interactive writers recompute the facts check after their write', () => {
  it('saveGenerationCaptions: once, after the transaction, on the default client', async () => {
    await saveGenerationCaptions('d1', { INSTAGRAM: { ok: true, text: 'ig' } }, { model: 'm', substitutedFrom: null, route: null })
    expect(h.refresh).toHaveBeenCalledTimes(1)
    expect(h.refresh).toHaveBeenCalledWith('d1', {})
    expect(h.refresh.mock.invocationCallOrder[0]).toBeGreaterThan(h.transaction.mock.invocationCallOrder[0])
  })

  it('settleCaptionAction: after the transaction when the claim held', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'x' } })
    expect(h.refresh).toHaveBeenCalledTimes(1)
    expect(h.refresh).toHaveBeenCalledWith('d1', {})
    expect(h.refresh.mock.invocationCallOrder[0]).toBeGreaterThan(h.draftUpdateMany.mock.invocationCallOrder[0])
  })

  it('settleCaptionAction: a lost claim writes nothing and recomputes nothing', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'x' } })
    expect(h.refresh).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('saveCaptionEdit and saveHeadlineEdit: after a successful write only', async () => {
    expect(await saveCaptionEdit('d1', 'LINKEDIN', 'typed')).toBe(true)
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(true)
    expect(h.refresh).toHaveBeenCalledTimes(2)
    h.refresh.mockClear()
    h.captionUpdateMany.mockResolvedValue({ count: 0 })
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    expect(await saveCaptionEdit('d1', 'LINKEDIN', 'x')).toBe(false)
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(false)
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('a client the caller supplies is the one the recompute reads from', async () => {
    const db = { draftCaption: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } }
    await saveCaptionEdit('d1', 'LINKEDIN', 'typed', db as never)
    expect(h.refresh).toHaveBeenCalledWith('d1', { db })
  })

  it('a recompute that throws (it should not) never changes the caption write’s result', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.refresh.mockRejectedValue(new Error('boom'))
    expect(await saveCaptionEdit('d1', 'LINKEDIN', 'typed')).toBe(true)
    expect(await saveHeadlineEdit('d1', 'Line')).toBe(true)
    err.mockRestore()
  })
})

describe('027 FR-05: regenerate copy writes Draft.postStyle in its claim-guarded settle write', () => {
  const STYLE = { key: 'promotion', version: 1, revision: 8 }

  it('the stamp rides the guard write, the first draft write of the transaction', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'x' } }, null, undefined, STYLE)
    expect(h.draftUpdateMany.mock.calls[0][0]).toEqual({
      where: GUARD,
      data: { updatedAt: expect.any(Date), postStyle: STYLE },
    })
  })

  it('a brief with no style clears it (SQL NULL); the failure settles pass none and leave it alone', async () => {
    h.captionFindMany.mockResolvedValue([])
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'x' } }, null, undefined, null)
    expect(h.draftUpdateMany.mock.calls[0][0].data.postStyle).toBe(Prisma.DbNull)
    h.draftUpdateMany.mockClear()
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: false, reason: 'boom' } })
    expect(h.draftUpdateMany.mock.calls[0][0].data).not.toHaveProperty('postStyle')
  })

  it('a lost claim writes no stamp (the guard write matches no row)', async () => {
    h.draftUpdateMany.mockResolvedValue({ count: 0 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await settleCaptionAction('d1', CLAIM, ['INSTAGRAM'], { INSTAGRAM: { ok: true, text: 'x' } }, null, undefined, STYLE)
    expect(h.draftUpdateMany).toHaveBeenCalledTimes(1)
    expect(h.captionUpdateMany).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
