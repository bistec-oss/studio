// 030 T1: the pure rendered-text module (FR-02, FR-03, FR-08 to FR-11, FR-13, FR-14).
import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { HEADLINE_MAX } from '@/lib/captions/headline'
import {
  HEADLINE_CHECKS,
  HEADLINE_STATES,
  UNVERIFIED_REASONS,
  NORMALISE_HEADLINE_SOURCE,
  MOCK_HEADLINE_HIDDEN,
  evaluateHeadlineFacts,
  formatScheduledDate,
  headlineImageFor,
  headlineNoticeText,
  headlineState,
  mockHeadlineCheck,
  normaliseHeadline,
  parseRenderedText,
  publishLineFor,
  renderedTextColumn,
  renderedTextSchema,
  stampFromCheck,
  type CandidateFacts,
  type RenderedText,
} from '@/lib/renderedText'

describe('vocabularies (FR-03)', () => {
  it('lists the closed vocabularies', () => {
    expect([...HEADLINE_STATES]).toEqual(['fresh', 'stale', 'unconfirmed', 'unknown'])
    expect([...UNVERIFIED_REASONS]).toEqual([
      'not-found',
      'ambiguous',
      'not-visible',
      'not-checked',
    ])
    expect([...HEADLINE_CHECKS]).toEqual(['painted', ...UNVERIFIED_REASONS])
  })
})

describe('normaliseHeadline (FR-09)', () => {
  const rebuilt = new Function('return ' + NORMALISE_HEADLINE_SOURCE)() as (s: string) => string
  const samples = [
    'Hello World',
    'HeLLo   wOrLd',
    'a b',
    'line one\nline two',
    'a b',
    'a b',
    '  padded  ',
    'café',
    'café',
    'සිංහල අවුරුදු',
  ]

  it('rebuilt from its source it behaves identically', () => {
    for (const s of samples) expect(rebuilt(s)).toBe(normaliseHeadline(s))
  })

  it('folds case, whitespace and Unicode form', () => {
    expect(normaliseHeadline('  Hello \n World  ')).toBe('hello world')
    expect(normaliseHeadline('café')).toBe(normaliseHeadline('café'))
  })
})

describe('the stamp (FR-02, AC-02)', () => {
  it('accepts a verified and an unverified entry', () => {
    expect(renderedTextSchema.safeParse({ headline: { text: 'Hi', verified: true } }).success).toBe(
      true,
    )
    expect(
      renderedTextSchema.safeParse({
        headline: { text: 'Hi', verified: false, reason: 'not-found' },
      }).success,
    ).toBe(true)
    expect(renderedTextSchema.safeParse({}).success).toBe(true)
  })

  it('refuses the malformed shapes', () => {
    const bad = [
      { headline: { text: 'Hi', verified: true, reason: 'not-found' } },
      { headline: { text: 'Hi', verified: false } },
      { headline: { text: 'Hi', verified: false, reason: 'made-up' } },
      { headline: { text: 'x'.repeat(HEADLINE_MAX + 1), verified: true } },
      { headline: { text: 'Hi', verified: true }, other: 1 },
    ]
    for (const b of bad) expect(renderedTextSchema.safeParse(b).success).toBe(false)
  })

  it('reads an unparsable stored value as null', () => {
    expect(parseRenderedText(null)).toBeNull()
    expect(parseRenderedText('nope')).toBeNull()
    expect(parseRenderedText({ headline: { text: 'Hi', verified: false } })).toBeNull()
    expect(parseRenderedText({ headline: { text: 'Hi', verified: true } })).toEqual({
      headline: { text: 'Hi', verified: true },
    })
  })

  it('renderedTextColumn gives DbNull for null and throws on a bad stamp', () => {
    expect(renderedTextColumn(null)).toBe(Prisma.DbNull)
    expect(renderedTextColumn({ headline: { text: 'Hi', verified: true } })).toEqual({
      headline: { text: 'Hi', verified: true },
    })
    expect(() =>
      renderedTextColumn({ headline: { text: 'Hi', verified: false } } as unknown as RenderedText),
    ).toThrow()
  })

  it('stampFromCheck maps the outcome and cuts the text', () => {
    expect(stampFromCheck('Hi', 'painted')).toEqual({ headline: { text: 'Hi', verified: true } })
    for (const reason of UNVERIFIED_REASONS) {
      expect(stampFromCheck('Hi', reason)).toEqual({
        headline: { text: 'Hi', verified: false, reason },
      })
    }
    expect(stampFromCheck('x'.repeat(HEADLINE_MAX + 50), 'painted').headline?.text).toHaveLength(
      HEADLINE_MAX,
    )
    expect(() => renderedTextColumn(stampFromCheck('x'.repeat(500), 'ambiguous'))).not.toThrow()
  })
})

