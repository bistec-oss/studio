// Font-set identifier (T8, change 004 Phase 1, FR-22): a digest of the fonts
// installed in the image at boot, stamped on Draft alongside promptVersion so a
// render's glyph environment is attributable after the fact (a font-install
// commit like T7's font-noto-symbols can change how an already-approved draft
// looks; this makes that attributable, not per-draft overridable).
//
// fontSetIdFromApkDb is the pure parser, tested here without touching the
// filesystem — getFontSetId (the impure, memoized, apk-db-reading wrapper) is
// exercised only implicitly (real Alpine dbs are exactly this shape) since
// there is no apk db on Windows/Linux CI to read.

import { describe, it, expect } from 'vitest'
import { fontSetIdFromApkDb } from '@/lib/renderer/fontSet'

const SAMPLE_DB = `P:musl
V:1.2.5-r0
A:x86_64
S:123

P:font-noto-sinhala
V:1:20201206-r0
A:noarch
S:456

P:font-noto-symbols
V:1:20201206-r0
A:noarch
S:789

P:chromium
V:128.0.0-r0
A:x86_64
S:999
`

describe('fontSetIdFromApkDb', () => {
  it('digests only the font- packages, ignoring non-font packages', () => {
    const id = fontSetIdFromApkDb(SAMPLE_DB)
    expect(id).not.toBeNull()
    expect(id).toMatch(/^apk:[0-9a-f]{12}$/)
  })

  it('is order-independent — the same packages in a different order digest identically', () => {
    const reordered = `P:font-noto-symbols
V:1:20201206-r0
A:noarch
S:789

P:musl
V:1.2.5-r0
A:x86_64
S:123

P:chromium
V:128.0.0-r0
A:x86_64
S:999

P:font-noto-sinhala
V:1:20201206-r0
A:noarch
S:456
`
    expect(fontSetIdFromApkDb(reordered)).toBe(fontSetIdFromApkDb(SAMPLE_DB))
  })

  it('changes when a font package version changes', () => {
    const bumped = SAMPLE_DB.replace(
      'P:font-noto-symbols\nV:1:20201206-r0',
      'P:font-noto-symbols\nV:2:20260101-r0',
    )
    expect(fontSetIdFromApkDb(bumped)).not.toBe(fontSetIdFromApkDb(SAMPLE_DB))
  })

  it('changes when a font package is added or removed', () => {
    const withoutSymbols = SAMPLE_DB.split('\n\n')
      .filter((block) => !block.startsWith('P:font-noto-symbols'))
      .join('\n\n')
    expect(fontSetIdFromApkDb(withoutSymbols)).not.toBe(fontSetIdFromApkDb(SAMPLE_DB))
  })

  it('returns a stable, non-null id when packages exist but none are fonts', () => {
    const noFonts = `P:musl
V:1.2.5-r0
A:x86_64
S:123

P:chromium
V:128.0.0-r0
A:x86_64
S:999
`
    const id = fontSetIdFromApkDb(noFonts)
    expect(id).not.toBeNull()
    expect(id).toBe(fontSetIdFromApkDb(noFonts))
  })

  it('returns null for an empty string', () => {
    expect(fontSetIdFromApkDb('')).toBeNull()
  })

  it('returns null for unparseable garbage with no package records', () => {
    expect(fontSetIdFromApkDb('not an apk db\njust some text\n')).toBeNull()
  })
})
