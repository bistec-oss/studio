import { findFamily } from './catalogue'
import { googleFontsUrl } from './url'
import type { PostFontPlan } from './inject'
import { isOfferedScript } from './types'
import { MOCK_FONT_MISSING } from './renderNotes'
import { MOCK_PUPPETEER } from '@/lib/testHooks'

// The post-font plan of a kit (031 FR-22, design 5.4). Server code: it reads the catalogue.

// A catalogue family, or (under the mock renderer only) a family carrying the missing-font
// sentinel, so a mock E2E can reach the font notice through a kit font.
function requestable(name: string): boolean {
  return !!findFamily(name) || (MOCK_PUPPETEER && name.includes(MOCK_FONT_MISSING))
}

function names(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list
    .map((f) => (f && typeof f === 'object' ? (f as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
}

/**
 * families: the catalogue-known names of `kit.fonts`, in order (an unknown name, such as a FONT
 * artifact, stays out of the request; the model's own @import still covers it).
 * scriptFamilies: the kit's script fonts for offered scripts, catalogue-known only (FR-21).
 * A tolerant read: anything malformed contributes nothing.
 */
export function postFontPlan(kit: { fonts?: unknown; scriptFonts?: unknown } | null | undefined): PostFontPlan {
  if (!kit) return { families: [], scriptFamilies: [] }
  const families = [...new Set(names(kit.fonts).filter(requestable))]
  const scriptFamilies: string[] = []
  const map = kit.scriptFonts
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const [script, family] of Object.entries(map as Record<string, unknown>)) {
      if (!isOfferedScript(script) || typeof family !== 'string') continue
      const found = findFamily(family)
      if ((found && found.scripts.includes(script)) || (MOCK_PUPPETEER && family.includes(MOCK_FONT_MISSING))) {
        if (!scriptFamilies.includes(family)) scriptFamilies.push(family)
      }
    }
  }
  return { families, scriptFamilies }
}

/** The request for a plan's families: the catalogue-aware css2 URL (FR-19). */
export function postFontsUrl(families: string[]): string {
  return googleFontsUrl(families, findFamily)
}