describe('evaluateHeadlineFacts (FR-07, FR-08, AC-05)', () => {
  const canvas = { width: 1080, height: 1080 }
  const box = { left: 100, top: 100, width: 400, height: 80 }
  const good = (): CandidateFacts => ({
    visible: true,
    rects: [{ left: 120, top: 110, width: 300, height: 50 }],
    clipBoxes: [box],
    topmost: [true],
  })

  it('not-found with no candidate', () => {
    expect(evaluateHeadlineFacts({ candidates: [] }, canvas)).toBe('not-found')
  })

  it('painted with one painted candidate', () => {
    expect(evaluateHeadlineFacts({ candidates: [good()] }, canvas)).toBe('painted')
  })

  it('ambiguous with two painted candidates', () => {
    expect(evaluateHeadlineFacts({ candidates: [good(), good()] }, canvas)).toBe('ambiguous')
  })

  it('a hidden duplicate does not make it ambiguous (A3)', () => {
    expect(
      evaluateHeadlineFacts({ candidates: [good(), { ...good(), visible: false }] }, canvas),
    ).toBe('painted')
  })

  it('not-visible when no candidate is painted', () => {
    expect(evaluateHeadlineFacts({ candidates: [{ ...good(), visible: false }] }, canvas)).toBe(
      'not-visible',
    )
  })

  it('each FR-08 condition alone turns painted into not-visible', () => {
    const cases: Record<string, CandidateFacts> = {
      hidden: { ...good(), visible: false },
      'empty box': { ...good(), rects: [] },
      'outside the canvas': {
        ...good(),
        rects: [{ left: 1000, top: 110, width: 300, height: 50 }],
      },
      'below the canvas': { ...good(), rects: [{ left: 120, top: 1060, width: 300, height: 50 }] },
      'clipped by an ancestor': {
        ...good(),
        clipBoxes: [{ left: 100, top: 100, width: 100, height: 80 }],
      },
      'covered at a line centre': { ...good(), topmost: [true, false] },
    }
    for (const [name, c] of Object.entries(cases)) {
      expect(evaluateHeadlineFacts({ candidates: [c] }, canvas), name).toBe('not-visible')
    }
  })

  it('allows 1 px of tolerance and no more', () => {
    const edge = (left: number): CandidateFacts => ({
      ...good(),
      clipBoxes: [],
      rects: [{ left, top: 110, width: 300, height: 50 }],
    })
    expect(evaluateHeadlineFacts({ candidates: [edge(-1)] }, canvas)).toBe('painted')
    expect(evaluateHeadlineFacts({ candidates: [edge(-1.5)] }, canvas)).toBe('not-visible')
  })

  it('applies the tolerance on the right and bottom canvas edges and on a clip box', () => {
    const at = (left: number, top: number, clip?: typeof box): CandidateFacts => ({
      ...good(),
      clipBoxes: clip ? [clip] : [],
      rects: [{ left, top, width: 300, height: 50 }],
    })
    // right edge: left + 300 = 1081 passes, 1081.5 fails
    expect(evaluateHeadlineFacts({ candidates: [at(781, 110)] }, canvas)).toBe('painted')
    expect(evaluateHeadlineFacts({ candidates: [at(781.5, 110)] }, canvas)).toBe('not-visible')
    // bottom edge: top + 50 = 1081 passes, 1081.5 fails
    expect(evaluateHeadlineFacts({ candidates: [at(120, 1031)] }, canvas)).toBe('painted')
    expect(evaluateHeadlineFacts({ candidates: [at(120, 1031.5)] }, canvas)).toBe('not-visible')
    // clip box 120..420 x 110..160: sticking out by exactly 1 px passes, 1.5 fails
    const clip = { left: 121, top: 110, width: 299, height: 50 }
    expect(evaluateHeadlineFacts({ candidates: [at(120, 110, clip)] }, canvas)).toBe('painted')
    const tight = { left: 121.5, top: 110, width: 298.5, height: 50 }
    expect(evaluateHeadlineFacts({ candidates: [at(120, 110, tight)] }, canvas)).toBe('not-visible')
  })
})

