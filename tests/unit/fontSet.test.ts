// FR-22 — the font-set stamp recorded beside promptVersion on a draft. The
// digest is host-specific by design, so nothing here asserts a literal hash;
// what matters is that the id is stable, order-independent, computed ONCE per
// process, and null (never a throw) when there are no readable font files.

import { describe, it, expect, vi } from 'vitest'

// Counts directory reads so "memoized" can be asserted for real rather than by
// comparing two equal strings. vi.hoisted: the mock factory runs at import time,
// before a plain module-scope const would be initialized.
const fs = vi.hoisted(() => ({ readdirCalls: 0 }))

vi.mock('node:fs', () => ({
  readdirSync: (dir: string) => {
    fs.readdirCalls++
    // One flat directory with two fonts; any nested path reads as empty.
    if (dir.endsWith('Fonts') || dir === '/usr/share/fonts') {
      return [
        { name: 'NotoSansSinhala-Regular.ttf', isDirectory: () => false },
        { name: 'fonts.dir', isDirectory: () => false },
        { name: 'DejaVuSans.ttf', isDirectory: () => false },
      ]
    }
    throw new Error('ENOENT')
  },
}))

import { getFontSetId, fontSetIdFromFiles } from '@/lib/renderer/fontSet'

describe('fontSetIdFromFiles', () => {
  it('produces a short, stable id of the expected shape', () => {
    const id = fontSetIdFromFiles(['DejaVuSans.ttf', 'NotoSansSymbols2-Regular.ttf'])
    expect(id).toMatch(/^fs-[0-9a-f]{12}$/)
    expect(fontSetIdFromFiles(['DejaVuSans.ttf', 'NotoSansSymbols2-Regular.ttf'])).toBe(id)
  })

  it('does not depend on directory-listing order', () => {
    expect(fontSetIdFromFiles(['b.ttf', 'a.ttf'])).toBe(fontSetIdFromFiles(['a.ttf', 'b.ttf']))
  })

  it('changes when the glyph environment changes', () => {
    const before = fontSetIdFromFiles(['DejaVuSans.ttf'])
    const after = fontSetIdFromFiles(['DejaVuSans.ttf', 'NotoSansSinhala-Regular.ttf'])
    expect(after).not.toBe(before)
  })

  // "Absent, not wrong": no readable fonts means unknown, not a real font set.
  it('returns null when no font files were found', () => {
    expect(fontSetIdFromFiles([])).toBeNull()
  })
})

describe('getFontSetId', () => {
  it('returns null or a well-formed id, and never throws on an unreadable host', () => {
    const id = getFontSetId()
    expect(id === null || /^fs-[0-9a-f]{12}$/.test(id)).toBe(true)
  })

  it('walks the font directories once and memoizes the result', () => {
    const first = getFontSetId()
    const callsAfterFirst = fs.readdirCalls
    expect(callsAfterFirst).toBeGreaterThan(0)

    expect(getFontSetId()).toBe(first)
    expect(getFontSetId()).toBe(first)
    expect(fs.readdirCalls).toBe(callsAfterFirst)
  })
})
