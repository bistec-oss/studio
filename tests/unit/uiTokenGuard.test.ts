import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// AC-14 (011 FR-13): the Frozen Light layer stays gone. Every .ts/.tsx/.css
// file under src/ is checked against the three patterns of 011 design.md §7
// (legacy light-*/dark-* colour utilities, the glass utilities, raw Tailwind
// palette colours) plus the removed GlassInput/GlassPanel names. A line that
// carries `ui-exception:` is skipped, which covers both `// ui-exception: …`
// and the JSX form `{/* ui-exception: … */}` (DESIGN_SYSTEM.md §11).
//
// 014 FR-11 adds four tokens to that guard, matched as whole class tokens:
// glow-blob, animate-scale-in, font-inter and the legacy primary colour family
// (text-primary, hover:bg-primary-light, text-primary/50, …). 018 FR-07 widens
// the family to digit-suffixed shades (text-primary-500, bg-primary-600/20).
//
// 014 FR-05: the shared atoms and page primitives are defined once, in
// src/components/ui/. Any other file under src/ that declares one of their
// names is a new copy and fails here (014 design.md §5). A copy has no
// legitimate exception, so `ui-exception:` does not apply to this guard. 014's
// small-caps-literal check (`tracking-[0.14em]` outside ui/) is superseded by
// the deny-list's pattern 5, which bans every positive arbitrary tracking,
// ui/ included (021 design.md §6).
//
// 021 FR-13: a deny-list of Folio leftovers (021 design.md §6), switched on
// pattern by pattern in the task that removed each one's last hit; every
// pattern is on since 021 T8. There is no legitimate Folio leftover, so
// `ui-exception:` does not apply to it either.

const ROOT = process.cwd()
const SRC = resolve(ROOT, 'src')

// 014 FR-11: a whole class token starts at the start of the line or after one
// of \s " ' ` { ( : (so a variant such as `hover:text-primary` is caught), and
// ends at the end of the line or before one of \s " ' ` } ) ] / (so an
// opacity such as `text-primary/50` is caught) or , . ; : — the punctuation
// that follows a token in a comment, since comments are scanned like code
// (the old Modal comment read "NOT animate-scale-in: the keyframes …").
// `my-glow-blob-x`, `xtext-primary` and `animate-scale-in-out` are other
// tokens and pass.
const START = String.raw`(?:^|(?<=[\s"'\`{(:!]))`
const END = String.raw`(?=$|[\s"'\`})\]/,.;:])`

const PATTERNS: Array<[string, RegExp]> = [
  [
    'legacy light-/dark- colour utility',
    /(bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder)-(light|dark)-[a-z-]+/,
  ],
  ['glass utility', /\bglass(-panel|-popover|-input)?\b/],
  [
    'raw palette colour',
    /(bg|text|border|ring|fill|stroke)-(slate|gray|zinc|neutral|stone|sky|blue|red|green|amber|emerald|violet|purple|indigo|rose|orange|yellow|teal|cyan|lime|pink|fuchsia)-\d{2,3}/,
  ],
  ['removed Glass primitive', /GlassInput|GlassPanel/],
  // 014 FR-11, matched as whole class tokens (design.md §5).
  ['glow blob', new RegExp(`${START}glow-blob${END}`)],
  ['scale-in animation', new RegExp(`${START}animate-scale-in${END}`)],
  ['Inter font', new RegExp(`${START}font-inter${END}`)],
  [
    'legacy primary colour',
    new RegExp(
      `${START}(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|placeholder|decoration|shadow)-primary(?:-[a-z0-9]+)*${END}`
    ),
  ],
]