describe('mockHeadlineCheck (FR-10)', () => {
  const wrap = (body: string, head = '') =>
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

  it('painted for plain text', () => {
    expect(mockHeadlineCheck(wrap('<h1>Big Launch</h1>'), 'Big Launch')).toBe('painted')
  })

  it('painted when the text is split by tags', () => {
    expect(mockHeadlineCheck(wrap('<h1>Big <span>Launch</span></h1>'), 'Big Launch')).toBe(
      'painted',
    )
    expect(mockHeadlineCheck(wrap('<h1>Big<br>Launch</h1>'), 'Big Launch')).toBe('painted')
  })

  it('not-found when it is only in <title> or a script or a comment', () => {
    expect(mockHeadlineCheck(wrap('<p>other</p>', '<title>Big Launch</title>'), 'Big Launch')).toBe(
      'not-found',
    )
    expect(
      mockHeadlineCheck(
        wrap('<script>var a = "Big Launch"</script><!-- Big Launch -->'),
        'Big Launch',
      ),
    ).toBe('not-found')
  })

  it('ambiguous when shown twice', () => {
    expect(
      mockHeadlineCheck(wrap('<h1>Big Launch</h1><footer>Big Launch</footer>'), 'Big Launch'),
    ).toBe('ambiguous')
  })

  it('not-visible when the sentinel is present', () => {
    expect(
      mockHeadlineCheck(wrap(`<h1>Big Launch</h1><!-- ${MOCK_HEADLINE_HIDDEN} -->`), 'Big Launch'),
    ).toBe('not-visible')
  })

  it('decodes entities and ignores case', () => {
    expect(
      mockHeadlineCheck(wrap('<h1>Fish &amp; Chips&nbsp;Night</h1>'), 'fish & chips night'),
    ).toBe('painted')
    expect(
      mockHeadlineCheck(wrap('<h1>It&#39;s &quot;on&quot; &lt;now&gt;</h1>'), 'It\'s "on" <now>'),
    ).toBe('painted')
  })

  it('does not match inside a longer word', () => {
    expect(mockHeadlineCheck(wrap('<h1>Big Launches</h1>'), 'Big Launch')).toBe('not-found')
  })

  it('an empty headline is not-found', () => {
    expect(mockHeadlineCheck(wrap('<h1>x</h1>'), '   ')).toBe('not-found')
  })
})

describe('headlineState (FR-11, AC-09)', () => {
  const verified = (text: string): RenderedText => ({ headline: { text, verified: true } })

  it('unknown for a null stamp, a stamp with no headline key and a null headline', () => {
    expect(headlineState(null, 'Hi')).toBe('unknown')
    expect(headlineState({}, 'Hi')).toBe('unknown')
    expect(headlineState(verified('Hi'), null)).toBe('unknown')
    expect(headlineState(null, null)).toBe('unknown')
  })

  it('unconfirmed for an unverified stamp whatever the text', () => {
    const u: RenderedText = { headline: { text: 'Hi', verified: false, reason: 'ambiguous' } }
    expect(headlineState(u, 'Hi')).toBe('unconfirmed')
    expect(headlineState(u, 'Other')).toBe('unconfirmed')
  })

  it('fresh for equal, case-only and whitespace-only differences', () => {
    expect(headlineState(verified('Big Launch'), 'Big Launch')).toBe('fresh')
    expect(headlineState(verified('Big Launch'), 'BIG LAUNCH')).toBe('fresh')
    expect(headlineState(verified('Big Launch'), '  big  launch\n')).toBe('fresh')
  })

  it('stale otherwise', () => {
    expect(headlineState(verified('Big Launch'), 'Bigger Launch')).toBe('stale')
  })
})

