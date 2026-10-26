import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import tailwindConfig from '../../tailwind.config'
import { Button } from '@/components/ui/Button'
import { Input, fieldClasses, inputClasses } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { COMPACT_FIELD, COMPACT_TEXTAREA, ICON_BUTTON } from '@/components/ui/atoms'

// AC-07 (011 FR-06/FR-07): the semantic tokens live in globals.css, per
// theme where they vary, and tailwind.config.ts exposes every semantic colour
// as rgb(var(--…) / <alpha-value>). The Frozen Light tokens are gone since the
// cleanup (T13, FR-13), and Tailwind's default type and radius steps are not
// redefined.
//
// 021 AC-01/AC-02 (FR-01, FR-02, FR-14): the values are Graphite's, checked
// against the study file itself, so a hand-typed digit fails here.

const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
const STUDY_PATH = 'docs/ui-reference/direction-studies/study-a-graphite.html'
const study = readFileSync(resolve(process.cwd(), STUDY_PATH), 'utf8')

// Custom properties of the top-level `:root { … }` or `.dark { … }` blocks
// (not `.dark ::selection` and the like), across every such block.
function blockVars(source: string, selector: ':root' | '.dark'): Record<string, string> {
  const vars: Record<string, string> = {}
  const sel = selector === ':root' ? ':root' : '\\.dark'
  for (const [, body] of source.matchAll(new RegExp(`(?:^|\\n)${sel}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const [, name, value] of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      vars[name] = value.trim()
    }
  }
  return vars
}

const ROOT = blockVars(css, ':root')
const DARK = blockVars(css, '.dark')
const STUDY_ROOT = blockVars(study, ':root')
const STUDY_DARK = blockVars(study, '.dark')

// A value that differs from the study, allowed only for contrast (021 R10,
// FR-01). Each entry names its contrast pair and is listed in
// DESIGN_SYSTEM.md §3. Empty: every study value passes (design.md §9).
const DEVIATIONS: Record<string, { root?: string; dark?: string; pair: string }> = {}

// The study's --font-* lines are not copied: next/font supplies them.
const isFont = (name: string) => name.startsWith('font-')
// The control heights are 014's keys, which the study does not declare (A1).
const CONTROL_KEYS = ['control-sm', 'control-md', 'control-lg']

// Theme-dependent: declared in both blocks (DESIGN_SYSTEM.md §3).
const COLOR_TOKENS = [
  'canvas',
  'surface-1',
  'surface-2',
  'fg',
  'fg-muted',
  'line',
  'line-subtle',
  'accent',
  'accent-fg',
  'focus',
  'status-draft',
  'status-exported',
  'status-scheduled',
  'status-published',
  'status-failed',
  'scrim',
]
const SHADOW_TOKENS = ['shadow-panel', 'shadow-raised', 'shadow-overlay']

// Theme-independent: declared once, on :root.
const ROOT_ONLY_TOKENS = [
  'radius-sm',
  'radius-md',
  'radius-lg',
  'radius-xl',
  'radius-pill',
  'control-sm',
  'control-md',
  'control-lg',
  'dur-fast',
  'dur-base',
  'dur-slow',
  'ease-standard',
  'ease-exit',
  'text-2xs',
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'space-1',
  'space-2',
  'space-3',
  'space-4',
  'space-5',
  'space-6',
  'space-8',
  'space-10',
]

const TRIPLET = /^\d{1,3} \d{1,3} \d{1,3}$/

type Tree = Record<string, unknown>
const extend = (tailwindConfig.theme?.extend ?? {}) as Record<string, Tree>
const colors = extend.colors as Record<string, string | Record<string, string>>

// The height utilities in a class string (h-*), and the class attribute of the
// first element in rendered markup.
const heights = (cls: string) => cls.split(/\s+/).filter((c) => /^h-/.test(c))
const classOf = (html: string) => html.match(/class="([^"]*)"/)?.[1] ?? ''

const varOf = (value: string) => value.match(/^rgb\(var\(--([\w-]+)\) \/ <alpha-value>\)$/)?.[1]

describe('semantic tokens in globals.css (AC-07)', () => {
  it.each([...COLOR_TOKENS, ...SHADOW_TOKENS])('--%s is in :root and .dark', (name) => {
    expect(ROOT[name], `:root --${name}`).toBeTruthy()
    expect(DARK[name], `.dark --${name}`).toBeTruthy()
  })

  it.each(COLOR_TOKENS)('--%s is an R G B triplet in both themes', (name) => {
    expect(ROOT[name]).toMatch(TRIPLET)
    expect(DARK[name]).toMatch(TRIPLET)
  })

  it.each(ROOT_ONLY_TOKENS)('--%s is declared once, on :root', (name) => {
    expect(ROOT[name], `:root --${name}`).toBeTruthy()
    expect(DARK[name], `.dark must not redefine --${name}`).toBeUndefined()
  })

  it('leaves the font variables to next/font (not literal in :root)', () => {
    // A literal "Plus Jakarta Sans" would miss next/font's generated family
    // name and fall through to the system sans (DESIGN_SYSTEM.md §3.1 note).
    for (const name of ['font-display', 'font-sans', 'font-mono']) {
      expect(ROOT[name]).toBeUndefined()
    }
  })

  it('no longer declares the Frozen Light vars (FR-13)', () => {
    const legacy = ['background', 'surface', 'surface-hover', 'border', 'text', 'text-muted']
    for (const name of [...legacy, 'primary', 'primary-light', 'primary-hover', 'primary-active']) {
      expect(ROOT[name], `:root --${name}`).toBeUndefined()
      expect(DARK[name], `.dark --${name}`).toBeUndefined()
    }
  })

  it('has a reduced-motion block that shortens, not removes, animations (NFR-03)', () => {
    // The block runs from its @media line to the next top-level closing brace,
    // so CSS appended after it can't break this test.
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1]
    expect(block).toBeTruthy()
    expect(block).toMatch(/animation-duration:\s*1ms !important/)
    expect(block).toMatch(/transition-duration:\s*1ms !important/)
    // Loading indicators keep moving, slowly, instead of freezing on one cycle.
    for (const cls of ['animate-spin', 'animate-pulse']) {
      expect(block).toMatch(
        new RegExp(`\\.${cls} \\{[^}]*animation-iteration-count:\\s*infinite !important`)
      )
    }
    // Removing the animation would drop modalIn's final frame, which carries
    // the modal's translate(-50%,-50%) centring.
    expect(block).not.toMatch(/animation(-name)?:\s*none/)
    expect(css).toMatch(/@keyframes modalIn[\s\S]*translate\(-50%, -50%\)/)
  })

  // 014 AC-09 (FR-10): the body sets tabular figures, so counters, times and
  // table numbers align without a local utility (DESIGN_SYSTEM.md §5.2).
  it('sets font-variant-numeric: tabular-nums on the body rule', () => {
    const bodies = [...css.matchAll(/(?:^|\n)\s*body\s*\{([^}]*)\}/g)].map((m) => m[1])
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatch(/(?:^|[;{\s])font-variant-numeric:\s*tabular-nums\s*;/)
  })

  // 021 FR-05 (design.md §4.1): the four surface classes are opaque, set
  // background-COLOR (never the shorthand), and have no backdrop-filter. The
  // hairlines are box-shadow rings; the bezel's tray is its 6 px border.
  it.each([
    ['surface', 'surface-1', 'radius-lg'],
    ['surface-bezel', 'surface-1', 'radius-xl'],
    ['surface-raised', 'surface-2', 'radius-md'],
    ['surface-overlay', 'surface-2', 'radius-lg'],
  ])('.%s is opaque --%s at --%s', (cls, fill, radius) => {
    const body = css.match(new RegExp(`\\n\\s*\\.${cls}\\s*\\{([^}]*)\\}`))?.[1]
    expect(body, `.${cls}`).toBeTruthy()
    expect(body).toMatch(new RegExp(`background-color:\\s*rgb\\(var\\(--${fill}\\)\\);`))
    expect(body).toMatch(new RegExp(`border-radius:\\s*var\\(--${radius}\\);`))
    expect(body).not.toMatch(/backdrop-filter|background:|\/\s*0?\.\d/)
  })

  it('draws the raised and overlay hairlines as rings, and the bezel tray as a 6 px border', () => {
    const body = (cls: string) => css.match(new RegExp(`\\n\\s*\\.${cls}\\s*\\{([^}]*)\\}`))?.[1] ?? ''
    for (const cls of ['surface-raised', 'surface-overlay']) {
      expect(body(cls)).toMatch(/0 0 0 1px rgb\(var\(--line-subtle\)\)/)
      expect(body(cls)).not.toMatch(/border:/)
    }
    expect(body('surface-bezel')).toMatch(/border:\s*6px solid rgb\(var\(--line-subtle\)\);/)
    expect(body('surface-bezel')).toMatch(/background-clip:\s*padding-box;/)
  })

  // 021 FR-05: pop (menus) and rise (toasts) replace the drop entrance, and
  // the reduced-motion fade covers the pop.
  it('replaces the drop entrance with pop and rise', () => {
    expect(css).not.toMatch(/@keyframes drop\b|\.animate-drop\b/)
    expect(css).toMatch(/@keyframes pop\s*\{[\s\S]*?translateY\(-4px\) scale\(0\.97\)/)
    expect(css).toMatch(/@keyframes rise\s*\{[\s\S]*?translateY\(12px\) scale\(0\.98\)/)
    expect(css).toMatch(/\.animate-pop\s*\{\s*animation: pop var\(--dur-base\) var\(--ease-standard\)/)
    expect(css).toMatch(/\.animate-rise\s*\{\s*animation: rise var\(--dur-slow\) var\(--ease-standard\)/)
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(reduced).toMatch(/\.surface-raised,\s*\.animate-pop,\s*\[data-sonner-toaster\] \[data-sonner-toast\] \{/)
  })
})

describe('Graphite token values equal the study (021 AC-01, AC-02)', () => {
  it('parses both study blocks', () => {
    // A parse that found nothing would pass vacuously.
    expect(Object.keys(STUDY_ROOT).length).toBeGreaterThan(40)
    expect(Object.keys(STUDY_DARK).length).toBeGreaterThan(15)
  })

  it.each([
    [':root', ROOT, STUDY_ROOT, 'root'],
    ['.dark', DARK, STUDY_DARK, 'dark'],
  ] as const)(
    'every non-font study token in %s is in globals.css with an equal value',
    (_selector, ours, theirs, theme) => {
      const diffs = Object.entries(theirs)
        .filter(([name]) => !isFont(name))
        .filter(([name, value]) => ours[name] !== (DEVIATIONS[name]?.[theme] ?? value))
        .map(([name, value]) => `--${name}: globals.css "${ours[name]}" vs study "${value}"`)
      expect(diffs, diffs.join('\n')).toEqual([])
    },
  )

  it('declares exactly the study key set, minus the fonts, plus the control heights', () => {
    const expectedRoot = [...Object.keys(STUDY_ROOT).filter((n) => !isFont(n)), ...CONTROL_KEYS].sort()
    expect(Object.keys(ROOT).sort()).toEqual(expectedRoot)
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(STUDY_DARK).sort())
    expect(Object.keys(ROOT)).toHaveLength(47)
    expect(Object.keys(DARK)).toHaveLength(19)
  })

  it('adds --radius-xl, --space-5 and --space-10, and drops --space-12', () => {
    expect(ROOT['radius-xl']).toBe('26px')
    expect(ROOT['space-5']).toBe('20px')
    expect(ROOT['space-10']).toBe('40px')
    expect(ROOT['space-12']).toBeUndefined()
  })

  it('has an empty deviation map, each entry naming its contrast pair', () => {
    for (const [name, entry] of Object.entries(DEVIATIONS)) {
      expect(entry.pair, `DEVIATIONS.${name}`).toBeTruthy()
      expect(STUDY_ROOT[name] ?? STUDY_DARK[name], `DEVIATIONS.${name} is a study token`).toBeTruthy()
    }
    expect(Object.keys(DEVIATIONS)).toEqual([])
  })
})

describe('tailwind.config.ts semantic mapping (AC-07)', () => {
  const SEMANTIC: Record<string, string> = {
    canvas: 'canvas',
    'surface.DEFAULT': 'surface-1',
    'surface.raised': 'surface-2',
    'fg.DEFAULT': 'fg',
    'fg.muted': 'fg-muted',
    'line.DEFAULT': 'line',
    'line.subtle': 'line-subtle',
    'accent.DEFAULT': 'accent',
    'accent.fg': 'accent-fg',
    focus: 'focus',
    scrim: 'scrim',
  }
  for (const s of ['draft', 'exported', 'scheduled', 'published', 'failed']) {
    // One flat key per status: the var switches with the theme.
    SEMANTIC[`status-${s}`] = `status-${s}`
  }

  it.each(Object.entries(SEMANTIC))('colors.%s → rgb(var(--%s) / <alpha-value>)', (path, token) => {
    const [key, sub] = path.split('.')
    const entry = colors[key]
    const value = sub ? (entry as Record<string, string>)[sub] : entry
    expect(typeof value).toBe('string')
    expect(varOf(value as string)).toBe(token)
  })

  it('maps every colour token in globals.css', () => {
    const mapped = new Set(Object.values(SEMANTIC))
    expect(COLOR_TOKENS.filter((t) => !mapped.has(t))).toEqual([])
  })

  it('points the non-colour scales at :root vars', () => {
    const refs: Record<string, Record<string, string>> = {
      boxShadow: { panel: 'shadow-panel', raised: 'shadow-raised', overlay: 'shadow-overlay' },
      transitionDuration: { fast: 'dur-fast', base: 'dur-base', slow: 'dur-slow' },
      transitionTimingFunction: { standard: 'ease-standard', exit: 'ease-exit' },
      borderRadius: {
        'ui-sm': 'radius-sm',
        'ui-md': 'radius-md',
        'ui-lg': 'radius-lg',
        'ui-xl': 'radius-xl',
        'ui-pill': 'radius-pill',
      },
      fontSize: {
        'ui-2xs': 'text-2xs',
        'ui-xs': 'text-xs',
        'ui-sm': 'text-sm',
        'ui-base': 'text-base',
        'ui-lg': 'text-lg',
        'ui-xl': 'text-xl',
        'ui-2xl': 'text-2xl',
      },
    }
    for (const [scale, keys] of Object.entries(refs)) {
      for (const [key, token] of Object.entries(keys)) {
        expect(extend[scale]?.[key], `${scale}.${key}`).toBe(`var(--${token})`)
        expect(ROOT[token], `--${token}`).toBeTruthy()
      }
    }
  })

  // 021 AC-02 (FR-02): exactly two families, both from next/font.
  it('wires exactly the two next/font families, sans and mono', () => {
    const fonts = extend.fontFamily as Record<string, string[]>
    expect(Object.keys(fonts)).toEqual(['sans', 'mono'])
    expect(fonts.sans).toEqual(['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'])
    expect(fonts.mono).toEqual(['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'])
  })

  // 021 AC-02 (FR-02, A2, FR-07).
  it('maps the status tint opacity and the small-caps tracking', () => {
    expect(extend.opacity?.['12']).toBe('0.12')
    expect(extend.letterSpacing?.label).toBe('0.14em')
  })

  it('does not redefine Tailwind default type and radius steps', () => {
    for (const key of ['xs', 'sm', 'base', 'lg', 'xl', '2xl']) {
      expect(extend.fontSize?.[key], `fontSize.${key}`).toBeUndefined()
    }
    for (const key of ['DEFAULT', 'sm', 'md', 'lg']) {
      expect(extend.borderRadius?.[key], `borderRadius.${key}`).toBeUndefined()
    }
  })

  it('no longer maps the Frozen Light colours (FR-13)', () => {
    const legacy = Object.keys(colors).filter((k) => /^(light|dark|primary)(-|$)/.test(k))
    expect(legacy).toEqual([])
  })
})

// AC-06 (014 FR-07): one control height per size, from one source. The three
// --control-* tokens on :root are the only place 32 / 38 / 44 px are written
// (021 A1); Tailwind exposes them as spacing keys, and every control reads them.
describe('control heights (014 AC-06, 021 A1)', () => {
  const CONTROL = { 'control-sm': '32px', 'control-md': '38px', 'control-lg': '44px' }

  it.each(Object.entries(CONTROL))(':root declares --%s as %s', (token, value) => {
    expect(ROOT[token]).toBe(value)
  })

  it('maps spacing.control-sm|md|lg to the tokens, and redefines no default step', () => {
    for (const token of Object.keys(CONTROL)) {
      expect(extend.spacing?.[token], `spacing.${token}`).toBe(`var(--${token})`)
    }
    // Only the control keys: Tailwind's default spacing steps stay (§3.4).
    expect(Object.keys(extend.spacing ?? {}).sort()).toEqual(Object.keys(CONTROL).sort())
  })

  it('gives each Button size its token height', () => {
    for (const [size, token] of [['sm', 'control-sm'], ['md', 'control-md'], ['lg', 'control-lg']] as const) {
      const cls = classOf(renderToStaticMarkup(h(Button, { size }, 'x')))
      expect(heights(cls), `Button size=${size}`).toEqual([`h-${token}`])
    }
  })

  it('gives single-line fields the md height and textareas none', () => {
    expect(heights(inputClasses)).toEqual(['h-control-md'])
    expect(inputClasses).not.toMatch(/(?:^|\s)py-/)
    for (const [name, html] of [
      ['Input', renderToStaticMarkup(h(Input, { label: 'L' }))],
      ['Select', renderToStaticMarkup(h(Select, { label: 'L', options: [] }))],
    ] as const) {
      const field = html.match(/<(?:input|select)\b[^>]*class="([^"]*)"/)?.[1] ?? ''
      expect(heights(field), name).toEqual(['h-control-md'])
    }
    // A textarea's height comes from its rows: no control token.
    expect(heights(fieldClasses)).toEqual([])
    expect(heights(COMPACT_TEXTAREA)).toEqual([])
  })

  it('gives the compact field and the icon button the sm height', () => {
    expect(heights(COMPACT_FIELD)).toEqual(['h-control-sm'])
    expect(COMPACT_FIELD).not.toMatch(/(?:^|\s)py-/)
    expect(heights(ICON_BUTTON)).toEqual(['h-control-sm'])
    expect(ICON_BUTTON.split(/\s+/)).toContain('w-control-sm')
  })

  // The AC-06 grep, kept as a guard over every source file under src/: no
  // control writes its height as a literal (DESIGN_SYSTEM.md §6). The two
  // named exclusions are not controls (FR-07): the library skeleton bar and
  // the brief image thumbnail. A line that carries `ui-exception:` is skipped
  // (§11), which covers the draft page's expand button drawn on the post image.

  // Repo-relative paths with forward slashes.
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) return sourceFiles(path)
      return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
    })
  }
  const FILES = sourceFiles('src')
  const LITERAL = /(?:^|[\s"'`:])(?:h-9|h-10|h-\[30px\]|w-\[30px\])(?=$|[\s"'`])/
  const NOT_A_CONTROL = [
    /className="h-\[30px\] rounded-ui-md bg-line-subtle w-1\/2 mt-1"/, // library skeleton bar
    /<span className="w-10 h-10 rounded-ui-sm border border-line-subtle bg-surface /, // image thumbnail
  ]

  function literalHeights(file: string, text: string): string[] {
    return text
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(
        ({ line }) =>
          LITERAL.test(line) && !line.includes('ui-exception:') && !NOT_A_CONTROL.some((re) => re.test(line)),
      )
      .map(({ line, n }) => `${file}:${n}: ${line.slice(0, 90)}`)
  }

  // A walk that found nothing would pass vacuously.
  it('walks the whole source tree, including the FR-07 files and KitDetail', () => {
    for (const file of [
      'src/components/ui/Button.tsx',
      'src/components/ui/atoms.ts',
      'src/components/layout/AppShell.tsx',
      'src/app/(app)/library/page.tsx',
      'src/components/admin/brandkits/KitDetail.tsx',
    ]) {
      expect(FILES).toContain(file)
    }
  })

  it('flags a literal control height, and passes the two exclusions and ui-exception lines', () => {
    expect(literalHeights('x', `const B = 'inline-flex h-[30px] w-[30px] items-center'`)).toHaveLength(1)
    expect(literalHeights('x', `<button className="h-9 w-9">`)).toHaveLength(1)
    expect(literalHeights('x', `<div className="h-[30px] rounded-ui-md bg-line-subtle w-1/2 mt-1" />`)).toEqual([])
    expect(literalHeights('x', `'h-[30px] w-[30px]' // ui-exception: drawn on the post image`)).toEqual([])
    expect(literalHeights('x', `<div className="h-control-sm w-control-sm max-h-96 h-90">`)).toEqual([])
  })

  it('no source file under src/ writes a literal control height', () => {
    const hits = FILES.flatMap((file) => literalHeights(file, readFileSync(file, 'utf8')))
    expect(hits).toEqual([])
  })
})
