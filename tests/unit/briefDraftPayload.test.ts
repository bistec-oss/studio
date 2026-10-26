// Pure parts of the brief-draft recovery feature: the payload schema, the
// trivial-draft predicate, and the image-URL→key guard. The prisma-backed
// lifecycle (cap eviction, TTL sweep, keepImages) is exercised end-to-end in
// tests/e2e/brief-draft-recovery.test.ts.

import { describe, it, expect } from 'vitest'
import {
  briefDraftPayloadSchema,
  isTrivialBriefDraft,
  briefDraftPayloadTooLarge,
  briefImageKeyFromUrl,
  type BriefDraftPayload,
} from '@/lib/brief/briefDraftPayload'

const base: BriefDraftPayload = {
  step: 2,
  campaignId: '',
  aspectRatio: 'SQUARE',
  brandKitId: 'kit1',
  designMode: 'GENERATE',
  templateId: '',
  referenceTemplateId: '',
  topic: 'Cloud costs',
  prompt: 'Long prompt text',
  goal: 'awareness',
  tone: 'professional',
  images: [],
}

describe('briefDraftPayloadSchema', () => {
  it('accepts a full wizard payload', () => {
    expect(briefDraftPayloadSchema.safeParse(base).success).toBe(true)
  })

  it('rejects out-of-range steps and unknown enums', () => {
    expect(briefDraftPayloadSchema.safeParse({ ...base, step: 7 }).success).toBe(false)
    expect(briefDraftPayloadSchema.safeParse({ ...base, aspectRatio: 'WIDE' }).success).toBe(false)
    expect(briefDraftPayloadSchema.safeParse({ ...base, designMode: 'FREEFORM' }).success).toBe(
      false,
    )
  })

  it('rejects a payload missing fields (schema drift → treated as missing)', () => {
    const legacy = { topic: 'old', prompt: 'shape' }
    expect(briefDraftPayloadSchema.safeParse(legacy).success).toBe(false)
  })

  // 008 FR-17 / AC-25: the Review step's model picks survive autosave → resume.
  it('round-trips captionModel and designModel through JSON (a resumed brief restores the picks)', () => {
    const picked: BriefDraftPayload = { ...base, captionModel: 'HAIKU', designModel: 'OPUS' }
    const parsed = briefDraftPayloadSchema.safeParse(JSON.parse(JSON.stringify(picked)))
    expect(parsed.success && parsed.data).toStrictEqual(picked)
  })

  it('the picks are optional: a payload without them (untouched pickers, or saved before 008) still parses, with none', () => {
    const parsed = briefDraftPayloadSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'captionModel' in parsed.data).toBe(false)
    expect(parsed.success && 'designModel' in parsed.data).toBe(false)
  })

  // 009 FR-03 / AC-05: the image style survives autosave -> resume.
  it('round-trips imageStyle through JSON', () => {
    const picked: BriefDraftPayload = { ...base, designMode: 'GENERATE', imageStyle: 'editorial-split' }
    const parsed = briefDraftPayloadSchema.safeParse(JSON.parse(JSON.stringify(picked)))
    expect(parsed.success && parsed.data).toStrictEqual(picked)
  })

  it('imageStyle is optional: a payload without it (classic, or saved before 009) still parses, with none', () => {
    const parsed = briefDraftPayloadSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && 'imageStyle' in parsed.data).toBe(false)
  })

  it('an unknown stored style still parses (the wizard reads it back as classic); a non-string or over-long one does not', () => {
    expect(briefDraftPayloadSchema.safeParse({ ...base, imageStyle: 'retired-style' }).success).toBe(true)
    expect(briefDraftPayloadSchema.safeParse({ ...base, imageStyle: 7 }).success).toBe(false)
    expect(briefDraftPayloadSchema.safeParse({ ...base, imageStyle: 'x'.repeat(41) }).success).toBe(false)
  })

  it('rejects a pick outside the closed model keys', () => {
    for (const bad of ['opus', 'gpt-4o', 'claude-opus-5-5', null]) {
      expect(briefDraftPayloadSchema.safeParse({ ...base, captionModel: bad }).success).toBe(false)
      expect(briefDraftPayloadSchema.safeParse({ ...base, designModel: bad }).success).toBe(false)
    }
  })
})

describe('isTrivialBriefDraft', () => {
  it('is trivial only when topic, prompt AND images are all empty', () => {
    expect(isTrivialBriefDraft({ ...base, topic: '', prompt: '' })).toBe(true)
    expect(isTrivialBriefDraft({ ...base, topic: '  ', prompt: '\n' })).toBe(true)
    expect(isTrivialBriefDraft({ ...base, topic: 'x', prompt: '' })).toBe(false)
    expect(isTrivialBriefDraft({ ...base, topic: '', prompt: 'x' })).toBe(false)
    expect(
      isTrivialBriefDraft({
        ...base,
        topic: '',
        prompt: '',
        images: [{ id: '1', url: 'http://x/y', filename: 'y', intent: 'embed' }],
      }),
    ).toBe(false)
  })
})

