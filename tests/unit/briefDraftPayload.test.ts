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
