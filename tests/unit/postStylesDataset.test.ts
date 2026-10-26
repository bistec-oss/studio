// 027 FR-02 / FR-03 / AC-02: the post-style dataset and its guards.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import {
  styles,
  revisionOf,
  defaultImageStyleProblems,
  activeStyles,
  getStyle,
  isStyleKey,
  POST_STYLES_REVISION,
} from '@/lib/postStyles/styles'
import {
  POST_STYLE_KEYS,
  TONE_KEYS,
  type PostStyle,
  type StyleVersion,
} from '@/lib/postStyles/types'
import * as publicApi from '@/lib/postStyles'
import { archetypes } from '@/lib/designData'

// Committed: one SHA-256 per released (key, version). Editing a released version
// in place fails the guard; a new version needs its hash added in the same commit.
const COMMITTED_HASHES: Record<string, string> = {
  'general@1': 'd2aaf6aa64d2e6f940d3530623f12d964b4fc24b2d39e34e77085db3bd944793',
  'launch@1': '4464b2613f3c2ba3d46b0ae0abd706ba70d009f7554daec17356dbeb80fb740e',
  'promotion@1': '801dfcc554e9055d6bbbde9975e672a3705e2159336165e6a0b122e0113b74e2',
  'event@1': 'a6f9d9e8e641b5d881de09ce81c3e2b7cfe2090fa29c8ac6853cb8b554ff4ea7',
  'hiring@1': '584c3a45f1c522366d248cfa82969ad31d579e8d233fbbb5ae09dba2b6c212fd',
  'announcement@1': 'ab3db8fcc1162608534fb65ecb9f876259618246c3deb9e51883157dc9e6a621',
  'tip@1': '7d693c53be37711b1eab32b3105dd6cd1b28807be311afcf7a9c6bcc5800f3b2',
  'milestone@1': '4d0285194b42a29fd8589648efaf60e922f8200f92ff70f958dc238e575e8202',
  // 028 T7: only the looks that passed OP-028 (full-bleed-scene) moved a default.
  'event@2': 'b6f870ec5f5717d233d93086a66b3b4bdd674d9b04d3ffcd0ac0b80311e437b1',
  'hiring@2': '7bdc7bc6a7fb936043ba439a1a2233d9b65cc6055169e534a9dcfabfdef76f0a',
  // 031 T18: OP-031 passed spotlight@2:SQUARE, so Promotion and Milestone move to spotlight.
  'promotion@2': '40afe8068c6a23db55bdc9ca3c0a5022690ae96d3cb4ba2006fd1015413fcb5f',
  'milestone@2': 'c8dfcdd063be4628d1b3657386536b372f6f1b2c162ed30d3d7b32c8b69148a6',
}

// 028 T7 and 031 T18: the styles whose current version is 2, and the look each now defaults to.
const MOVED: Record<string, string> = {
  event: 'full-bleed-scene',
  hiring: 'full-bleed-scene',
  promotion: 'spotlight',
  milestone: 'spotlight',
}

// The committed key list: keys are permanent, so a deletion fails the subset test.
const COMMITTED_KEYS = [
  'general',
  'launch',
  'promotion',
  'event',
  'hiring',
  'announcement',
  'tip',
  'milestone',
]

const hashOf = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

// A pure guard over any dataset: the table must cover every (key, version)
// exactly and every hash must match.
function hashProblems(dataset: Readonly<Record<string, PostStyle>>, table: Record<string, string>) {
  const problems: string[] = []
  const seen = new Set<string>()
  for (const s of Object.values(dataset)) {
    for (const [n, v] of Object.entries(s.versions)) {
      const id = `${s.key}@${n}`
      seen.add(id)
      if (!(id in table))
        problems.push(`${id}: no committed hash (add it in the same commit as the new version)`)
      else if (table[id] !== hashOf(v))
        problems.push(`${id}: edited in place - add versions[n+1], never edit a released version`)
    }
  }
  for (const id of Object.keys(table))
    if (!seen.has(id)) problems.push(`${id}: committed but missing`)
  return problems
}

type Mutable = Omit<PostStyle, 'versions'> & { versions: Record<number, StyleVersion> }
const clone = () => JSON.parse(JSON.stringify(styles)) as Record<string, Mutable>

const all = Object.values(styles)