describe('briefDraftPayloadTooLarge', () => {
  it('caps the serialized payload at 64 KB', () => {
    expect(briefDraftPayloadTooLarge(base)).toBe(false)
    expect(briefDraftPayloadTooLarge({ ...base, prompt: 'x'.repeat(70_000) })).toBe(true)
  })
})

describe('briefImageKeyFromUrl', () => {
  const bucket = 'generated-images'
  const uid = 'user_1'

  it('extracts the key for the owner briefs/ prefix', () => {
    expect(
      briefImageKeyFromUrl(`http://localhost:9000/${bucket}/briefs/${uid}/123-a.png`, bucket, uid),
    ).toBe(`briefs/${uid}/123-a.png`)
  })

  it('rejects other users, other prefixes, other buckets, and junk', () => {
    expect(
      briefImageKeyFromUrl(`http://x:9000/${bucket}/briefs/user_2/123-a.png`, bucket, uid),
    ).toBeNull()
    expect(
      briefImageKeyFromUrl(`http://x:9000/${bucket}/exports/design-1.png`, bucket, uid),
    ).toBeNull()
    expect(
      briefImageKeyFromUrl(`http://x:9000/brand-kits/briefs/${uid}/a.png`, bucket, uid),
    ).toBeNull()
    expect(briefImageKeyFromUrl('not a url', bucket, uid)).toBeNull()
  })

  it('rejects encoded traversal that would escape the prefix after decoding', () => {
    expect(
      briefImageKeyFromUrl(
        `http://x:9000/${bucket}/briefs/${uid}/%2E%2E/%2E%2E/exports/steal.png`,
        bucket,
        uid,
      ),
    ).toBeNull()
  })
})

// 027 FR-07: the post style survives autosave -> resume; goal is a legacy optional field.
describe('briefDraftPayloadSchema: post style (027)', () => {
  it('round-trips postStyle through JSON', () => {
    const picked: BriefDraftPayload = { ...base, postStyle: 'launch' }
    const parsed = briefDraftPayloadSchema.safeParse(JSON.parse(JSON.stringify(picked)))
    expect(parsed.success && parsed.data).toStrictEqual(picked)
  })

  it('an old row with a goal and no style still parses (it resumes as General)', () => {
    const parsed = briefDraftPayloadSchema.safeParse(base)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.goal).toBe('awareness')
    expect(parsed.success && 'postStyle' in parsed.data).toBe(false)
  })

  it('a new payload with no goal parses', () => {
    const { goal: _goal, ...noGoal } = base
    expect(briefDraftPayloadSchema.safeParse({ ...noGoal, postStyle: 'event' }).success).toBe(true)
  })

  it('postStyle is capped at 40 characters', () => {
    expect(briefDraftPayloadSchema.safeParse({ ...base, postStyle: 'x'.repeat(41) }).success).toBe(false)
  })
})

describe('briefDraftPayloadSchema: product screenshot (025 FR-11)', () => {
  const source = { kind: 'brief-upload' as const, key: 'screenshots/t1/u1/1-abc.png', width: 1280, height: 800 }

  it('round-trips compositeSource through JSON', () => {
    const picked: BriefDraftPayload = { ...base, imageStyle: 'device-screen', compositeSource: source }
    const parsed = briefDraftPayloadSchema.safeParse(JSON.parse(JSON.stringify(picked)))
    expect(parsed.success && parsed.data).toStrictEqual(picked)
  })

  it('an old row with no screenshot parses and has no compositeSource', () => {
    const parsed = briefDraftPayloadSchema.safeParse(base)
    expect(parsed.success && 'compositeSource' in parsed.data).toBe(false)
  })

  it('refuses a traversal key, a key outside screenshots/, a deeper key and a URL', () => {
    for (const key of [
      'screenshots/t1/../u2/x.png',
      'screenshots/t1/u1/../../x.png',
      'briefs/u1/x.png',
      'screenshots/t1/u1/a/b.png',
      'screenshots/t1/x.png',
      'https://example.com/screenshots/t1/u1/x.png',
    ]) {
      expect(briefDraftPayloadSchema.safeParse({ ...base, compositeSource: { ...source, key } }).success, key).toBe(false)
    }
  })

  it('refuses a wrong kind, an extra field and a bad size', () => {
    expect(briefDraftPayloadSchema.safeParse({ ...base, compositeSource: { ...source, kind: 'url' } }).success).toBe(false)
    expect(briefDraftPayloadSchema.safeParse({ ...base, compositeSource: { ...source, url: 'x' } }).success).toBe(false)
    expect(briefDraftPayloadSchema.safeParse({ ...base, compositeSource: { ...source, width: 0 } }).success).toBe(false)
  })
})
