// The fallback-font notice (031 FR-24), as fixed text from the render note. Pure: no I/O and no
// Prisma, so it is safe to import anywhere (client components included).

// GET /api/drafts/[id] -> fontNotice.
export interface FontNotice {
  message: string
}

// "A", "A and B", "A, B and C".
function listOf(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * The notice for a render note: null when there is no note or nothing is missing. Several
 * families are named in one sentence, in the order the render reported them.
 */
export function fontNoticeFor(notes: { fontsMissing?: readonly string[] } | null | undefined): FontNotice | null {
  const missing = [...new Set((notes?.fontsMissing ?? []).filter((f) => typeof f === 'string' && f.trim()))]
  if (missing.length === 0) return null
  return { message: `The image used a fallback font: ${listOf(missing)} did not load.` }
}
