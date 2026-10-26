// Replaces the text inside one candidate element and proves nothing else moved.
// Pure; server-side only (parse5, via candidates).
import { escapeHtmlText } from '../drafts/htmlLocator'
import { findTextCandidates, type TextCandidate } from './candidates'

const countEls = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g) ?? []).length

export function spliceText(
  html: string,
  c: TextCandidate,
  newText: string,
): { ok: true; html: string } | { ok: false; failure: 'splice-mismatch' } {
  const bad = { ok: false, failure: 'splice-mismatch' } as const
  if (!(0 <= c.start && c.start <= c.startTagEnd && c.startTagEnd <= c.endTagStart && c.endTagStart <= c.end && c.end <= html.length)) {
    return bad
  }
  const before = html.slice(0, c.startTagEnd)
  const after = html.slice(c.endTagStart)
  const escaped = escapeHtmlText(newText)
  const next = before + escaped + after

  // 1. the bytes before and after the range are identical.
  if (!next.startsWith(before) || !next.endsWith(after) || next.length !== before.length + escaped.length + after.length) {
    return bad
  }

  // 2. one element sits at the same start offset, with the same tag name and
  // text equal to the new text.
  const hits = findTextCandidates(next, newText).filter((h) => h.start === c.start && h.tagName === c.tagName)
  if (hits.length !== 1 || hits[0].hasChildElements) return bad

  // 3. the element count is the old count minus the removed descendants.
  const removed = countEls(html.slice(c.startTagEnd, c.endTagStart))
  if (countEls(next) !== countEls(html) - removed) return bad

  return { ok: true, html: next }
}
