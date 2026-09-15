import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { extname, join } from 'node:path'

// FR-22 — a short identifier for the glyph environment a render ran in, stamped
// on the Draft beside PROMPT_VERSION so an exported post's fonts are
// attributable after the fact ("were the symbol fonts installed when this was
// rendered?").
//
// Why a DIGEST and not a package list: the value has to sit in one column next
// to promptVersion, so it must be short — and it must change whenever the glyph
// environment changes, which a hand-maintained label would not (nobody bumps a
// constant when a Dockerfile `apk add` line gains a font). Hashing the installed
// font FILE NAMES gets both: stable across restarts of the same image, different
// the moment a font package is added or removed. It is an attribution key, not a
// security digest, so 12 hex chars of sha256 is plenty.
//
// Why null is tolerated everywhere downstream: drafts rendered before FR-22 have
// no stamp, and any host whose font directories are unreadable (or that keeps
// its fonts somewhere we don't look — macOS, say) yields null too. Absent, not
// wrong: readers must treat null as "unknown", never as "no fonts".

// Where the OS keeps installed fonts. Alpine's `apk add font-*` lands in
// /usr/share/fonts; /usr/local/share/fonts is the local-install convention.
// Anything else (macOS, an unusual distro layout) simply finds nothing → null.
function fontDirectories(): string[] {
  if (process.platform === 'win32') {
    return [join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts')]
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts']
}

// Only real font files count. Font directories also carry fontconfig configs,
// fonts.dir/fonts.scale indexes and .uuid files, which churn independently of
// which glyphs are available and would make the id noisy.
const FONT_EXTENSIONS = new Set(['.ttf', '.ttc', '.otf', '.otc', '.pfb', '.pfa', '.woff', '.woff2'])

// Font packages install into per-family subdirectories (/usr/share/fonts/noto/…),
// so the walk has to recurse — but bounded, because an unreadable or symlinked
// tree must never turn a stamp lookup into a long traversal.
function collectFontFiles(dir: string, depth = 0): string[] {
  if (depth > 4) return []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    // Missing or unreadable directory — contributes nothing, never throws.
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      out.push(...collectFontFiles(join(dir, entry.name), depth + 1))
    } else if (FONT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      out.push(entry.name)
    }
  }
  return out
}

// Pure core (exported for tests): sorted basenames → stable short id. Sorting
// makes the id independent of directory-listing order; an empty list means we
// found no fonts at all, which is "unknown", not a legitimate font set.
export function fontSetIdFromFiles(names: string[]): string | null {
  if (names.length === 0) return null
  const digest = createHash('sha256')
    .update([...names].sort().join('\n'))
    .digest('hex')
  return `fs-${digest.slice(0, 12)}`
}

let cached: string | null | undefined

// Memoized for the life of the process — the font set cannot change under a
// running container, so the directory walk happens once, on the first render
// that stamps a draft (not at import time, which would make every `next build`
// and every unit-test import walk the host's font tree for nothing).
export function getFontSetId(): string | null {
  if (cached === undefined) {
    cached = fontSetIdFromFiles(fontDirectories().flatMap((dir) => collectFontFiles(dir)))
  }
  return cached
}