describe('AC-02: the dataset', () => {
  it('has the eight styles of FR-03 in table order', () => {
    expect([...POST_STYLE_KEYS]).toEqual(COMMITTED_KEYS)
    expect(Object.keys(styles)).toEqual(COMMITTED_KEYS)
    for (const k of POST_STYLE_KEYS) expect(styles[k].key).toBe(k)
  })

  it('every style is active with a label, a summary and its current version (2 for the moved styles)', () => {
    for (const s of all) {
      expect(s.label.length, s.key).toBeGreaterThan(0)
      expect(s.summary.length, s.key).toBeGreaterThan(0)
      expect(s.status, s.key).toBe('active')
      expect(s.current, s.key).toBe(s.key in MOVED ? 2 : 1)
      expect(s.versions[s.current], s.key).toBeDefined()
    }
  })

  it('goal and default tone match the FR-03 table', () => {
    const table: Record<string, [string, string, string]> = {
      general: ['awareness', 'professional', 'classic'],
      launch: ['conversion', 'bold', 'product-showcase'],
      promotion: ['conversion', 'bold', 'classic'],
      event: ['engagement', 'professional', 'classic'],
      hiring: ['hiring', 'professional', 'classic'],
      announcement: ['announcement', 'professional', 'editorial-split'],
      tip: ['engagement', 'casual', 'classic'],
      milestone: ['awareness', 'bold', 'classic'],
    }
    for (const s of all) {
      const v = s.versions[1]
      expect([v.goal, v.defaultTone, v.defaultImageStyle], s.key).toEqual(table[s.key])
      if (s.key in MOVED) {
        const v2 = s.versions[2]
        expect([v2.goal, v2.defaultTone, v2.defaultImageStyle], s.key).toEqual([
          table[s.key][0],
          table[s.key][1],
          MOVED[s.key],
        ])
      }
      expect(TONE_KEYS).toContain(v.defaultTone)
    }
  })

  it('every default image style is classic or an active designData archetype', () => {
    expect(defaultImageStyleProblems(styles)).toEqual([])
    for (const s of all)
      for (const v of Object.values(s.versions)) {
        if (v.defaultImageStyle !== 'classic')
          expect(archetypes[v.defaultImageStyle]?.status, s.key).toBe('active')
      }
  })

  it('the default image style guard catches an unknown look and accepts a retired one (028)', () => {
    const bad = (k: string) =>
      ({
        x: {
          ...styles.general,
          versions: { 1: { ...styles.general.versions[1], defaultImageStyle: k } },
        },
      }) as unknown as Record<string, PostStyle>
    expect(defaultImageStyleProblems(bad('nope'))).toHaveLength(1)
    expect(defaultImageStyleProblems(bad('classic'))).toEqual([])
    const retired = structuredClone(archetypes) as Record<string, (typeof archetypes)[string]>
    retired['editorial-split'].status = 'retired'
    expect(defaultImageStyleProblems(bad('editorial-split'), retired)).toEqual([])
    expect(defaultImageStyleProblems(bad('gone-look'), retired)).toHaveLength(1)
  })

  it('every rule has an id of the form <key>.<slug>, unique within a version, stable across versions, a scope and non-empty text', () => {
    const ids = new Set<string>()
    for (const s of all) {
      const first = new Map<string, { scope: string; text: string; check?: string }>()
      for (const v of Object.values(s.versions)) {
        const inVersion = new Set<string>()
        for (const r of v.checklist) {
          expect(r.id, r.id).toMatch(new RegExp(`^${s.key}\\.[a-z0-9-]+$`))
          expect(r.id).toMatch(/^[a-z0-9.-]+$/)
          expect(inVersion.has(r.id), `duplicate ${r.id} in one version`).toBe(false)
          inVersion.add(r.id)
          ids.add(r.id)
          // an id seen in two versions of one style keeps its scope, text and check
          const seen = first.get(r.id)
          if (seen) expect(seen, r.id).toEqual({ scope: r.scope, text: r.text, check: r.check })
          else first.set(r.id, { scope: r.scope, text: r.text, check: r.check })
          expect(['caption', 'image']).toContain(r.scope)
          expect(r.text.trim().length, r.id).toBeGreaterThan(0)
          if (r.check !== undefined) expect(r.check).toBe('facts-check')
        }
      }
    }
    expect(ids.size).toBe(3 + 4 + 3 + 3 + 4 + 3 + 3 + 3)
  })

  it('every style has at least one caption rule and one image rule', () => {
    for (const s of all)
      for (const v of Object.values(s.versions)) {
        expect(
          v.checklist.some((r) => r.scope === 'caption'),
          s.key,
        ).toBe(true)
        expect(
          v.checklist.some((r) => r.scope === 'image'),
          s.key,
        ).toBe(true)
      }
  })

  it('the rules use no adjective-only wording: each value rule says "only if the brief states"', () => {
    for (const s of all)
      for (const r of s.versions[1].checklist.filter((x) => x.check === 'facts-check'))
        expect(r.text, r.id).toMatch(/brief (does not )?state/i)
  })
})

