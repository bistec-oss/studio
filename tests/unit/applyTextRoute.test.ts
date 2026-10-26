// 031 T15 (AC-35, AC-39, AC-40): POST /api/drafts/[id]/apply-text with the store
// and the action lifecycle mocked, and the real pure modules (precheck, splice,
// the verdict). Refusals are 422 and claim nothing; a verdict emits one event
// with no text in it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const m = vi.hoisted(() => ({
  draftFindUnique: vi.fn(),
  claim: vi.fn(),
  start: vi.fn(),
  commit: vi.fn(),
  trackApplied: vi.fn(),
  trackEdited: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { draft: { findUnique: m.draftFindUnique } } }))
vi.mock('@/lib/api/handler', () => {
  const wrap =
    (handler: (req: unknown, ctx: { params: unknown }, user: unknown) => unknown) =>
    (req: unknown, ctx: { params: unknown }) =>
      handler(req, { params: ctx.params }, { userId: 'u1', teamId: 'team1' })
  const parseBody = async (req: Request) => ({ data: await req.json() })
  return { parseBody, withTeamAuth: wrap }
})
vi.mock('@/lib/authz/visibility', () => ({ canAccessContent: () => true }))
vi.mock('@/lib/drafts/draftActions', () => ({ claimDraftAction: m.claim, startDraftAction: m.start }))
vi.mock('@/lib/drafts/revisions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/drafts/revisions')>()),
  commitDraftRevision: m.commit,
}))
vi.mock('@/lib/applyText/track', () => ({ trackTextApplied: m.trackApplied }))
vi.mock('@/lib/renderedText/track', () => ({ trackHeadlineEdited: m.trackEdited }))

const { POST } = await import('@/app/api/drafts/[id]/apply-text/route')
const { RenderRejectedError, RevisionConflictError } = await import('@/lib/drafts/revisions')
const { DraftClaimLostError } = await import('@/lib/drafts/claim')
const { acceptApplyRender } = await import('@/lib/applyText/accept')
const { HeadlineImageNotice } = await import('@/components/drafts/HeadlineImageNotice')

const OLD = 'Old headline here'
const NEW = 'A brand new headline'
const HTML = `<!DOCTYPE html><html><head><title>t</title></head><body><div class="card">MOCK</div><h1>${OLD}</h1></body></html>`
const ctx = { params: { id: 'd1' } }
const CLAIM = { action: 'APPLY_TEXT', claimId: 'c1' }

function draft(over: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    teamId: 'team1',
    status: 'EXPORTED',
    htmlContent: HTML,
    headline: NEW,
    renderedText: { headline: { text: OLD, verified: true } },
    designModel: null,
    designModelSubstitutedFrom: null,
    composition: null,
    postStyle: null,
    brief: { userId: 'u1', teamId: 'team1', campaignId: null, aspectRatio: 'SQUARE' },
    ...over,
  }
}

function call(body: unknown = { field: 'headline' }) {
  return POST(new Request('http://test/x', { method: 'POST', body: JSON.stringify(body) }) as never, ctx as never)
}

// Runs the claimed work like startDraftAction does: a throw is the failure.
let workResult: { ok: true } | { ok: false; message: string } | null
beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  workResult = null
  m.claim.mockResolvedValue(CLAIM)
  m.commit.mockResolvedValue({ revisionId: 'r', exportKey: 'k', revisionNumber: 2 })
  m.start.mockImplementation(async (_d, _u, _t, _c, work: () => Promise<void>) => {
    try {
      await work()
      workResult = { ok: true }
    } catch (e) {
      workResult = { ok: false, message: (e as Error).message }
    }
  })
})

