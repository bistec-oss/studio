import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// AC-16 (011 NFR-01): every declared text/surface and boundary/surface token
// pair meets WCAG 2.2 AA in both themes. The values are read from globals.css,
// so the test guards the real file: a token edit that breaks AA fails here.
// The pairs are the ones in docs/ui-reference/DESIGN_SYSTEM.md §3.3.

type RGB = [number, number, number]
type Theme = 'light' | 'dark'

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

// The top-level `:root { … }` and `.dark { … }` blocks (not `.dark .glass` and
// the like). Later blocks win, as in the cascade.
function themeVars(selector: ':root' | '.dark'): Record<string, string> {
  const vars: Record<string, string> = {}
  const sel = selector === ':root' ? ':root' : '\\.dark'
  const block = new RegExp(`(?:^|\\n)${sel}\\s*\\{([^}]*)\\}`, 'g')
  for (const [, body] of css.matchAll(block)) {
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[name] = value.trim()
    }
  }
  return vars
}

const VARS: Record<Theme, Record<string, string>> = {
  // .dark only overrides; anything it doesn't set falls back to :root.
  light: themeVars(':root'),
  dark: { ...themeVars(':root'), ...themeVars('.dark') },
}

function color(theme: Theme, token: string): RGB {
  const raw = VARS[theme][token]
  if (!raw) throw new Error(`--${token} is not defined for ${theme}`)
  const parts = raw.split(/\s+/).map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error(`--${token} (${theme}) is not an R G B triplet: "${raw}"`)
  }
  return parts as RGB
}

// WCAG 2.2 relative luminance and contrast ratio.
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function ratio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// `fg` at `alpha` over an opaque `bg` (a status chip's tint), rounded to the
// 8-bit colour the browser paints. This reproduces the §3.3 tables exactly.
function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB
}

const TEXT = 4.5 // body text
const UI = 3 // non-text boundaries: control edges, focus
// Status tint alpha, the same in both themes and for chips, notices and
// status discs (021 A2): the Graphite study's chip tint. 0.12 is stricter than
// the 0.10 it replaces (design.md §9).
const CHIP_ALPHA = 0.12

const SURFACES = ['canvas', 'surface-1', 'surface-2'] as const
const STATUSES = ['draft', 'exported', 'scheduled', 'published', 'failed'] as const

interface Pair {
  label: string
  needs: number
  ratio: (t: Theme) => number
}

const solid = (fg: string, bg: string, needs: number): Pair => ({
  label: `${fg} / ${bg}`,
  needs,
  ratio: (t) => ratio(color(t, fg), color(t, bg)),
})

const PAIRS: Pair[] = [
  ...SURFACES.map((s) => solid('fg', s, TEXT)),
  ...SURFACES.map((s) => solid('fg-muted', s, TEXT)),
  solid('accent-fg', 'accent', TEXT),
  // accent as text (links, "Current" labels)
  ...SURFACES.map((s) => solid('accent', s, TEXT)),
  // a status chip: its text on its own tint, over the worst surface
  ...STATUSES.map((status): Pair => ({
    label: `status-${status} / its chip (worst surface)`,
    needs: TEXT,
    ratio: (t) => {
      const c = color(t, `status-${status}`)
      return Math.min(...SURFACES.map((s) => ratio(c, over(c, CHIP_ALPHA, color(t, s)))))
    },
  })),
  // `line` is the edge of every control, so it holds 3:1 on every surface.
  // `line-subtle` is left out on purpose: decorative dividers only, exempt
  // under WCAG 1.4.11, never text and never a control edge.
  ...SURFACES.map((s) => solid('line', s, UI)),
  ...SURFACES.map((s) => solid('focus', s, UI)),
]

describe('design-token contrast (WCAG 2.2 AA, 011 NFR-01)', () => {
  for (const theme of ['light', 'dark'] as const) {
    describe(theme, () => {
      it.each(PAIRS.map((p) => [p.label, p] as const))('%s', (_label, pair) => {
        const r = pair.ratio(theme)
        expect(
          r,
          `${pair.label} in ${theme} is ${r.toFixed(2)}:1, needs ${pair.needs}:1`,
        ).toBeGreaterThanOrEqual(pair.needs)
      })
    })
  }

  it('reads every token it checks from globals.css', () => {
    expect(PAIRS.length).toBe(21)
    for (const theme of ['light', 'dark'] as const) {
      for (const t of ['fg', 'fg-muted', 'accent', 'accent-fg', 'line', 'focus', ...SURFACES]) {
        expect(() => color(theme, t)).not.toThrow()
      }
    }
  })

  it('uses the WCAG formula (black on white is 21:1)', () => {
    expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(ratio([255, 255, 255], [255, 255, 255])).toBe(1)
  })
})
