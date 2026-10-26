// Look-dataset validation (028 design.md section 4). Pure: type-only imports,
// no prisma, env, fs, minio or puppeteer. One named problem per violation.
import type { ArchetypeMap } from './composition'

export const VARIANT_SUFFIXES = ['light'] as const
export const LOOK_KEY_PATTERN = /^[a-z]+(-[a-z]+)*$/

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k)

export function lookDatasetProblems(source: ArchetypeMap): string[] {
  const problems: string[] = []
  const keys = Object.keys(source)

  for (const key of keys) {
    const a = source[key]
    if (!LOOK_KEY_PATTERN.test(key)) problems.push(`${key}: key does not match ${LOOK_KEY_PATTERN}`)
    if (a.key !== key) problems.push(`${key}: record key differs from archetype.key "${a.key}"`)
    if (!has(a.versions, String(a.current)))
      problems.push(`${key}: current ${a.current} names no version`)
    if (a.status !== 'active' && a.status !== 'retired')
      problems.push(`${key}: status "${a.status}" is not active or retired`)

    const versionNumbers = Object.keys(a.versions).map(Number)
    for (const v of versionNumbers) {
      const contract = a.versions[v]
      for (const [size, sc] of Object.entries(contract.sizes)) {
        if (!sc) continue
        const where = `${key}@${v}:${size}`
        if (!sc.regions.some((r) => r.purpose === 'text')) problems.push(`${where}: no text region`)
        const composites = sc.regions.filter((r) => r.purpose === 'composite')
        if (composites.length > 1) problems.push(`${where}: more than one composite region`)
        if (a.requires && composites.length !== 1)
          problems.push(
            `${where}: requires ${a.requires} but has ${composites.length} composite regions`,
          )
        if (!a.requires && composites.length > 0)
          problems.push(`${where}: has a composite region but no requires`)
        for (const c of composites) {
          for (const t of sc.regions.filter((r) => r.purpose === 'text')) {
            const overlaps =
              c.rect.x < t.rect.x + t.rect.w &&
              t.rect.x < c.rect.x + c.rect.w &&
              c.rect.y < t.rect.y + t.rect.h &&
              t.rect.y < c.rect.y + c.rect.h
            if (overlaps) problems.push(`${where}: composite region overlaps a text region`)
          }
        }
        for (const r of sc.regions) {
          const { x, y, w, h } = r.rect
          const inRange = x >= 0 && y >= 0 && x <= 100 && y <= 100 && x + w <= 100 && y + h <= 100
          if (!inRange || !(w > 0) || !(h > 0)) {
            problems.push(
              `${where}: region ${JSON.stringify(r.rect)} is outside 0..100 or has no size`,
            )
          } else if ((w * h) / 100 < r.minAreaPct) {
            problems.push(
              `${where}: region ${JSON.stringify(r.rect)} area is below its minimum ${r.minAreaPct}%`,
            )
          }
        }
      }

      const base = contract.variantOf
      if (base) {
        const where = `${key}@${v}`
        const baseArchetype = has(source, base.key) ? source[base.key] : null
        if (!baseArchetype) {
          problems.push(`${where}: variantOf base "${base.key}" does not exist`)
        } else {
          if (Object.values(baseArchetype.versions).some((c) => c.variantOf)) {
            problems.push(`${where}: variantOf base "${base.key}" is itself a variant`)
          }
          const baseContract = has(baseArchetype.versions, String(base.version))
            ? baseArchetype.versions[base.version]
            : null
          if (!baseContract) {
            problems.push(
              `${where}: variantOf base version ${base.key}@${base.version} does not exist`,
            )
          } else {
            for (const [size, sc] of Object.entries(contract.sizes)) {
              const baseSize = baseContract.sizes[size as keyof typeof baseContract.sizes]
              if (!sc) continue
              if (!baseSize)
                problems.push(`${where}:${size}: base ${base.key}@${base.version} has no ${size}`)
              else if (JSON.stringify(sc.regions) !== JSON.stringify(baseSize.regions)) {
                problems.push(
                  `${where}:${size}: regions differ from base ${base.key}@${base.version}`,
                )
              }
            }
          }
          const suffix = key.startsWith(`${base.key}-`) ? key.slice(base.key.length + 1) : null
          if (suffix === null || !(VARIANT_SUFFIXES as readonly string[]).includes(suffix)) {
            problems.push(
              `${where}: variant key must be "${base.key}-<suffix>" with suffix in ${VARIANT_SUFFIXES.join(', ')}`,
            )
          }
        }
        const names = new Set(versionNumbers.map((n) => a.versions[n].variantOf?.key))
        if (names.size > 1 || names.has(undefined)) {
          problems.push(`${key}: every version of a variant must name the same base key`)
        }
      }
    }
  }

  // The prefix rule: a key that extends another key plus a hyphen is a variant.
  for (const a of keys) {
    for (const b of keys) {
      if (a === b || !b.startsWith(`${a}-`)) continue
      const bad = Object.values(source[b].versions).some((c) => c.variantOf?.key !== a)
      if (bad)
        problems.push(`${b}: starts with "${a}-" so every version must carry variantOf.key "${a}"`)
    }
  }

  return [...new Set(problems)]
}