describe('headlineImageFor (FR-12)', () => {
  const sched = { count: 2, nextAt: '2026-11-03T09:00:00.000Z' }

  it('fills only the fields each state names', () => {
    expect(headlineImageFor({ headline: { text: 'Old', verified: true } }, 'New', sched)).toEqual({
      state: 'stale',
      renderedHeadline: 'Old',
      reason: null,
      scheduledPosts: sched,
    })
    expect(
      headlineImageFor(
        { headline: { text: 'Old', verified: false, reason: 'not-found' } },
        'New',
        sched,
      ),
    ).toEqual({
      state: 'unconfirmed',
      renderedHeadline: null,
      reason: 'not-found',
      scheduledPosts: sched,
    })
    expect(headlineImageFor({ headline: { text: 'Same', verified: true } }, 'same', sched)).toEqual(
      {
        state: 'fresh',
        renderedHeadline: null,
        reason: null,
        scheduledPosts: null,
      },
    )
    expect(headlineImageFor(null, 'New', sched)).toEqual({
      state: 'unknown',
      renderedHeadline: null,
      reason: null,
      scheduledPosts: null,
    })
  })
})

describe('notice text (FR-13, FR-14)', () => {
  it('the stale line quotes the rendered headline', () => {
    const n = headlineNoticeText({
      state: 'stale',
      renderedHeadline: 'Old one',
      reason: null,
      scheduledPosts: null,
    })
    expect(n).toEqual({
      headline: 'The image still shows the previous headline “Old one”.',
      reasonLine: null,
      scheduledLine: null,
    })
  })

  it('the unconfirmed line carries one fixed sentence per reason', () => {
    const lines = {
      'not-found': 'The design does not contain it as one piece of text.',
      ambiguous: 'The design shows it more than once.',
      'not-visible': 'It is in the design but hidden, clipped or covered.',
      'not-checked': 'The check could not run.',
    } as const
    for (const reason of UNVERIFIED_REASONS) {
      const n = headlineNoticeText({
        state: 'unconfirmed',
        renderedHeadline: null,
        reason,
        scheduledPosts: null,
      })
      expect(n?.headline).toBe("We couldn't confirm that the image shows the current headline.")
      expect(n?.reasonLine).toBe(lines[reason])
    }
  })

  it('resolves the plural of the scheduled line', () => {
    const one = headlineNoticeText({
      state: 'stale',
      renderedHeadline: 'Old',
      reason: null,
      scheduledPosts: { count: 1, nextAt: '2026-11-03T09:00:00.000Z' },
    })
    expect(one?.scheduledLine).toBe(
      '1 scheduled post will publish this image, the next on 3 Nov 2026.',
    )
    const two = headlineNoticeText({
      state: 'unconfirmed',
      renderedHeadline: null,
      reason: 'not-found',
      scheduledPosts: { count: 2, nextAt: '2026-12-25T23:30:00.000Z' },
    })
    expect(two?.scheduledLine).toBe(
      '2 scheduled posts will publish this image, the next on 25 Dec 2026.',
    )
  })

  it('shows nothing for fresh and unknown', () => {
    for (const state of ['fresh', 'unknown'] as const) {
      expect(
        headlineNoticeText({ state, renderedHeadline: null, reason: null, scheduledPosts: null }),
      ).toBeNull()
      expect(publishLineFor(state)).toBeNull()
    }
  })

  it('the publish lines', () => {
    expect(publishLineFor('stale')).toBe('The image shows an older headline.')
    expect(publishLineFor('unconfirmed')).toBe(
      "We couldn't confirm the image shows the current headline.",
    )
  })

  it('formats the date in UTC, locale-free', () => {
    expect(formatScheduledDate('2026-01-01T00:00:00.000Z')).toBe('1 Jan 2026')
    expect(formatScheduledDate('not a date')).toBe('not a date')
  })
})
