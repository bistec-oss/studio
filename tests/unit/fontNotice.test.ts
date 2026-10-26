// 031 FR-24: the fallback-font notice text, the render note schema and the bounded font check.
import { describe, it, expect, vi } from 'vitest'
import { fontNoticeFor } from '@/lib/drafts/fontNotice'
import { mockFontsMissing, parseRenderNotes, renderNotesFrom, MOCK_FONT_MISSING } from '@/lib/fonts/renderNotes'
import { applyPostFonts } from '@/lib/fonts/inject'
import { runFontCheck } from '@/lib/renderer/puppeteer'

describe('fontNoticeFor', () => {
  it('is null with no note or nothing missing', () => {
    expect(fontNoticeFor(null)).toBeNull()
    expect(fontNoticeFor(undefined)).toBeNull()
    expect(fontNoticeFor({ fontsMissing: [] })).toBeNull()
  })

  it('names one family', () => {
    expect(fontNoticeFor({ fontsMissing: ['Noto Sans Sinhala'] })).toEqual({
      message: 'The image used a fallback font: Noto Sans Sinhala did not load.',
    })
  })

  it('names several in one sentence, in order, once each: "A and B", "A, B and C"', () => {
    expect(fontNoticeFor({ fontsMissing: ['Poppins', 'Noto Sans Sinhala'] })!.message).toBe(
      'The image used a fallback font: Poppins and Noto Sans Sinhala did not load.',
    )
    expect(fontNoticeFor({ fontsMissing: ['A', 'B', 'C', 'A'] })!.message).toBe(
      'The image used a fallback font: A, B and C did not load.',
    )
  })
})

describe('the render note', () => {
  it('renderNotesFrom is null for an empty or missing list, and de-duplicates and caps', () => {
    expect(renderNotesFrom([])).toBeNull()
    expect(renderNotesFrom(null)).toBeNull()
    expect(renderNotesFrom(['A', 'A', ' '])).toEqual({ fontsMissing: ['A'] })
    const many = Array.from({ length: 30 }, (_, i) => `F${i}`)
    expect(renderNotesFrom(many)!.fontsMissing).toHaveLength(20)
  })

  it('parseRenderNotes is tolerant: anything that does not parse is null', () => {
    expect(parseRenderNotes({ fontsMissing: ['A'] })).toEqual({ fontsMissing: ['A'] })
    for (const bad of [null, 'x', {}, { fontsMissing: [] }, { fontsMissing: [1] }, { fontsMissing: ['A'], x: 1 }]) {
      expect(parseRenderNotes(bad)).toBeNull()
    }
  })

  it('the mock check reports the marked link families that carry the sentinel', () => {
    const family = `Ghost ${MOCK_FONT_MISSING}`
    const html = applyPostFonts(
      '<html><head></head><body></body></html>',
      { families: ['Poppins', family], scriptFamilies: [] },
      (f) => `https://fonts.googleapis.com/css2?${f.map((x) => `family=${encodeURIComponent(x)}`).join('&')}`,
    )
    expect(mockFontsMissing(html)).toEqual([family])
    expect(mockFontsMissing('<html><head></head></html>')).toEqual([])
  })
})

describe('runFontCheck (NFR-06): bounded, never throwing', () => {
  it('a collector that throws gives [] and one log line', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = { evaluate: async () => { throw new Error('page crashed') } }
    expect(await runFontCheck(page as never)).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[renderer] font check: page crashed'))
    warn.mockRestore()
  })

  it('a collector that hangs gives [] after the bound', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const page = { evaluate: () => new Promise(() => {}) }
    expect(await runFontCheck(page as never, 20)).toEqual([])
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('timed out after 20 ms'))
    warn.mockRestore()
  })

  it('passes the collector result through', async () => {
    const page = { evaluate: async () => ['Ghost Font'] }
    expect(await runFontCheck(page as never)).toEqual(['Ghost Font'])
  })
})
