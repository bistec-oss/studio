// The look fixture table (change 028 T3, spec FR-08). Pure data: no renderer
// import, so a unit test can read it. The 57 rows are written out, not
// generated from the dataset, so a size added to the dataset without rows fails
// fixtureCompletenessProblems.
import type { AspectRatio } from '@prisma/client'
import type { ArchetypeMap } from '@/lib/designData'

// The last four exist only for a contract with a composite region (025 A1):
//   screen        a textured screen (the seed is not blank)
//   pass-offset   a blank screen offset from the region, inside the search margin
//   text-overlap  a blank screen whose top runs into the text band
//   small         a blank screen under 60% of the region's area
export type FixtureKind = 'pass' | 'busy' | 'contrast' | 'screen' | 'pass-offset' | 'text-overlap' | 'small'
export type Backdrop = 'dark' | 'light'

// The backdrop each look is meant to have behind its text. A literal, never
// derived from the contract's textTone, so the tone agreement test means something.
export const INTENDED_BACKDROP: Record<string, Backdrop> = {
  'product-showcase': 'dark',
  'editorial-split': 'dark',
  'full-bleed-scene': 'dark',
  spotlight: 'dark',
  'device-screen': 'dark',
}

export interface FixtureSpec {
  id: string // key@version:size
  key: string
  version: number
  size: AspectRatio
  kind: FixtureKind
}

export function fixtureId(key: string, version: number, size: AspectRatio): string {
  return `${key}@${version}:${size}`
}

const row = (key: string, version: number, size: AspectRatio, kind: FixtureKind): FixtureSpec => ({
  id: fixtureId(key, version, size),
  key,
  version,
  size,
  kind,
})

export const LOOK_FIXTURES: readonly FixtureSpec[] = [
  row('product-showcase', 2, 'SQUARE', 'pass'),
  row('product-showcase', 2, 'SQUARE', 'busy'),
  row('product-showcase', 2, 'SQUARE', 'contrast'),
  row('product-showcase', 2, 'PORTRAIT', 'pass'),
  row('product-showcase', 2, 'PORTRAIT', 'busy'),
  row('product-showcase', 2, 'PORTRAIT', 'contrast'),
  row('product-showcase', 2, 'STORY', 'pass'),
  row('product-showcase', 2, 'STORY', 'busy'),
  row('product-showcase', 2, 'STORY', 'contrast'),
  row('editorial-split', 2, 'SQUARE', 'pass'),
  row('editorial-split', 2, 'SQUARE', 'busy'),
  row('editorial-split', 2, 'SQUARE', 'contrast'),
  row('editorial-split', 2, 'PORTRAIT', 'pass'),
  row('editorial-split', 2, 'PORTRAIT', 'busy'),
  row('editorial-split', 2, 'PORTRAIT', 'contrast'),
  row('editorial-split', 2, 'STORY', 'pass'),
  row('editorial-split', 2, 'STORY', 'busy'),
  row('editorial-split', 2, 'STORY', 'contrast'),
  row('full-bleed-scene', 1, 'SQUARE', 'pass'),
  row('full-bleed-scene', 1, 'SQUARE', 'busy'),
  row('full-bleed-scene', 1, 'SQUARE', 'contrast'),
  row('full-bleed-scene', 1, 'PORTRAIT', 'pass'),
  row('full-bleed-scene', 1, 'PORTRAIT', 'busy'),
  row('full-bleed-scene', 1, 'PORTRAIT', 'contrast'),
  row('full-bleed-scene', 1, 'STORY', 'pass'),
  row('full-bleed-scene', 1, 'STORY', 'busy'),
  row('full-bleed-scene', 1, 'STORY', 'contrast'),
  row('spotlight', 2, 'SQUARE', 'pass'),
  row('spotlight', 2, 'SQUARE', 'busy'),
  row('spotlight', 2, 'SQUARE', 'contrast'),
  row('spotlight', 2, 'PORTRAIT', 'pass'),
  row('spotlight', 2, 'PORTRAIT', 'busy'),
  row('spotlight', 2, 'PORTRAIT', 'contrast'),
  row('spotlight', 2, 'STORY', 'pass'),
  row('spotlight', 2, 'STORY', 'busy'),
  row('spotlight', 2, 'STORY', 'contrast'),
  row('device-screen', 1, 'SQUARE', 'pass'),
  row('device-screen', 1, 'SQUARE', 'busy'),
  row('device-screen', 1, 'SQUARE', 'contrast'),
  row('device-screen', 1, 'SQUARE', 'screen'),
  row('device-screen', 1, 'SQUARE', 'pass-offset'),
  row('device-screen', 1, 'SQUARE', 'text-overlap'),
  row('device-screen', 1, 'SQUARE', 'small'),
  row('device-screen', 1, 'PORTRAIT', 'pass'),
  row('device-screen', 1, 'PORTRAIT', 'busy'),
  row('device-screen', 1, 'PORTRAIT', 'contrast'),
  row('device-screen', 1, 'PORTRAIT', 'screen'),
  row('device-screen', 1, 'PORTRAIT', 'pass-offset'),
  row('device-screen', 1, 'PORTRAIT', 'text-overlap'),
  row('device-screen', 1, 'PORTRAIT', 'small'),
  row('device-screen', 1, 'STORY', 'pass'),
  row('device-screen', 1, 'STORY', 'busy'),
  row('device-screen', 1, 'STORY', 'contrast'),
  row('device-screen', 1, 'STORY', 'screen'),
  row('device-screen', 1, 'STORY', 'pass-offset'),
  row('device-screen', 1, 'STORY', 'text-overlap'),
  row('device-screen', 1, 'STORY', 'small'),
]

