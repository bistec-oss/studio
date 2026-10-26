// 027 FR-05 / AC-04 (schema half): the stamp schema, the tolerant parse and rulesAtStamp.
import { describe, it, expect } from 'vitest'
import {
  postStyleStampSchema,
  parsePostStyleStamp,
  stampFor,
  rulesAtStamp,
  derivedPromptVersion,
  POST_STYLES_REVISION,
} from '@/lib/postStyles'
import { styles, revisionOf } from '@/lib/postStyles/styles'
import { PROMPT_VERSION, PROMPT_VERSION_BASE } from '@/lib/agent/prompts/shared'
import { CAPTION_PROMPT_VERSION, CAPTION_PROMPT_VERSION_BASE } from '@/lib/agent/prompts/caption'
import type { PostStyle } from '@/lib/postStyles/types'

describe('postStyleStampSchema', () => {
  it('accepts a well-formed stamp', () => {
    expect(postStyleStampSchema.safeParse({ key: 'tip', version: 1, revision: 8 }).success).toBe(
      true,
    )
  })

  it('rejects bad shapes', () => {
    for (const bad of [
      { key: '', version: 1, revision: 1 },
      { key: 'x'.repeat(41), version: 1, revision: 1 },
      { key: 'tip', version: 0, revision: 1 },
      { key: 'tip', version: 1.5, revision: 1 },
      { key: 'tip', version: 1, revision: 0 },
      { key: 'tip', version: 1 },
      { key: 'tip', version: 1, revision: 1, extra: true },
      { key: 7, version: 1, revision: 1 },
    ])
      expect(postStyleStampSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false)
  })
})

describe('parsePostStyleStamp', () => {
  it('returns the stamp for a valid value and null for anything unreadable, never throwing', () => {
    expect(parsePostStyleStamp({ key: 'tip', version: 1, revision: 8 })).toEqual({
      key: 'tip',
      version: 1,
      revision: 8,
    })
    for (const bad of [
      null,
      undefined,
      'x',
      5,
      [],
      {},
      { key: 'tip' },
      { key: 'tip', version: 'a' },
    ])
      expect(parsePostStyleStamp(bad)).toBeNull()
  })
})

describe('stampFor', () => {
  it('defaults revision to POST_STYLES_REVISION and validates', () => {
    expect(stampFor('event', 1)).toEqual({
      key: 'event',
      version: 1,
      revision: POST_STYLES_REVISION,
    })
    expect(stampFor('event', 2, 12).revision).toBe(12)
    expect(() => stampFor('', 1)).toThrow()
    expect(() => stampFor('event', 0)).toThrow()
  })
})

describe('rulesAtStamp', () => {
  it('returns the checklist of the stamped version, filtered by scope', () => {
    const stamp = stampFor('general', 1)
    const all = styles.general.versions[1].checklist
    expect(rulesAtStamp(stamp)).toEqual(all)
    expect(rulesAtStamp(stamp, 'image')).toEqual(all.filter((r) => r.scope === 'image'))
    expect(rulesAtStamp(stamp, 'caption')).toEqual(all.filter((r) => r.scope === 'caption'))
    expect(rulesAtStamp(stamp, 'image')!.length).toBeGreaterThan(0)
  })

  it('returns null for a null or unreadable stamp, an unknown key and an unknown version', () => {
    expect(rulesAtStamp(null)).toBeNull()
    expect(rulesAtStamp({ junk: 1 })).toBeNull()
    expect(rulesAtStamp({ key: 'nope', version: 1, revision: 1 })).toBeNull()
    expect(rulesAtStamp({ key: 'general', version: 7, revision: 1 })).toBeNull()
    expect(rulesAtStamp({ key: 'constructor', version: 1, revision: 1 })).toBeNull()
  })

  it('an old version still resolves after the style gains a new one (versions are immutable)', () => {
    const v1 = styles.tip.versions[1]
    const grown: Record<string, PostStyle> = {
      ...styles,
      tip: {
        ...styles.tip,
        current: 2,
        versions: { 1: v1, 2: { ...v1, checklist: v1.checklist.slice(0, 1) } },
      },
    }
    expect(rulesAtStamp(stampFor('tip', 1), undefined, grown)).toEqual(v1.checklist)
    expect(rulesAtStamp(stampFor('tip', 2), undefined, grown)).toHaveLength(1)
  })
})

// ── T4: the derived prompt versions (027 FR-05, AC-04) ───────────────────────

describe('PROMPT_VERSION and CAPTION_PROMPT_VERSION derive from the dataset', () => {
  it('both end with +ps<POST_STYLES_REVISION> on the build-date base', () => {
    expect(PROMPT_VERSION).toBe(`${PROMPT_VERSION_BASE}+ps${POST_STYLES_REVISION}`)
    expect(CAPTION_PROMPT_VERSION).toBe(`${CAPTION_PROMPT_VERSION_BASE}+ps${POST_STYLES_REVISION}`)
    expect(PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+\+ps\d+$/)
    expect(CAPTION_PROMPT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+\+ps\d+$/)
  })

  it('adding a version to a fixture dataset changes both strings, with no manual bump', () => {
    const copy = JSON.parse(JSON.stringify(styles)) as Record<string, PostStyle & { current: number; versions: Record<number, unknown> }>
    copy.tip.versions[2] = copy.tip.versions[1]
    copy.tip.current = 2
    const revision = revisionOf(copy as Record<string, PostStyle>)
    expect(revision).toBe(POST_STYLES_REVISION + 1)
    expect(derivedPromptVersion(PROMPT_VERSION_BASE, revision)).not.toBe(PROMPT_VERSION)
    expect(derivedPromptVersion(CAPTION_PROMPT_VERSION_BASE, revision)).not.toBe(CAPTION_PROMPT_VERSION)
    expect(derivedPromptVersion(PROMPT_VERSION_BASE, POST_STYLES_REVISION)).toBe(PROMPT_VERSION)
  })

  it('both fit the 006 catalogue field (at most 40 characters), so no analytics event is rejected', () => {
    expect(PROMPT_VERSION.length).toBeLessThanOrEqual(40)
    expect(CAPTION_PROMPT_VERSION.length).toBeLessThanOrEqual(40)
  })
})
