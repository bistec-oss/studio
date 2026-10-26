// The text stand-in for the headline check under MOCK_PUPPETEER (030 FR-10,
// design 3.3). It sees text, not CSS, so only the sentinel yields `not-visible`
// (known limit L4). Pure.
import { normaliseHeadline } from './normalise'
import type { HeadlineCheck } from './vocab'

export const MOCK_HEADLINE_HIDDEN = '__MOCK_HEADLINE_HIDDEN__'

// 031 FR-40: Apply's in-render sentinels, read from the rendered HTML.
export const MOCK_APPLY_NOT_PAINTED = '__MOCK_APPLY_NOT_PAINTED__'
export const MOCK_APPLY_OLD_PAINTED = '__MOCK_APPLY_OLD_PAINTED__'
export const MOCK_APPLY_RENDER_FAIL = '__MOCK_APPLY_RENDER_FAIL__'

// `&amp;` goes last so "&amp;lt;" decodes once, to "&lt;".
function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

// Whole-text occurrences: bounded by a string end or a space on both sides.
function countWhole(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    const end = at + needle.length
    const before = at === 0 || haystack[at - 1] === ' '
    const after = end === haystack.length || haystack[end] === ' '
    if (before && after) count++
    from = end
  }
}

export function mockHeadlineCheck(html: string, headline: string): HeadlineCheck {
  if (html.includes(MOCK_HEADLINE_HIDDEN) || html.includes(MOCK_APPLY_NOT_PAINTED)) return 'not-visible'
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
  const count = countWhole(normaliseHeadline(decodeEntities(text)), normaliseHeadline(headline))
  if (count === 0) return 'not-found'
  return count === 1 ? 'painted' : 'ambiguous'
}

// 031 FR-40: the painted candidates across the `absent` texts. The sentinel
// forces one; otherwise the text stand-in counts whole occurrences.
export function mockAbsentPainted(html: string, absent: string[]): number {
  if (html.includes(MOCK_APPLY_OLD_PAINTED)) return 1
  let n = 0
  for (const text of absent) {
    const c = mockHeadlineCheck(html, text)
    n += c === 'painted' ? 1 : c === 'ambiguous' ? 2 : 0
  }
  return n
}
