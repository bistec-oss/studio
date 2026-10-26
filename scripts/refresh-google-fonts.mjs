// 031 FR-16 / FR-17: refresh the post-font catalogue snapshot (src/lib/fonts/catalogue.json).
//
// An operator script. It is never run in CI and never at app runtime. One fetch of Google's public
// metadata (no key), then the pure mergeCatalogue (src/lib/fonts/merge.ts) so a family that is no
// longer listed is kept with `delisted: true` and the snapshot date is updated.
//
//   node scripts/refresh-google-fonts.mjs
//
// If the fetch fails the script exits non-zero and writes nothing: there is no fallback list.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tsImport } from 'tsx/esm/api'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = join(here, '..', 'src', 'lib', 'fonts', 'catalogue.json')
const SOURCE = 'https://fonts.google.com/metadata/fonts'

const { mergeCatalogue } = await tsImport('../src/lib/fonts/merge.ts', import.meta.url)

let res
try {
  res = await fetch(SOURCE)
} catch (err) {
  console.error(`[fonts] fetch failed: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
}
if (!res.ok) {
  console.error(`[fonts] fetch failed: HTTP ${res.status}`)
  process.exit(1)
}
const text = (await res.text()).replace(/^\)\]\}'/, '')
const meta = JSON.parse(text)
if (!Array.isArray(meta.familyMetadataList) || meta.familyMetadataList.length === 0) {
  console.error('[fonts] no familyMetadataList in the response')
  process.exit(1)
}

const fetched = meta.familyMetadataList.map((e) => {
  const keys = Object.keys(e.fonts ?? {})
  const weights = [...new Set(keys.map((k) => parseInt(k, 10)).filter((n) => Number.isFinite(n)))].sort(
    (a, b) => a - b,
  )
  return {
    family: e.family,
    category: String(e.category ?? '').toLowerCase().replace(/\s+/g, '-'),
    weights,
    italics: keys.some((k) => k.endsWith('i')),
    scripts: (e.subsets ?? []).filter((s) => s !== 'menu'),
  }
})

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : null
const date = new Date().toISOString().slice(0, 10)
const merged = mergeCatalogue(previous, fetched, date)
merged.source = SOURCE
// One family per line: diff-friendly, and about half the size of 2-space indent (NFR-09).
const body = merged.families.map((f) => '    ' + JSON.stringify(f)).join(',\n')
writeFileSync(
  OUT,
  `{\n  "snapshotDate": ${JSON.stringify(merged.snapshotDate)},\n  "source": ${JSON.stringify(merged.source)},\n  "families": [\n${body}\n  ]\n}\n`,
)

const delisted = merged.families.filter((f) => f.delisted).length
console.log(`[fonts] wrote ${merged.families.length} families (${delisted} delisted), snapshot ${date}`)