describe('FR-02: the key rule', () => {
  it('keys match ^[a-z]+(-[a-z]+)*$ and none repeats', () => {
    const keys = all.map((s) => s.key)
    for (const k of keys) expect(k).toMatch(/^[a-z]+(-[a-z]+)*$/)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('the committed key list is a subset of the dataset keys (a deletion fails)', () => {
    for (const k of COMMITTED_KEYS) expect(Object.keys(styles), k).toContain(k)
  })
})

describe('FR-02: immutability and the hash guard', () => {
  it('the committed hash table matches every released (key, version)', () => {
    expect(hashProblems(styles, COMMITTED_HASHES)).toEqual([])
  })

  it('editing a released version in a doctored copy fails the guard', () => {
    const copy = clone()
    ;(copy.general.versions[1] as { goal: string }).goal = 'conversion'
    const problems = hashProblems(copy, COMMITTED_HASHES)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/general@1.*never edit a released version/)
  })

  it('a new version without its hash, and a deleted version, both fail the guard', () => {
    const copy = clone()
    copy.tip.versions[2] = copy.tip.versions[1]
    copy.tip.current = 2
    expect(hashProblems(copy, COMMITTED_HASHES).join('\n')).toMatch(/tip@2: no committed hash/)
    delete copy.tip.versions[2]
    delete copy.event.versions[2]
    expect(hashProblems(copy, COMMITTED_HASHES).join('\n')).toMatch(
      /event@2: committed but missing/,
    )
  })

  it('the dataset is deeply frozen', () => {
    expect(Object.isFrozen(styles)).toBe(true)
    expect(Object.isFrozen(styles.general)).toBe(true)
    expect(Object.isFrozen(styles.general.versions)).toBe(true)
    expect(Object.isFrozen(styles.general.versions[1].checklist)).toBe(true)
    expect(Object.isFrozen(styles.general.versions[1].checklist[0])).toBe(true)
    expect(() => {
      ;(styles.general.versions[1] as { goal: string }).goal = 'x'
    }).toThrow()
  })

  it('POST_STYLES_REVISION equals the sum of current, and adding a version raises it', () => {
    expect(POST_STYLES_REVISION).toBe(all.reduce((n, s) => n + s.current, 0))
    expect(POST_STYLES_REVISION).toBe(12)
    const copy = clone()
    copy.tip.versions[2] = copy.tip.versions[1]
    copy.tip.current = 2
    expect(revisionOf(copy)).toBe(POST_STYLES_REVISION + 1)
    copy.extra = { ...copy.tip, key: 'extra' as never, current: 1 }
    expect(revisionOf(copy)).toBe(POST_STYLES_REVISION + 2)
  })
})

describe('FR-02: lookups', () => {
  it('activeStyles lists the active styles in table order', () => {
    expect(activeStyles().map((s) => s.key)).toEqual(COMMITTED_KEYS)
  })

  it('getStyle and isStyleKey answer for dataset keys and nothing else', () => {
    for (const k of COMMITTED_KEYS) {
      expect(getStyle(k)?.key).toBe(k)
      expect(isStyleKey(k)).toBe(true)
    }
    for (const bad of [
      'nope',
      '',
      'General',
      'constructor',
      '__proto__',
      'toString',
      null,
      undefined,
      7,
    ]) {
      expect(getStyle(bad), String(bad)).toBeUndefined()
      expect(isStyleKey(bad), String(bad)).toBe(false)
    }
  })

  it('a retired style stays resolvable but is hidden from pickers (real lookups on a fixture dataset)', () => {
    // The real dataset has none, so the real activeStyles and getStyle run on a
    // fixture of the same shape (the resolver's retired-key case is in
    // postStylesResolve.test.ts).
    const dataset = { ...styles, tip: { ...styles.tip, status: 'retired' as const } }
    expect(activeStyles(dataset).map((s) => s.key)).not.toContain('tip')
    expect(activeStyles(dataset)).toHaveLength(7)
    expect(getStyle('tip', dataset)?.key).toBe('tip')
    expect(getStyle('tip', dataset)?.status).toBe('retired')
    // and a key that is not in the fixture still does not resolve
    expect(getStyle('constructor', dataset)).toBeUndefined()
  })

  it('the public index does not export the raw styles record', () => {
    expect('styles' in publicApi).toBe(false)
    expect(Object.keys(publicApi).sort()).toEqual(
      [
        'CHECKLIST_PREAMBLE',
        'POST_STYLES_REVISION',
        'POST_STYLE_KEYS',
        'TONE_KEYS',
        'activeStyles',
        'checklistPromptText',
        'derivedPromptVersion',
        'getStyle',
        'isStyleKey',
        'legacyGoalStyle',
        'matchToneOption',
        'parsePostStyleStamp',
        'postStyleStampSchema',
        'resolvePostStyle',
        'rulesAtStamp',
        'stampFor',
        'styleSummary',
      ].sort(),
    )
  })
})