describe('apply-text refusals (FR-38, AC-35)', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['not-stale', { renderedText: { headline: { text: NEW, verified: true } } }],
    ['not-stale', { renderedText: null }],
    ['not-found', { htmlContent: '<html><body><h1>Something else</h1></body></html>' }],
    ['ambiguous', { htmlContent: `<html><body><h1>${OLD}</h1><h2>${OLD}</h2></body></html>` }],
    ['unsafe-element', { htmlContent: `<html><body><h1>${OLD}<img src="x"></h1></body></html>` }],
    ['unsafe-text', { headline: 'Hello __COMPOSITE_0__' }],
    ['new-text-present', { htmlContent: `<html><body><h1>${OLD}</h1><p>${NEW}</p></body></html>` }],
  ]
  for (const [code, over] of cases) {
    it(`${code} returns 422, claims nothing and changes nothing`, async () => {
      m.draftFindUnique.mockResolvedValue(draft(over))
      const res = await call()
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.code).toBe(code)
      expect(typeof body.message).toBe('string')
      expect(m.claim).not.toHaveBeenCalled()
      expect(m.start).not.toHaveBeenCalled()
      expect(m.commit).not.toHaveBeenCalled()
      expect(m.trackApplied).toHaveBeenCalledTimes(1)
      expect(m.trackApplied.mock.calls[0][0]).toMatchObject({ field: 'headline', method: 'splice', failure: code })
      expect(m.trackEdited).not.toHaveBeenCalled()
    })
  }

  it('a draft that is not ready is 409', async () => {
    m.draftFindUnique.mockResolvedValue(draft({ status: 'IN_PROGRESS' }))
    expect((await call()).status).toBe(409)
    expect(m.claim).not.toHaveBeenCalled()
  })
})

describe('apply-text claim and run', () => {
  it('another action running is 409 and emits no event', async () => {
    m.draftFindUnique.mockResolvedValue(draft())
    m.claim.mockResolvedValue(null)
    const res = await call()
    expect(res.status).toBe(409)
    expect(m.start).not.toHaveBeenCalled()
    expect(m.trackApplied).not.toHaveBeenCalled()
  })

  it('202: splices, commits through commitDraftRevision, and emits ok once then headline_edited via apply', async () => {
    m.draftFindUnique.mockResolvedValue(draft())
    const res = await call()
    expect(res.status).toBe(202)
    expect(m.claim).toHaveBeenCalledWith('d1', 'APPLY_TEXT')
    expect(workResult).toEqual({ ok: true })
    expect(m.commit).toHaveBeenCalledTimes(1)
    const args = m.commit.mock.calls[0][0]
    expect(args).toMatchObject({
      draftId: 'd1',
      instruction: 'Apply headline to image',
      claim: CLAIM,
      absentText: OLD,
      checkText: NEW,
      width: 1080,
      height: 1080,
    })
    expect(args.html).toBe(HTML.replace(OLD, NEW))
    expect(typeof args.acceptRender).toBe('function')
    expect(m.trackApplied).toHaveBeenCalledTimes(1)
    expect(m.trackApplied.mock.calls[0][0]).toMatchObject({ field: 'headline', method: 'splice' })
    expect(m.trackApplied.mock.calls[0][0].failure).toBeUndefined()
    expect(m.trackEdited).toHaveBeenCalledTimes(1)
    expect(m.trackEdited.mock.calls[0][0]).toMatchObject({ via: 'apply', draftId: 'd1' })
  })

  const failures: Array<[string, unknown, string]> = [
    ['not-painted', new RenderRejectedError('not-painted'), 'not-painted'],
    ['old-still-painted', new RenderRejectedError('old-still-painted'), 'old-still-painted'],
    ['conflict (claim lost)', new DraftClaimLostError(), 'conflict'],
    ['conflict (revision)', new RevisionConflictError(null), 'conflict'],
    ['render-failed', new Error('boom'), 'render-failed'],
  ]
  for (const [label, err, code] of failures) {
    it(`${label}: one failed event with the code, no headline_edited, released with a sentence`, async () => {
      m.draftFindUnique.mockResolvedValue(draft())
      m.commit.mockRejectedValue(err)
      const res = await call()
      expect(res.status).toBe(202)
      expect(m.trackApplied).toHaveBeenCalledTimes(1)
      expect(m.trackApplied.mock.calls[0][0]).toMatchObject({ failure: code })
      expect(m.trackEdited).not.toHaveBeenCalled()
      expect(workResult).toMatchObject({ ok: false })
      expect((workResult as { message: string }).message).not.toContain(OLD)
      expect((workResult as { message: string }).message.length).toBeGreaterThan(10)
    })
  }

  it('a design or headline change that settled before the claim is a conflict, and nothing is committed', async () => {
    m.draftFindUnique
      .mockResolvedValueOnce(draft())
      .mockResolvedValueOnce(draft({ htmlContent: HTML.replace('MOCK', 'REFINED') }))
    const res = await call()
    expect(res.status).toBe(202)
    expect(m.commit).not.toHaveBeenCalled()
    expect(m.trackApplied).toHaveBeenCalledTimes(1)
    expect(m.trackApplied.mock.calls[0][0]).toMatchObject({ failure: 'conflict' })
    expect(workResult).toMatchObject({ ok: false })
  })

  it('the applied event carries no headline text (NFR-05)', async () => {
    m.draftFindUnique.mockResolvedValue(draft())
    await call()
    const sent = JSON.stringify(m.trackApplied.mock.calls)
    expect(sent).not.toContain(NEW)
    expect(sent).not.toContain(OLD)
  })
})

