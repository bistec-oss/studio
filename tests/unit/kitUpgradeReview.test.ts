// 007 AC-15: the review core is host-agnostic. The host here is a plain string
// variable and a callback; no kit, no component, no prisma.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  acceptEdit,
  applyEdit,
  dismissKey,
  initialReviewState,
  locateEdit,
  reviewReducer,
  type ReviewState,
} from '@/lib/kitUpgrade/review'
import type { Edit } from '@/lib/designData/authoring/validate'

const replaceEdit = (quote: string, replacement: string, id = 'a:1'): Edit => ({
  id,
  kind: 'replace',
  quote,
  replacement,
  entryKey: 'logo-clear-space',
  provenance: 'dataset',
  rationale: 'why',
})
const insertEdit = (quote: string, replacement: string, id = 'b:2'): Edit => ({
  ...replaceEdit(quote, replacement, id),
  kind: 'insert',
  entryKey: 'mark-size-match',
})

describe('locateEdit / applyEdit', () => {
  it('locates a quote only when it occurs exactly once', () => {
    expect(locateEdit('a generous b', { quote: 'generous' })).toEqual({ start: 2, end: 10 })
    expect(locateEdit('generous generous', { quote: 'generous' })).toBeNull()
    expect(locateEdit('nothing', { quote: 'generous' })).toBeNull()
    expect(locateEdit('x', { quote: '' })).toBeNull()
  })

  it('replace swaps only the quote, byte for byte around it', () => {
    const text = 'Keep generous clear space around it. Next sentence.'
    expect(
      applyEdit(text, replaceEdit('generous clear space', 'clear space of 2 wordmark letters')),
    ).toBe('Keep clear space of 2 wordmark letters around it. Next sentence.')
  })

  it('insert adds a sentence after the one holding the quote and leaves it unchanged', () => {
    const text = 'Logos need similar heights. Then a second sentence.'
    expect(applyEdit(text, insertEdit('similar heights', 'Match them within 5%.'))).toBe(
      'Logos need similar heights. Match them within 5%. Then a second sentence.',
    )
    // A sentence with no full stop, and a quote in the last sentence.
    expect(applyEdit('Similar heights', insertEdit('Similar heights', 'Match within 5%.'))).toBe(
      'Similar heights. Match within 5%.',
    )
    expect(
      applyEdit(
        'Line one similar heights\nLine two',
        insertEdit('similar heights', 'Match within 5%.'),
      ),
    ).toBe('Line one similar heights. Match within 5%.\nLine two')
  })

  it('an edit that cannot be located leaves the text alone', () => {
    expect(applyEdit('nothing', replaceEdit('generous', 'x'))).toBe('nothing')
  })
})

describe('reviewReducer with a plain string host', () => {
  it('proposed then accept applies the edit to the string via applyEdit', () => {
    let text = 'Keep generous clear space. Logos need similar heights.'
    let state: ReviewState = reviewReducer(initialReviewState, {
      type: 'proposed',
      text,
      edits: [
        replaceEdit('generous clear space', 'clear space of 2 wordmark letters', 'a'),
        insertEdit('similar heights', 'Match within 5%.', 'b'),
      ],
    })
    expect(state.edits.map((e) => e.status)).toEqual(['pending', 'pending'])
    const setText = (t: string) => (text = t)
    const r = acceptEdit(state, 'a', text)
    setText(r.text)
    state = r.state
    expect(text).toBe('Keep clear space of 2 wordmark letters. Logos need similar heights.')
    expect(state.edits.map((e) => e.status)).toEqual(['accepted', 'pending'])
    const r2 = acceptEdit(state, 'b', text)
    expect(r2.text).toBe(
      'Keep clear space of 2 wordmark letters. Logos need similar heights. Match within 5%.',
    )
  })

  it('textChanged marks an edit stale when its quote occurs twice or never; accept of a stale edit is a no-op', () => {
    const text = 'Keep generous clear space.'
    let state = reviewReducer(initialReviewState, {
      type: 'proposed',
      text,
      edits: [replaceEdit('generous clear space', 'x 2px', 'a')],
    })
    state = reviewReducer(state, {
      type: 'textChanged',
      text: `${text} Also generous clear space.`,
    })
    expect(state.edits[0].status).toBe('stale')
    const r = acceptEdit(state, 'a', `${text} Also generous clear space.`)
    expect(r.text).toBe(`${text} Also generous clear space.`)
    expect(r.state).toBe(state)
    expect(reviewReducer(state, { type: 'accept', id: 'a' }).edits[0].status).toBe('stale')
    state = reviewReducer(state, { type: 'textChanged', text: 'Gone entirely.' })
    expect(state.edits[0].status).toBe('stale')
    // The text comes back: the edit is live again.
    state = reviewReducer(state, { type: 'textChanged', text })
    expect(state.edits[0].status).toBe('pending')
  })

  it('an edit proposed against text that no longer has the quote starts stale', () => {
    const state = reviewReducer(initialReviewState, {
      type: 'proposed',
      text: 'changed',
      edits: [replaceEdit('generous', 'x 2px')],
    })
    expect(state.edits[0].status).toBe('stale')
  })

  it('reject, and accepted or rejected edits do not follow the text', () => {
    let state = reviewReducer(initialReviewState, {
      type: 'proposed',
      text: 'a generous b',
      edits: [replaceEdit('generous', 'x 2px', 'a')],
    })
    state = reviewReducer(state, { type: 'reject', id: 'a' })
    expect(state.edits[0].status).toBe('rejected')
    expect(reviewReducer(state, { type: 'textChanged', text: 'nothing' }).edits[0].status).toBe(
      'rejected',
    )
    expect(reviewReducer(state, { type: 'accept', id: 'a' }).edits[0].status).toBe('rejected')
  })

  it('dismiss is keyed by entry key and quote, dropped when the quote is gone, and reset clears it', () => {
    const key = dismissKey('logo-clear-space', 'generous clear space')
    expect(key).not.toBe(dismissKey('canvas-share', 'generous clear space'))
    let state = reviewReducer(initialReviewState, { type: 'dismiss', key })
    expect(state.dismissed.has(key)).toBe(true)
    state = reviewReducer(state, { type: 'textChanged', text: 'still generous clear space here' })
    expect(state.dismissed.has(key)).toBe(true)
    state = reviewReducer(state, { type: 'textChanged', text: 'rewritten' })
    expect(state.dismissed.has(key)).toBe(false)
    state = reviewReducer(reviewReducer(initialReviewState, { type: 'dismiss', key }), {
      type: 'reset',
    })
    expect(state).toEqual(initialReviewState)
  })

  it('does not mutate the previous state', () => {
    const before = reviewReducer(initialReviewState, { type: 'dismiss', key: 'k' })
    reviewReducer(before, { type: 'dismiss', key: 'k2' })
    expect([...before.dismissed]).toEqual(['k'])
  })
})

describe('AC-15 static check: no brand-kit coupling', () => {
  const banned = /from\s*['"](?:@\/lib\/brandkit|@\/components\/admin|@\/lib\/prisma)(?:\/|['"])/
  const dirs = ['src/lib/kitUpgrade', 'src/components/textUpgrade']
  it('imports nothing from brandkit, components/admin or prisma', () => {
    let checked = 0
    for (const d of dirs) {
      const dir = join(process.cwd(), d)
      if (!existsSync(dir)) continue
      for (const f of readdirSync(dir)) {
        expect(readFileSync(join(dir, f), 'utf8'), `${d}/${f}`).not.toMatch(banned)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})
