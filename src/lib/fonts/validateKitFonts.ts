import { OFFERED_SCRIPTS, isOfferedScript, type FontFamily } from './types'
import { googleFontsUrl } from './url'

// Save validation (031 FR-20, FR-21), pure: the lookup is an argument.

// A type alias, not an interface: it must be assignable to Prisma's JSON input.
export type KitFont = { name: string; url: string }

export const MAX_KIT_FONTS = 6

export type KitFontsResult = { ok: true; fonts: KitFont[] } | { ok: false; error: string }
export type ScriptFontsResult =
  | { ok: true; scriptFonts: Record<string, string> | null }
  | { ok: false; error: string }

export function validateKitFonts(
  submitted: KitFont[],
  stored: KitFont[],
  lookup: (name: string) => FontFamily | null,
): KitFontsResult {
  if (submitted.length > MAX_KIT_FONTS) {
    return { ok: false, error: `A kit can have at most ${MAX_KIT_FONTS} fonts` }
  }
  const out: KitFont[] = []
  for (const entry of submitted) {
    // Identical to a stored entry: kept as is (a FONT artifact URL, or a family missing from the snapshot).
    if (stored.some((s) => s.name === entry.name && s.url === entry.url)) {
      out.push({ name: entry.name, url: entry.url })
      continue
    }
    if (!lookup(entry.name)) return { ok: false, error: `Unknown font: ${entry.name}` }
    out.push({ name: entry.name, url: googleFontsUrl([entry.name], lookup) })
  }
  return { ok: true, fonts: out }
}

/** `{}` and null clear the map (stored as null). */
export function validateScriptFonts(
  submitted: Record<string, string> | null | undefined,
  lookup: (name: string) => FontFamily | null,
): ScriptFontsResult {
  if (!submitted || Object.keys(submitted).length === 0) return { ok: true, scriptFonts: null }
  const out: Record<string, string> = {}
  for (const [script, family] of Object.entries(submitted)) {
    if (!isOfferedScript(script)) {
      return {
        ok: false,
        error: `Script not offered: ${script} (offered: ${OFFERED_SCRIPTS.join(', ')})`,
      }
    }
    const found = lookup(family)
    if (!found) return { ok: false, error: `Unknown font: ${family}` }
    if (!found.scripts.includes(script)) {
      return { ok: false, error: `${family} does not support ${script}` }
    }
    out[script] = family
  }
  return { ok: true, scriptFonts: out }
}