// 021 design.md §6, numbered as there. Each entry: the label, the pattern, the
// repo-relative files it does not apply to (data, not UI), and optionally the
// path prefixes it is limited to (every file under src/ when absent).
const FOLIO_PATTERNS: Array<[string, RegExp, string[], string[]?]> = [
  // 1 (T1). No file is excluded since 031 T8 deleted the brand-kit font list: the
  // post-font catalogue is a JSON snapshot read by the server, never UI text.
  ['Folio font family', /fraunces|instrument[ _]sans/i, []],
  // 2 (T1)
  ['removed font utility', new RegExp(`${START}font-(?:display|text)${END}`), []],
  // 3 (T1)
  ['opsz font-variation setting', /opsz|font-variation-settings/, []],
  // 4a (T2), the import-path half. The file-name half is FOLIO_FILE_NAME.
  ['Folio module import', /from\s+['"][^'"]*folio[^'"]*['"]/i, []],
  // 4b (T8). The word on any line, comments included; `portfolio` passes.
  ['Folio name', /\bfolio\b/i, []],
  // 5 (T6). A literal positive letter-spacing: Folio's small-caps tracking and
  // its 0.1em table head. The one small-caps tracking is the tracking-label
  // key, used only by SMALL_CAPS; negative heading tracking passes. Since T8
  // also the property spelled out: an arbitrary property
  // (`[letter-spacing:0.14em]`), CSS, or a style object (`letterSpacing`).
  ['positive tracking literal', /tracking-\[0?\.\d+em\]|letter-?spacing\s*:\s*['"]?0?\.\d+em/i, []],
  // 6 (T6). Small caps outside the one atom (021 FR-07): the `uppercase` class,
  // as a whole token, in the app's UI code. src/lib and src/mcp are not UI
  // (their comments say "uppercase" of enum values). The boundaries also catch
  // the property spelled out (`[text-transform:uppercase]`, CSS, a style
  // object), and since T8 in any case, as CSS keywords are.
  [
    'uppercase outside ui/atoms.ts',
    new RegExp(`${START}uppercase${END}`, 'i'),
    ['src/components/ui/atoms.ts'],
    ['src/app/', 'src/components/'],
  ],
  // 7 (T5). The proof plate and its crop marks, by name in any case, and the
  // CROP class constant (case-sensitive, so "CSS-crop" and "cropped" pass).
  ['proof plate or crop mark', /proof[- ]plate|crop[- ]mark/i, []],
  ['CROP constant', /\bCROP\b/, []],
  // 8 (T3; tightened in T8). A hard offset shadow: non-zero x and y offsets
  // (either sign) and a zero blur, in CSS or an arbitrary class. The first
  // offset must open the shadow: it may not follow another length, so a soft
  // `0 2px 2px 0` (y, blur, spread) is not read as x, y, blur. Graphite's soft
  // layers (`0 1px 2px …`, `0 6px 20px -10px …`) pass.
  [
    'hard offset shadow',
    /(?<![A-Za-z0-9.-])(?<!\d(?:px)?[ _])-?[1-9]\d*px[ _]-?[1-9]\d*px[ _]0(?:px)?(?=$|[ _,;)\]])/,
    [],
  ],
  // 9 (T8). Folio's 2 px block rule.
  ['2 px block rule', new RegExp(`${START}border-[tb]-2${END}`), []],
  // 10 (T2)
  ['drop entrance', new RegExp(`${START}animate-drop${END}`), []],
]

// 021 design.md §6 pattern 4a (T2), the file-name half: no module under src/
// is named after Folio (FR-06).
const FOLIO_FILE_NAME = /folio/i

const SHARED_NAME =
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:const|let|function)\s+(FOCUS|SCROLL_FOCUS|SMALL_CAPS|EYEBROW|FIELD_LABEL|PAGE_TITLE|PAGE_LEAD|SECTION_HEAD|SECTION_NUMERAL|SUB_HEAD|KIT_TITLE|STEP_HEAD|STEP_NUMERAL|STEP_LEAD|GROUP_HEAD|ASIDE_HEAD|NOTICE|WARN_NOTICE|ICON|ICON_SM|ICON_BUTTON|TEXT_LINK|TAG|TABLE_HEAD_ROW|ROW|COMPACT_FIELD|COMPACT_TEXTAREA|PILL_BADGE|PageHead|PageTitle|SectionHead|SectionHeader|Notice|FieldLabel|StatusWord|GateNotice)\b/
const UI_DIR = 'src/components/ui/'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : []
  })
}