describe('acceptApplyRender fails closed (FR-40)', () => {
  it('accepts only painted with nothing old left', () => {
    expect(acceptApplyRender({ headlineCheck: 'painted', absentPainted: 0 })).toBeNull()
  })
  it('names each failure', () => {
    expect(acceptApplyRender({ headlineCheck: 'not-visible', absentPainted: 0 })).toBe('not-painted')
    expect(acceptApplyRender({ headlineCheck: 'ambiguous', absentPainted: 0 })).toBe('not-painted')
    expect(acceptApplyRender({ headlineCheck: null, absentPainted: 0 })).toBe('not-painted')
    expect(acceptApplyRender({ headlineCheck: 'painted', absentPainted: 1 })).toBe('old-still-painted')
  })
  it('a check that did not run (null) is render-failed, never accepted', () => {
    expect(acceptApplyRender({ headlineCheck: 'painted', absentPainted: null })).toBe('render-failed')
  })
  it('not-painted wins over a null absent check', () => {
    expect(acceptApplyRender({ headlineCheck: 'not-found', absentPainted: null })).toBe('not-painted')
  })
})

describe('Apply to image button (FR-44)', () => {
  const stale = { state: 'stale', renderedHeadline: OLD, reason: null, scheduledPosts: null } as never
  const props = {
    canEditInline: true,
    canRegenerate: false,
    disabled: false,
    onEditInline: () => {},
    onRegenerateDesign: () => {},
  }

  it('shows with its contextual name only when stale and canApply, and no Beta chip by default', () => {
    const html = renderToStaticMarkup(h(HeadlineImageNotice, { ...props, image: stale, canApply: true, onApply: () => {} }))
    expect(html).toContain('aria-label="Apply the new headline to the image"')
    expect(html).toContain('Apply to image')
    expect(html).not.toContain('apply-beta-chip')
  })
  it('shows the Beta chip when the flag is passed in', () => {
    const html = renderToStaticMarkup(
      h(HeadlineImageNotice, { ...props, image: stale, canApply: true, onApply: () => {}, beta: true }),
    )
    expect(html).toContain('data-testid="apply-beta-chip"')
    expect(html).toContain('Beta')
  })
  it('has no Apply button without canApply, or for an unconfirmed image', () => {
    const noApply = renderToStaticMarkup(h(HeadlineImageNotice, { ...props, image: stale, onApply: () => {} }))
    expect(noApply).not.toContain('Apply the new headline')
    const unconfirmed = { state: 'unconfirmed', renderedHeadline: null, reason: 'not-visible', scheduledPosts: null } as never
    const html = renderToStaticMarkup(
      h(HeadlineImageNotice, { ...props, image: unconfirmed, canApply: true, onApply: () => {} }),
    )
    expect(html).not.toContain('Apply the new headline')
  })
})