// 031 T16: candidate contracts (a version above its look's `current`, not yet served). The render
// suite runs these with the shipped rows. Empty since T18: OP-031 passed and spotlight@2 moved into
// LOOK_FIXTURES (the v1 spotlight rows left with `current` 1 -> 2; v1 stays released in the dataset).
export const CANDIDATE_FIXTURES: readonly FixtureSpec[] = []

// 031 T18: released contracts below their look's `current`. They still resolve (a stamp names
// them and refine reads the stamped version), so the render suite keeps proving the check on them.
// fixtureCompletenessProblems ignores them: it wants exactly the current contracts.
export const SUPERSEDED_FIXTURES: readonly FixtureSpec[] = [
  row('spotlight', 1, 'SQUARE', 'pass'),
  row('spotlight', 1, 'SQUARE', 'busy'),
  row('spotlight', 1, 'SQUARE', 'contrast'),
  row('spotlight', 1, 'PORTRAIT', 'pass'),
  row('spotlight', 1, 'PORTRAIT', 'busy'),
  row('spotlight', 1, 'PORTRAIT', 'contrast'),
  row('spotlight', 1, 'STORY', 'pass'),
  row('spotlight', 1, 'STORY', 'busy'),
  row('spotlight', 1, 'STORY', 'contrast'),
]

const KINDS: readonly FixtureKind[] = ['pass', 'busy', 'contrast']
// The screen kinds exist exactly for a contract with a composite region (025, A1).
const KINDS_WITH_SCREEN: readonly FixtureKind[] = [...KINDS, 'screen', 'pass-offset', 'text-overlap', 'small']

// Problems between the dataset's current contracts and the table: a missing or
// extra (key, current version, size, kind) row, or a duplicate.
export function fixtureCompletenessProblems(source: ArchetypeMap, table: readonly FixtureSpec[]): string[] {
  const problems: string[] = []
  const want = new Set<string>()
  for (const a of Object.values(source)) {
    const sizeMap = a.versions[a.current]?.sizes ?? {}
    for (const size of Object.keys(sizeMap) as AspectRatio[]) {
      const hasComposite = sizeMap[size]?.regions.some((r) => r.purpose === 'composite') ?? false
      for (const kind of hasComposite ? KINDS_WITH_SCREEN : KINDS) want.add(`${fixtureId(a.key, a.current, size)}#${kind}`)
    }
  }
  const have = new Map<string, number>()
  for (const f of table) {
    const k = `${f.id}#${f.kind}`
    have.set(k, (have.get(k) ?? 0) + 1)
  }
  for (const k of want) if (!have.has(k)) problems.push(`missing fixture ${k}`)
  for (const [k, n] of have) {
    if (!want.has(k)) problems.push(`extra fixture ${k}`)
    if (n > 1) problems.push(`duplicate fixture ${k}`)
  }
  return problems
}