function findViolations(file: string, text: string): string[] {
  const hits: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes('ui-exception:')) return
    for (const [label, re] of PATTERNS) {
      const m = line.match(re)
      if (m) hits.push(`${file}:${i + 1}: ${m[0]} (${label})`)
    }
  })
  return hits
}

// FR-05. `file` is the repo-relative path with forward slashes.
function findSharedCopies(file: string, text: string): string[] {
  if (file.startsWith(UI_DIR)) return []
  const hits: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    const name = line.match(SHARED_NAME)
    if (name) hits.push(`${file}:${i + 1}: ${name[1]} (shared name outside ${UI_DIR})`)
  })
  return hits
}

describe('UI token guard (AC-14)', () => {
  const files = sourceFiles(SRC)

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(100)
    expect(files.some((f) => f.endsWith('globals.css'))).toBe(true)
  })

  it('finds no legacy colour utility, glass class, raw palette colour or Glass primitive in src/', () => {
    const hits = files.flatMap((f) =>
      findViolations(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern, and honours ui-exception in both comment forms', () => {
    const sample = [
      '<div className="bg-light-surface">', // 1
      '<div className="glass-panel">', // 2
      '<p className="text-slate-500">', // 3
      "import { GlassInput } from '@/components/ui'", // 4
      '<div className="bg-white" /> // ui-exception: post frame', // 5
      '<p>{/* ui-exception: swatch */}<span className="text-sky-500" /></p>', // 6
      '<div className="bg-surface text-fg">', // 7
    ].join('\n')
    const hits = findViolations('sample.tsx', sample)
    expect(hits.map((h) => h.split(':')[1])).toEqual(['1', '2', '3', '4'])
  })

  // 014 AC-10: each FR-11 token is flagged as a whole class token, wherever a
  // variant or an opacity puts it, and only there.
  it.each([
    ['<div className="glow-blob" />', 'glow-blob'],
    ["cn('animate-scale-in', open && 'block')", 'animate-scale-in'],
    // The Modal comment before 014 T12: comments are scanned, punctuation ends a token.
    ['// animate-modal-in, NOT animate-scale-in: the keyframes must carry', 'animate-scale-in'],
    ['<p className="md:animate-scale-in">', 'animate-scale-in'],
    ['<p className="font-inter text-fg">', 'font-inter'],
    ['<p className="text-primary">', 'text-primary'],
    ['<a className="text-fg hover:text-primary">', 'text-primary'],
    ['<span className="text-primary/50">', 'text-primary'],
    ['<div className={`bg-primary-light ${x}`}>', 'bg-primary-light'],
    ['<svg className="[&_path]:fill-primary">', 'fill-primary'],
    // 018 FR-07: the digit-suffixed shades of the legacy family.
    ['<p className="text-primary-500">', 'text-primary-500'],
    ['<div className="hover:bg-primary-600/20">', 'bg-primary-600'],
  ])('flags %s', (line, token) => {
    const hits = findViolations('sample.tsx', line)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain(`: ${token} (`)
  })

  it.each([
    '<Button variant="primary">',
    '<div className="my-glow-blob-x" />',
    '<p className="xtext-primary">',
    '<p className="xtext-primary-500">',
    '<p className="animate-scale-in-out font-interface">',
    '<p className="text-fg">Primary text</p>',
    '// animate-modal-in, not the old scale-in keyframe: the keyframes must carry',
    '<div className="text-primary" /> // ui-exception: self-test',
  ])('passes %s', (line) => {
    expect(findViolations('sample.tsx', line)).toEqual([])
  })
})

// 021 FR-13. `file` is the repo-relative path with forward slashes.
function findFolioLeftovers(file: string, text: string): string[] {
  const hits: string[] = []
  const name = file.split('/').pop() ?? file
  if (FOLIO_FILE_NAME.test(name)) hits.push(`${file}: ${name} (Folio module name)`)
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [label, re, excluded, only] of FOLIO_PATTERNS) {
      if (excluded.includes(file)) continue
      if (only && !only.some((prefix) => file.startsWith(prefix))) continue
      const m = line.match(re)
      if (m) hits.push(`${file}:${i + 1}: ${m[0]} (${label})`)
    }
  })
  return hits
}

