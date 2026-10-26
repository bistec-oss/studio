import type { FontCatalogue, FontFamily } from './types'

export const METADATA_SOURCE = 'https://fonts.google.com/metadata/fonts'

// The refresh contract (031 FR-17), pure. A refresh never removes a family: one that is in the
// previous snapshot and missing from the fetched data is kept with `delisted: true`; a delisted
// family that reappears loses the flag. The result is sorted by family name.
export function mergeCatalogue(
  previous: FontCatalogue | null,
  fetched: FontFamily[],
  date: string,
): FontCatalogue {
  const byName = new Map<string, FontFamily>()
  for (const f of fetched) {
    const clean: FontFamily = { ...f }
    delete clean.delisted
    byName.set(f.family, clean)
  }
  for (const old of previous?.families ?? []) {
    if (!byName.has(old.family)) byName.set(old.family, { ...old, delisted: true })
  }
  const families = [...byName.values()].sort((a, b) =>
    a.family < b.family ? -1 : a.family > b.family ? 1 : 0,
  )
  return { snapshotDate: date, source: previous?.source ?? METADATA_SOURCE, families }
}
