// The one normaliser (030 FR-09). The staleness rule, the mock stand-in and the
// in-page check all compare headlines through it.
//
// It must stay self-contained: no imports, no closures, no helper calls. The
// renderer rebuilds it in the page from NORMALISE_HEADLINE_SOURCE, so both sides
// run the same text. Do not let a bundler or a refactor give it a dependency.

export function normaliseHeadline(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[\s   ]+/g, ' ')
    .trim()
    .toLowerCase()
}

export const NORMALISE_HEADLINE_SOURCE: string = normaliseHeadline.toString()
