// Coded kit typography rules (031 FR-27). Pure: the catalogue lookup is passed in, so this file
// has no server import and the editor gets its findings from the kit GET.

/** The smallest body text (px) allowed per canvas width; keyed by every `AspectRatio` width. */
export const MIN_BODY_PX_BY_WIDTH: Record<number, number> = { 1080: 28 }

export interface TypographyFinding {
  code: 'too-many-families' | 'same-category' | 'unknown-family'
  /** Names the fonts, for the editor. */
  detail: string
}

type Lookup = (name: string) => { family: string; category: string } | null

const MAX_LATIN_FAMILIES = 2

export function checkKitTypography(
  kit: { fonts: ReadonlyArray<{ name: string }>; scriptFonts: Record<string, string> | null },
  lookup: Lookup,
): TypographyFinding[] {
  const findings: TypographyFinding[] = []
  const names = kit.fonts.map((f) => f.name)
  const scriptFamilies = Object.values(kit.scriptFonts ?? {})

  for (const name of [...names, ...scriptFamilies]) {
    if (!lookup(name)) {
      findings.push({
        code: 'unknown-family',
        detail: `${name} is not in the font list, so it cannot be checked.`,
      })
    }
  }

  // At most 2 Latin families, plus at most one per script key.
  if (names.length > MAX_LATIN_FAMILIES) {
    findings.push({
      code: 'too-many-families',
      detail: `${names.length} fonts (${names.join(', ')}); posts read best with at most ${MAX_LATIN_FAMILIES}, plus one per script.`,
    })
  }

  const [heading, body] = names
  if (heading && body && heading !== body) {
    const h = lookup(heading)
    const b = lookup(body)
    if (h && b && h.family !== b.family && h.category === b.category) {
      findings.push({
        code: 'same-category',
        detail: `${heading} and ${body} are both ${h.category}; pair a heading and a body font from different categories.`,
      })
    }
  }
  return findings
}
