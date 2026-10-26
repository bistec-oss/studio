import data from './catalogue.json'
import type { FontCatalogue, FontFamily } from './types'

// The one font lookup (031 FR-18). Server code only: the browser reads it through GET /api/fonts.
// No `import 'server-only'` marker: the MCP server (tsx) and the scheduler (esbuild, plain node)
// import this file, and the real marker package throws outside Next. fontsBoundary.test.ts
// fails if a client file imports this module or the JSON instead.
const catalogue = data as unknown as FontCatalogue
const BY_NAME = new Map<string, FontFamily>(catalogue.families.map((f) => [f.family, f]))

export const CATALOGUE_DATE: string = catalogue.snapshotDate

/** Exact, case-sensitive. A delisted family still resolves. */
export function findFamily(name: string): FontFamily | null {
  return BY_NAME.get(name) ?? null
}

/** Case-insensitive: names that start with the query first, then names that contain it. */
export function searchFamilies(q: string, limit = 20): FontFamily[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return catalogue.families.slice(0, limit)
  const prefix: FontFamily[] = []
  const inner: FontFamily[] = []
  for (const f of catalogue.families) {
    const n = f.family.toLowerCase()
    if (n.startsWith(needle)) prefix.push(f)
    else if (n.includes(needle)) inner.push(f)
  }
  return [...prefix, ...inner].slice(0, limit)
}

export function familiesForScript(script: string): FontFamily[] {
  return catalogue.families.filter((f) => f.scripts.includes(script) && !f.delisted)
}
