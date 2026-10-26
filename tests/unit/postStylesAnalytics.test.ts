// 027 FR-14, NFR-05: the catalogue fields for post styles and the pure shaping
// of the insights section.
import { describe, it, expect } from 'vitest'
import { CATALOGUE } from '@/lib/analytics/catalogue'
import { shapePostStyles } from '@/lib/analytics/queries'
import { POST_STYLE_KEYS } from '@/lib/postStyles'

describe('post style fields in the catalogue (027 FR-14)', () => {
  it('adds the fields without bumping any schemaVersion', () => {
    expect(CATALOGUE['brief.submitted'].schemaVersion).toBe(1)
    expect(CATALOGUE['generation.finished'].schemaVersion).toBe(1)
    expect(CATALOGUE['scheduled_generation.settled'].schemaVersion).toBe(1)
  })

  it('accepts every dataset key on all three events', () => {
    for (const postStyle of POST_STYLE_KEYS) {
      expect(CATALOGUE['brief.submitted'].schema.safeParse({ postStyle }).success).toBe(true)
      expect(CATALOGUE['generation.finished'].schema.safeParse({ postStyle }).success).toBe(true)
      expect(CATALOGUE['scheduled_generation.settled'].schema.safeParse({ postStyle }).success).toBe(true)
    }
  })

  it('rejects an unknown style key and an unknown factsStatus', () => {
    expect(CATALOGUE['generation.finished'].schema.safeParse({ postStyle: 'ghost' }).success).toBe(false)
    expect(CATALOGUE['generation.finished'].schema.safeParse({ factsStatus: 'maybe' }).success).toBe(false)
  })

  it('takes a status and a count, null style, and held', () => {
    const g = CATALOGUE['generation.finished'].schema.parse({ postStyle: null, factsStatus: 'flagged', factsFlagCount: 2 })
    expect(g).toMatchObject({ postStyle: null, factsStatus: 'flagged', factsFlagCount: 2 })
    expect(CATALOGUE['generation.finished'].schema.safeParse({ factsFlagCount: 21 }).success).toBe(false)
    expect(CATALOGUE['scheduled_generation.settled'].schema.parse({ held: true })).toMatchObject({ held: true })
  })

  it('strips a flagged value or text a caller passes (NFR-05)', () => {
    const out = CATALOGUE['generation.finished'].schema.parse({
      factsStatus: 'flagged',
      flagged: [{ value: '$49' }],
      caption: 'text',
    }) as Record<string, unknown>
    expect(out.flagged).toBeUndefined()
    expect(out.caption).toBeUndefined()
  })
})

describe('shapePostStyles', () => {
  it('returns one row per dataset style with zeros for unchosen ones', () => {
    const rows = shapePostStyles([])
    expect(rows.map((r) => r.style)).toEqual([...POST_STYLE_KEYS])
    for (const r of rows) expect(r).toMatchObject({ chosen: 0, generations: 0, flagged: 0, held: 0, flagRate: null })
  })

  it('computes the flag rate as flagged over generations', () => {
    const rows = shapePostStyles([
      { style: 'launch', chosen: 5, generations: 4, flagged: 1, held: 2 },
      { style: 'tip', chosen: 1, generations: 0, flagged: 0, held: 0 },
    ])
    const launch = rows.find((r) => r.style === 'launch')!
    expect(launch).toMatchObject({ chosen: 5, generations: 4, flagged: 1, held: 2, flagRate: 0.25 })
    expect(rows.find((r) => r.style === 'tip')!.flagRate).toBeNull()
    expect(rows.find((r) => r.style === 'launch')!.label).toBeTruthy()
  })

  it('ignores a row whose style is not in the dataset', () => {
    const rows = shapePostStyles([{ style: 'ghost', chosen: 9, generations: 9, flagged: 9, held: 9 }])
    expect(rows).toHaveLength(POST_STYLE_KEYS.length)
    expect(rows.reduce((a, r) => a + r.chosen, 0)).toBe(0)
  })
})