describe('Folio deny-list (021 FR-13, AC-05)', () => {
  const files = sourceFiles(SRC)

  it('finds no Folio leftover in src/, with every §6 pattern on', () => {
    const hits = files.flatMap((f) =>
      findFolioLeftovers(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it.each([
    // 1
    ["import { Fraunces, JetBrains_Mono } from 'next/font/google'", 'Fraunces'],
    ['const face = Instrument_Sans({ subsets })', 'Instrument_Sans'],
    ['// the text face is Instrument Sans', 'Instrument Sans'],
    // 2
    ['<h2 className="font-display text-ui-lg">', 'font-display'],
    ["cn('font-text', SMALL_CAPS)", 'font-text'],
    ['<p className="md:font-display">', 'font-display'],
    ["'w-full text-left font-text',", 'font-text'],
    // 3
    ['<h1 className="[font-variation-settings:\'opsz\'_144]">', 'font-variation-settings'],
    ["  axes: ['opsz'],", 'opsz'],
    // 4a, the import path (a path where the word is not whole, so 4b stays
    // quiet; a whole-word path fires both, see the case below the table)
    ["import { EYEBROW } from '@/components/ui/folioAtoms'", "from '@/components/ui/folioAtoms'"],
    ["import { ROW } from './folios'", "from './folios'"],
    ['export * from "./FolioKit"', 'from "./FolioKit"'],
    // 4b, the word (021 T8)
    ['// the Folio proof sheet', 'Folio'],
    ['{/* folio: paper and ink */}', 'folio'],
    ["const theme = 'FOLIO'", 'FOLIO'],
    // 5
    ['<th className="py-2 tracking-[0.1em]">', 'tracking-[0.1em]'],
    ["export const SMALL_CAPS = 'text-ui-2xs font-semibold tracking-[0.14em]'", 'tracking-[0.14em]'],
    ['<p className="md:tracking-[.05em]">', 'tracking-[.05em]'],
    // 5, the property spelled out (021 T8)
    ['<p className="[letter-spacing:0.14em]">', 'letter-spacing:0.14em'],
    ['  letter-spacing: 0.1em;', 'letter-spacing: 0.1em'],
    ["<p style={{ letterSpacing: '0.14em' }}>", "letterSpacing: '0.14em"],
    // 6
    ['<span className="ml-2 text-ui-2xs uppercase text-fg-muted">{a.type}</span>', 'uppercase'],
    ["cn('uppercase', open && 'block')", 'uppercase'],
    ['<p className="md:uppercase">', 'uppercase'],
    ['// an uppercase micro-label', 'uppercase'],
    // 6, the property spelled out, and any case (021 T8)
    ['<p className="[text-transform:uppercase]">', 'uppercase'],
    ['<p className="md:[text-transform:UPPERCASE]">', 'UPPERCASE'],
    ['  text-transform: uppercase;', 'uppercase'],
    ["<p style={{ textTransform: 'uppercase' }}>", 'uppercase'],
    // 7
    ['// A proof-plate crop mark (DESIGN_SYSTEM.md §8.12)', 'proof-plate'],
    ['{/* The Proof Plate (§8.12): paper and a hairline edge. */}', 'Proof Plate'],
    ['<span data-role="crop mark" />', 'crop mark'],
    ["const CROP = 'pointer-events-none absolute h-[18px] w-[18px] border-line'", 'CROP'],
    ['<span aria-hidden className={`${CROP} left-5 top-5 border-l border-t`} />', 'CROP'],
    // 8
    ['active:shadow-[2px_2px_0_0_rgb(0_0_0/0.2)]', '2px_2px_0'],
    ['  --shadow-raised: 4px 4px 0 0 rgb(33 28 24);', '4px 4px 0'],
    ['  box-shadow: 6px 6px 0px rgb(var(--fg));', '6px 6px 0px'],
    // 8, negative offsets, inset, and a shadow with no colour (021 T8)
    ['  box-shadow: -2px 2px 0 0 rgb(0 0 0 / 0.2);', '-2px 2px 0'],
    ['active:shadow-[2px_-2px_0_0_rgb(0_0_0/0.2)]', '2px_-2px_0'],
    ['shadow-[inset_-3px_-3px_0_rgb(0_0_0)]', '-3px_-3px_0'],
    ['  box-shadow: 4px 4px 0;', '4px 4px 0'],
    // 9 (021 T8)
    ['<div className="border-t-2 border-fg pt-4">', 'border-t-2'],
    ["cn('mb-6', open && 'md:border-b-2')", 'border-b-2'],
    // 10
    ['<div className="surface-raised animate-drop">', 'animate-drop'],
    ["cn('menu', open && 'motion-safe:animate-drop')", 'animate-drop'],
  ])('flags %s', (line, token) => {
    const hits = findFolioLeftovers('src/components/x.tsx', line)
    expect(hits).toHaveLength(1)
    expect(hits[0]).toContain(`: ${token} (`)
  })

  it.each([
    '<p className="font-sans font-mono font-semibold">',
    '<p className="font-textual xfont-display font-display-x">',
    "const jakarta = Plus_Jakarta_Sans({ variable: '--font-sans' })",
    '<span className="font-mono">token</span>',
    // 5: the label key, negative and named tracking
    '<h2 className="tracking-[-0.01em] tracking-tight tracking-label">',
    // 6: other tokens that contain the word
    '<p className="normal-case">{name.toUpperCase()}</p>',
    '<p className="uppercased-x xuppercase">',
    // 4a and 4b: imports of the new modules, and a word that only contains it
    "import { ROW } from '@/components/ui/atoms'",
    "import { ROW_TITLE } from '@/components/campaigns/classes'",
    '// a portfolio of posts',
    // 7: other uses of the words
    '// We CSS-crop to that region; the post is never cropped.',
    "const CROP_RATIO = 1 // a cropped image, a crop of the logo",
    '{/* The post stage: a bezel card holding the post. */}',
    // 8: soft, blurred or single-offset shadows, and other px pairs
    '  --shadow-panel: 0 1px 2px rgb(24 24 22 / 0.04), 0 6px 20px -10px rgb(24 24 22 / 0.10);',
    '  --shadow-raised: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 2px 4px rgb(0 0 0 / 0.30);',
    "shadow-[10px_20px_0.5px_rgb(0_0_0)] h-[52px] w-[52px] pl-[7px]",
    // 8 (021 T8): a soft shadow whose y, blur and spread read "2px 2px 0", in
    // CSS and as a class, and Graphite's dark inset highlight (x 0, blur 0)
    '  box-shadow: 0 2px 2px 0 rgb(0 0 0 / 0.2);',
    'shadow-[0_2px_2px_0_rgb(0_0_0/0.2)] shadow-[0px_2px_2px_0px_rgb(0_0_0)]',
    '  --shadow-panel: inset 0 1px 0 rgb(255 255 255 / 0.04), 0 1px 2px rgb(0 0 0 / 0.30), 0 8px 24px -12px rgb(0 0 0 / 0.50);',
    // 9: other border widths and sides
    '<div className="border-t border-b border-line-subtle border-2 border-x-2 border-t-20">',
    // 5 and 6: other letter-spacing and text-transform values
    '<p style={{ letterSpacing: \'-0.01em\', textTransform: \'none\' }} className="[text-transform:capitalize]">',
    // 10: other animations
    '<div className="surface-raised origin-top-left animate-pop">',
    '<div className="animate-dropdown xanimate-drop">',
  ])('passes %s', (line) => {
    expect(findFolioLeftovers('src/components/x.tsx', line)).toEqual([])
  })

  it('does not honour ui-exception, and excludes no file from pattern 1', () => {
    expect(findFolioLeftovers('src/components/x.tsx', '<p className="font-text" /> // ui-exception: x')).toHaveLength(1)
    const fontList = "  'Lexend','Instrument Sans','Kanit',"
    expect(findFolioLeftovers('src/components/admin/brandkits/FontEditor.tsx', fontList)).toHaveLength(1)
  })

  // 021 T8: the old module path names the word whole, so 4a and 4b both fire.
  it('flags an import of the old folio module under both 4a and 4b', () => {
    const hits = findFolioLeftovers('src/components/x.tsx', "import { EYEBROW } from '@/components/ui/folio'")
    expect(hits.map((h) => h.slice(h.lastIndexOf('(')))).toEqual(['(Folio module import)', '(Folio name)'])
  })

  it('flags a module named after Folio, whatever its case or extension (4a)', () => {
    for (const file of ['src/components/ui/folio.ts', 'src/components/team/folio.tsx', 'src/app/Folio.css']) {
      expect(findFolioLeftovers(file, ''), file).toEqual([`${file}: ${file.split('/').pop()} (Folio module name)`])
    }
    for (const file of ['src/components/ui/atoms.ts', 'src/components/campaigns/classes.ts']) {
      expect(findFolioLeftovers(file, ''), file).toEqual([])
    }
  })

  // 021 T6: pattern 5 replaces T2's small-caps-literal scan (it bans every
  // positive arbitrary tracking) and applies everywhere, ui/ included. Pattern
  // 6 applies only to the app's UI code, and not to the one atom module.
  it('applies pattern 5 inside ui/, and pattern 6 to src/app and src/components except ui/atoms.ts', () => {
    const tracking = "export const SMALL_CAPS = 'text-ui-2xs tracking-[0.14em]'"
    expect(findFolioLeftovers('src/components/ui/atoms.ts', tracking)).toHaveLength(1)
    expect(findFolioLeftovers('src/components/ui/SectionHead.tsx', tracking)).toHaveLength(1)
    const caps = "export const SMALL_CAPS = 'text-ui-2xs font-semibold uppercase tracking-label'"
    expect(findFolioLeftovers('src/components/ui/atoms.ts', caps)).toEqual([])
    expect(findFolioLeftovers('src/lib/channels.ts', '// normalizing to uppercase before lookup')).toEqual([])
    expect(findFolioLeftovers('src/mcp/tools/generate.ts', '// Channel enum values are uppercase;')).toEqual([])
    for (const file of [
      'src/components/ui/StatusChip.tsx',
      'src/components/admin/brandkits/KitDetail.tsx',
      'src/app/(app)/campaigns/page.tsx',
      'src/app/globals.css',
    ]) {
      expect(findFolioLeftovers(file, caps), file).toHaveLength(1)
    }
  })
})

describe('Shared-name guard (014 FR-05, AC-02)', () => {
  const files = sourceFiles(SRC)

  it('finds no copy of a shared atom or primitive outside src/components/ui/', () => {
    const hits = files.flatMap((f) =>
      findSharedCopies(relative(ROOT, f).split('\\').join('/'), readFileSync(f, 'utf8'))
    )
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('flags each pattern outside ui, ignores ui-exception, and passes the same lines inside ui', () => {
    const sample = [
      "export const EYEBROW = 'x'", // 1
      'const FOCUS =', // 2
      'export function SectionHead({ title }: Props) {', // 3
      '  function StatusWord() {', // 4
      '<span className="uppercase tracking-[0.14em]">', // 5: not a copy (the deny-list's patterns 5 and 6 catch it)
      "export const EYEBROW = 'x' // ui-exception: not honoured by this guard", // 6
      "const SHELL_ICON_BUTTON = 'x'", // 7: a different name
      'const ICON_SIZE = 15', // 8: a longer name
      "import { EYEBROW, SectionHead } from '@/components/ui/atoms'", // 9: a use, not a copy
      '<span className={`${EYEBROW} mb-3`}>', // 10
      '<th className="tracking-[0.1em]">', // 11: the same (pattern 5)
      "export const PILL_BADGE = 'x'", // 12 (021 T2)
      'export function GateNotice({ title }: Props) {', // 13 (021 T2)
      "const ROW = 'border-b py-3'", // 14 (021 T8)
      "export const ROW_TITLE = 'x'", // 15: a longer name (campaigns/classes.ts)
    ].join('\n')
    const lines = (hits: string[]) => hits.map((h) => h.split(':')[1])
    expect(lines(findSharedCopies('src/components/team/ApiKeysCard.tsx', sample))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '6',
      '12',
      '13',
      '14',
    ])
    expect(findSharedCopies('src/components/ui/atoms.ts', sample)).toEqual([])
  })
})
