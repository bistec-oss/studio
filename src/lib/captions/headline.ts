// The on-image headline (012 FR-09): the one short line the design renders.
// It is written by the caption call, validated here, and stored in its own
// column, so the design never reads a caption.
//
// Pure — no I/O. designHeadline reports a fallback rather than logging it; the
// caller logs headlineFallbackMessage(draftId).

export const HEADLINE_MAX = 100

export type HeadlineResult = { ok: true; text: string } | { ok: false; reason: string }

const count = (n: number) => n.toLocaleString('en-US')

export function validateHeadline(raw: string): HeadlineResult {
  // `**` goes first: removing it from "** **" leaves only whitespace, which the
  // collapse and trim then empty. Collapsing whitespace can never create a new
  // `**` (it only ever yields "* *").
  let text = raw
  while (text.includes('**')) text = text.replaceAll('**', '')
  text = text.replace(/\s+/g, ' ').trim()

  if (!text) return { ok: false, reason: 'empty' }
  if (text.length > HEADLINE_MAX) {
    return { ok: false, reason: `over-limit (${count(text.length)} / ${count(HEADLINE_MAX)})` }
  }
  // A code fence or a fence-like delimiter means the model leaked structure or
  // echoed untrusted-data markers into the line the design prints.
  if (text.includes('```')) return { ok: false, reason: 'contains ```' }
  if (text.includes('<<<')) return { ok: false, reason: 'contains <<<' }
  return { ok: true, text }
}

// The headline a design for an existing draft uses. A generated draft always
// has one (a generation without it fails, A6); a draft with `headline = null`
// falls back to the brief Topic.
export function designHeadline(
  draft: { headline: string | null },
  brief: { topic: string }
): { text: string; fallback: boolean } {
  if (draft.headline === null) return { text: brief.topic, fallback: true }
  return { text: draft.headline, fallback: false }
}

// The line the caller logs when designHeadline reports a fallback.
export function headlineFallbackMessage(draftId: string): string {
  return `[captions] draft ${draftId} has no headline — design uses the brief topic`
}
