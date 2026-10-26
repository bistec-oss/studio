// The post-style stamp (027 FR-05): one JSON value stored on Draft and
// DraftRevision. Validated in code at every write, tolerant at read (a stored
// value that fails to parse reads as null), like the 009 composition stamp.
import { z } from 'zod'
import { getStyle, POST_STYLES_REVISION } from './styles'
import type { PostStyle, Rule, RuleScope } from './types'

export const postStyleStampSchema = z
  .object({
    key: z.string().min(1).max(40),
    version: z.number().int().positive(),
    revision: z.number().int().positive(), // POST_STYLES_REVISION at the run
  })
  .strict()
export type PostStyleStamp = z.infer<typeof postStyleStampSchema>

// Tolerant read: null on any failure, never a throw.
export function parsePostStyleStamp(raw: unknown): PostStyleStamp | null {
  const r = postStyleStampSchema.safeParse(raw)
  return r.success ? r.data : null
}

// The stamp of a run: validated at construction, so a bad write throws here.
export function stampFor(
  key: string,
  version: number,
  revision: number = POST_STYLES_REVISION,
): PostStyleStamp {
  return postStyleStampSchema.parse({ key, version, revision })
}

// A prompt version derived from the dataset (FR-05): the build-date base plus
// the dataset's revision, so a checklist edit (which raises the revision)
// changes it with no manual bump. Pure, so a test can derive one for a fixture.
export function derivedPromptVersion(base: string, revision: number = POST_STYLES_REVISION): string {
  return `${base}+ps${revision}`
}

// The rules of a stamped (key, version), optionally for one scope. A version is
// immutable, so a stamp that resolves yields the rules that ran. Returns null
// when the stamp is null/unreadable or its key or version no longer resolves
// (the caller passes no rules and warns once; this never throws).
export function rulesAtStamp(
  stamp: unknown,
  scope?: RuleScope,
  source?: Readonly<Record<string, PostStyle>>,
): readonly Rule[] | null {
  const s = parsePostStyleStamp(stamp)
  if (!s) return null
  const style = getStyle(s.key, source)
  const version =
    style && Object.hasOwn(style.versions, s.version) ? style.versions[s.version] : undefined
  if (!version) return null
  return scope ? version.checklist.filter((r) => r.scope === scope) : version.checklist
}

// What a reader of a draft sees of its stamp (027 FR-13): the key, the label
// and the version. The label falls back to the key when the style is no longer
// in the dataset. Null when the stamp is null or unreadable.
export function styleSummary(
  stamp: unknown,
  source?: Readonly<Record<string, PostStyle>>,
): { key: string; label: string; version: number } | null {
  const s = parsePostStyleStamp(stamp)
  if (!s) return null
  return { key: s.key, label: getStyle(s.key, source)?.label ?? s.key, version: s.version }
}
