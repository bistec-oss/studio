// 031 T14 (AC-37 unit half): commitDraftRevision's acceptRender, checkText and
// absentText. Prisma, storage and the renderer are mocked; no Chromium.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const state = {
    renderCalls: [] as unknown[][],
    check: 'painted' as string,
    absentPainted: 0,
    uploads: [] as string[],
    deletes: [] as string[],
    creates: [] as Array<{ data: Record<string, unknown> }>,
    draftWrites: [] as Array<Record<string, unknown>>,
    transactions: 0,
  }
  const tx = {
    draftRevision: {
      findFirst: async () => ({ revisionNumber: 4 }),
      create: async (a: { data: Record<string, unknown> }) => {
        state.creates.push(a)
        return { id: 'rev-5' }
      },
      updateMany: async () => ({ count: 0 }),
    },
    draft: {
      update: async (a: { data: Record<string, unknown> }) => {
        state.draftWrites.push(a.data)
        return {}
      },
    },
  }
  const client = {
    draft: { findUnique: async () => ({ headline: 'Stored Headline', brief: { topic: 'Topic' } }) },
    $transaction: async (fn: (t: typeof tx) => unknown) => {
      state.transactions++
      return fn(tx)
    },
  }
  return { state, client }
})

vi.mock('@/lib/prisma', () => ({ prisma: h.client }))
vi.mock('@/lib/renderer/fontSet', () => ({ getFontSetId: () => 'fonts-test' }))
vi.mock('@/lib/renderer/puppeteer', () => ({
  renderPost: async (...args: unknown[]) => {
    h.state.renderCalls.push(args)
    return {
      png: Buffer.from('png'),
      headlineCheck: h.state.check,
      fontsMissing: [],
      absentPainted: h.state.absentPainted,
    }
  },
}))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_EXPORTS: 'exports',
  exportKey: (kind: string, id: string) => `${kind}/${id}.png`,
  uploadObject: async (_b: Buffer, _bucket: string, key: string) => {
    h.state.uploads.push(key)
  },
  deleteObject: async (_bucket: string, key: string) => {
    h.state.deletes.push(key)
  },
}))

import { commitDraftRevision, RenderRejectedError } from '@/lib/drafts/revisions'

const base = { draftId: 'd1', instruction: 'Apply headline to image', html: '<html><body>x</body></html>', width: 1080, height: 1080, composition: null, postStyle: null }

beforeEach(() => {
  Object.assign(h.state, { check: 'painted', absentPainted: 0 })
  for (const k of ['renderCalls', 'uploads', 'deletes', 'creates', 'draftWrites'] as const) h.state[k].length = 0
  h.state.transactions = 0
})

describe('acceptRender (FR-40, AC-37)', () => {
  it('a rejection uploads nothing and writes nothing', async () => {
    const err = await commitDraftRevision({ ...base, acceptRender: () => 'not-painted' }).catch((e) => e)
    expect(err).toBeInstanceOf(RenderRejectedError)
    expect((err as RenderRejectedError).code).toBe('not-painted')
    expect(h.state.uploads).toEqual([])
    expect(h.state.deletes).toEqual([])
    expect(h.state.transactions).toBe(0)
    expect(h.state.creates).toEqual([])
    expect(h.state.draftWrites).toEqual([])
  })

  it('receives the render result, after the render', async () => {
    h.state.absentPainted = 2
    const seen: unknown[] = []
    await commitDraftRevision({
      ...base,
      acceptRender: (r) => {
        seen.push(r)
        return null
      },
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ headlineCheck: 'painted', absentPainted: 2 })
  })

  it('an accepting hook commits, and the stamp is the check result for checkText', async () => {
    const out = await commitDraftRevision({
      ...base,
      checkText: 'Brand New Headline',
      absentText: 'Old Headline',
      acceptRender: () => null,
    })
    expect(out.revisionNumber).toBe(5)
    expect(h.state.uploads).toHaveLength(1)
    // renderPost got the given text and the absent list, not the stored headline
    expect(h.state.renderCalls[0][4]).toEqual({ headline: 'Brand New Headline', absent: ['Old Headline'] })
    expect(h.state.creates[0].data.renderedText).toEqual({
      headline: { text: 'Brand New Headline', verified: true },
    })
    expect(h.state.draftWrites[0].renderedText).toEqual({
      headline: { text: 'Brand New Headline', verified: true },
    })
  })
})

describe('existing callers are unchanged', () => {
  it('no options: the stored headline is checked, with no absent list', async () => {
    await commitDraftRevision(base)
    expect(h.state.renderCalls[0][4]).toEqual({ headline: 'Stored Headline' })
    expect(h.state.creates[0].data.renderedText).toEqual({
      headline: { text: 'Stored Headline', verified: true },
    })
    expect(h.state.uploads).toHaveLength(1)
  })
})
