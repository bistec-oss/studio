// 027 FR-04 / AC-03: the resolver, per surface.
import { describe, it, expect } from 'vitest'
import {
  resolvePostStyle,
  legacyGoalStyle,
  matchToneOption,
  POST_STYLES_REVISION,
  type ResolveInput,
  type Surface,
} from '@/lib/postStyles'
import { styles } from '@/lib/postStyles/styles'
import type { PostStyle } from '@/lib/postStyles/types'
import { archetypes, type ArchetypeMap } from '@/lib/designData'
import { TONE_OPTIONS } from '@/components/brief/constants'

const SURFACES: Surface[] = ['wizard', 'briefs-api', 'queue', 'mcp', 'acp', 'regenerate']
const ATTENDED: Surface[] = ['wizard', 'briefs-api', 'regenerate']
const UNATTENDED: Surface[] = ['queue', 'mcp', 'acp']

const base = (over: Partial<ResolveInput> = {}): ResolveInput => ({
  style: null,
  path: 'B',
  aspectRatio: 'SQUARE',
  surface: 'wizard',
  ...over,
})

function ok(input: ResolveInput, source?: Record<string, PostStyle>) {
  const r = resolvePostStyle(input, source)
  if (!r.ok) throw new Error(r.message)
  return r
}

describe.each(SURFACES)('resolvePostStyle on surface %s', (surface) => {
  it('no input resolves to general, goal awareness, tone professional, classic', () => {
    const r = ok(base({ surface }))
    expect(r.key).toBe('general')
    expect(r.goal).toBe('awareness')
    expect(r.tone).toBe('professional')
    expect(r.imageStyle).toBe('classic')
    expect(r.stamp).toEqual({ key: 'general', version: 1, revision: POST_STYLES_REVISION })
    expect(r.checklist.length).toBeGreaterThan(0)
  })

  it('an explicit style sets goal and tone from the style', () => {
    const r = ok(base({ surface, style: 'hiring' }))
    expect(r.key).toBe('hiring')
    expect(r.goal).toBe(styles.hiring.versions[1].goal)
    expect(r.tone).toBe(styles.hiring.versions[1].defaultTone)
  })

  it('the campaign default style applies when no style is given, and an explicit one beats it', () => {
    expect(ok(base({ surface, campaign: { defaultPostStyle: 'event' } })).key).toBe('event')
    expect(ok(base({ surface, style: 'tip', campaign: { defaultPostStyle: 'event' } })).key).toBe(
      'tip',
    )
  })

  it('tone: explicit (trimmed) beats the campaign tone, which beats the style default', () => {
    const campaign = { defaultTone: 'We like a BOLD voice' }
    expect(ok(base({ surface, style: 'tip', campaign })).tone).toBe('bold')
    expect(
      ok(base({ surface, style: 'tip', campaign, explicit: { tone: '  warm and friendly  ' } }))
        .tone,
    ).toBe('warm and friendly')
    expect(ok(base({ surface, style: 'tip', explicit: { tone: '   ' } })).tone).toBe(
      styles.tip.versions[1].defaultTone,
    )
  })

  it('campaign free-text tone with no match is ignored, with a note', () => {
    const r = ok(base({ surface, style: 'tip', campaign: { defaultTone: 'quirky' } }))
    expect(r.tone).toBe(styles.tip.versions[1].defaultTone)
    expect(r.notes).toContain('campaign-tone-ignored')
  })

  it('an unknown style key is UNKNOWN_POST_STYLE, never general', () => {
    const r = resolvePostStyle(base({ surface, style: 'nope' }))
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_POST_STYLE' })
  })

  it('an unknown campaign default is UNKNOWN_POST_STYLE, never general', () => {
    const r = resolvePostStyle(base({ surface, campaign: { defaultPostStyle: 'gone' } }))
    expect(r).toMatchObject({ ok: false, code: 'UNKNOWN_POST_STYLE' })
  })

  it('prototype keys never resolve', () => {
    for (const k of ['constructor', '__proto__', 'toString'])
      expect(resolvePostStyle(base({ surface, style: k })).ok).toBe(false)
  })

  it('a pinned version that does not exist is UNKNOWN_POST_STYLE', () => {
    expect(resolvePostStyle(base({ surface, style: 'tip', version: 9 })).ok).toBe(false)
    expect(resolvePostStyle(base({ surface, style: 'tip', version: 1 })).ok).toBe(true)
  })

  it('legacy goal: hiring, Hiring and ANNOUNCEMENT map; awareness, engagement, conversion and free text fall through', () => {
    expect(ok(base({ surface, legacyGoal: 'hiring' })).key).toBe('hiring')
    expect(ok(base({ surface, legacyGoal: ' Hiring ' })).key).toBe('hiring')
    expect(ok(base({ surface, legacyGoal: 'ANNOUNCEMENT' })).key).toBe('announcement')
    for (const g of ['awareness', 'engagement', 'conversion', 'free text', '', 'constructor'])
      expect(ok(base({ surface, legacyGoal: g })).key, g).toBe('general')
    // fall-through goes to the campaign default first
    expect(
      ok(base({ surface, legacyGoal: 'engagement', campaign: { defaultPostStyle: 'event' } })).key,
    ).toBe('event')
    // a mapped goal beats the campaign default
    expect(
      ok(base({ surface, legacyGoal: 'hiring', campaign: { defaultPostStyle: 'event' } })).key,
    ).toBe('hiring')
  })

  it('an explicit style beats a conflicting legacyGoal; an unknown explicit key stays unknown', () => {
    expect(ok(base({ surface, style: 'tip', legacyGoal: 'hiring' })).key).toBe('tip')
    expect(resolvePostStyle(base({ surface, style: 'nope', legacyGoal: 'hiring' })).ok).toBe(false)
  })

  it('a blank or whitespace style is absent, not an unknown key', () => {
    expect(ok(base({ surface, style: '' })).key).toBe('general')
    expect(ok(base({ surface, style: '   ' })).key).toBe('general')
    expect(ok(base({ surface, style: '', legacyGoal: 'hiring' })).key).toBe('hiring')
  })
})

describe('resolvePostStyle: image style', () => {
  // Launch and Announcement default to a look; the fixture keeps the withLook path covered.
  const withLook = (look: string): Record<string, PostStyle> => ({
    ...styles,
    launch: {
      ...styles.launch,
      versions: { 1: { ...styles.launch.versions[1], defaultImageStyle: look as 'classic' } },
    },
  })

  it('every real style on every surface keeps classic when its default is classic', () => {
    for (const s of SURFACES)
      for (const k of Object.keys(styles))
        if (
          styles[k as keyof typeof styles].versions[styles[k as keyof typeof styles].current]
            .defaultImageStyle === 'classic'
        )
          expect(ok(base({ surface: s, style: k })).imageStyle).toBe('classic')
  })

  it('an explicit look on an attended surface at a supported size on Path B is kept', () => {
    for (const surface of ATTENDED) {
      const r = ok(base({ surface, explicit: { imageStyle: 'editorial-split' } }))
      expect(r.imageStyle).toBe('editorial-split')
      expect(r.notes).toEqual([])
    }
  })

  it('a style whose default is a look applies it on Path B at a supported size', () => {
    const r = ok(base({ style: 'launch' }), withLook('product-showcase'))
    expect(r.imageStyle).toBe('product-showcase')
  })

  it('unattended surfaces are classic, with a note, even for an explicit look or a look default', () => {
    for (const surface of UNATTENDED) {
      const r = ok(base({ surface, explicit: { imageStyle: 'editorial-split' } }))
      expect(r.imageStyle).toBe('classic')
      expect(r.notes).toContain('unattended-classic')
      const d = ok(base({ surface, style: 'launch' }), withLook('product-showcase'))
      expect(d.imageStyle).toBe('classic')
      expect(d.notes).toContain('unattended-classic')
    }
  })

  it('Path A is classic with a note', () => {
    const r = ok(base({ path: 'A', explicit: { imageStyle: 'editorial-split' } }))
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('path-a-classic')
  })

  it('STORY keeps a look the current contract declares at 9:16 (028)', () => {
    // The size-classic note is unreachable on the shipped dataset; T2 covers it
    // with a fixture look dataset.
    const r = ok(base({ aspectRatio: 'STORY', explicit: { imageStyle: 'editorial-split' } }))
    expect(r.imageStyle).toBe('editorial-split')
    expect(r.notes).not.toContain('size-classic')
  })

  it('a look that is not an active archetype is classic with default-unavailable', () => {
    const r = ok(base({ explicit: { imageStyle: 'no-such-look' } }))
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('default-unavailable')
  })
})

// 028 AC-04: every surface x look x size.
describe('resolvePostStyle: looks per surface and size (028 AC-04)', () => {
  const LOOKS = ['product-showcase', 'editorial-split', 'full-bleed-scene', 'spotlight']
  const SIZES = ['SQUARE', 'PORTRAIT', 'STORY'] as const
  const cases = SURFACES.flatMap((surface) =>
    LOOKS.flatMap((look) => SIZES.map((aspectRatio) => [surface, look, aspectRatio] as const)),
  )

  it.each(cases)('%s, explicit %s at %s', (surface, look, aspectRatio) => {
    const r = ok(base({ surface, aspectRatio, explicit: { imageStyle: look } }))
    if (UNATTENDED.includes(surface)) {
      expect(r.imageStyle).toBe('classic')
      expect(r.notes).toContain('unattended-classic')
    } else {
      expect(r.imageStyle).toBe(look)
      expect(r.notes).toEqual([])
    }
  })

  it.each(['wizard', 'briefs-api'] as Surface[])(
    '%s at STORY: Launch keeps product-showcase and Announcement keeps editorial-split, no note',
    (surface) => {
      const l = ok(base({ surface, aspectRatio: 'STORY', style: 'launch' }))
      expect(l.imageStyle).toBe('product-showcase')
      expect(l.notes).toEqual([])
      const a = ok(base({ surface, aspectRatio: 'STORY', style: 'announcement' }))
      expect(a.imageStyle).toBe('editorial-split')
      expect(a.notes).toEqual([])
    },
  )

  it.each(UNATTENDED)('%s: a style whose default is a look stays classic at every size', (surface) => {
    for (const aspectRatio of SIZES)
      for (const style of ['launch', 'announcement']) {
        const r = ok(base({ surface, aspectRatio, style }))
        expect(r.imageStyle).toBe('classic')
        expect(r.notes).toContain('unattended-classic')
      }
  })
})

// 028 FR-04 / FR-05: both notes are unreachable on the shipped dataset (every
// look is active and declares every size), so they run on fixture look datasets.
describe('resolvePostStyle: look fixtures (size-classic, retired-classic)', () => {
  const fixture = (edit: (m: Record<string, (typeof archetypes)[string]>) => void): ArchetypeMap => {
    const m = structuredClone(archetypes) as Record<string, (typeof archetypes)[string]>
    edit(m)
    return m
  }
  const run = (input: ResolveInput, looks: ArchetypeMap) => {
    const r = resolvePostStyle(input, undefined, looks)
    if (!r.ok) throw new Error(r.message)
    return r
  }
  // spotlight whose current version declares no 9:16
  const noStory = fixture((m) => {
    delete m.spotlight.versions[m.spotlight.current].sizes.STORY
  })
  const retired = fixture((m) => {
    m['editorial-split'].status = 'retired'
    m['product-showcase'].status = 'retired'
  })

  it('size-classic: a look that does not declare the size is classic with the note', () => {
    const r = run(base({ aspectRatio: 'STORY', explicit: { imageStyle: 'spotlight' } }), noStory)
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('size-classic')
  })

  it('size-classic: the same look keeps its style at a size it declares', () => {
    const r = run(base({ aspectRatio: 'SQUARE', explicit: { imageStyle: 'spotlight' } }), noStory)
    expect(r.imageStyle).toBe('spotlight')
    expect(r.notes).not.toContain('size-classic')
  })

  it('retired-classic: an explicit retired look is classic with the note', () => {
    const r = run(base({ explicit: { imageStyle: 'editorial-split' } }), retired)
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('retired-classic')
    expect(r.notes).not.toContain('default-unavailable')
  })

  it('retired-classic: a post-style default that names a retired look is classic with the note', () => {
    expect(styles.launch.versions[styles.launch.current].defaultImageStyle).toBe('product-showcase')
    const r = run(base({ style: 'launch' }), retired)
    expect(r.imageStyle).toBe('classic')
    expect(r.notes).toContain('retired-classic')
  })

  it('retired-classic comes after the unattended and Path A checks', () => {
    const q = run(base({ surface: 'queue', explicit: { imageStyle: 'editorial-split' } }), retired)
    expect(q.notes).toContain('unattended-classic')
    expect(q.notes).not.toContain('retired-classic')
    const a = run(base({ path: 'A', explicit: { imageStyle: 'editorial-split' } }), retired)
    expect(a.notes).toContain('path-a-classic')
    expect(a.notes).not.toContain('retired-classic')
  })

  it('an unknown key is still default-unavailable, not retired-classic', () => {
    const r = run(base({ explicit: { imageStyle: 'no-such-look' } }), retired)
    expect(r.notes).toContain('default-unavailable')
    expect(r.notes).not.toContain('retired-classic')
  })

  it('an active look at a declared size is unchanged', () => {
    const r = run(base({ explicit: { imageStyle: 'spotlight' } }), retired)
    expect(r.imageStyle).toBe('spotlight')
    expect(r.notes).toEqual([])
  })
})

describe('resolvePostStyle: retired style (a fixture dataset)', () => {
  const dataset: Record<string, PostStyle> = {
    ...styles,
    tip: { ...styles.tip, status: 'retired' },
  }

  it('a retired key still resolves, through the resolver, with its goal, tone and stamp', () => {
    const r = ok(base({ style: 'tip' }), dataset)
    expect(r.key).toBe('tip')
    expect(r.goal).toBe(styles.tip.versions[1].goal)
    expect(r.stamp.key).toBe('tip')
    expect(r.checklist).toEqual(styles.tip.versions[1].checklist)
  })

  it('a retired key stored as the campaign default still resolves', () => {
    expect(ok(base({ campaign: { defaultPostStyle: 'tip' } }), dataset).key).toBe('tip')
  })

  it('a key absent from the fixture dataset is still unknown', () => {
    const { tip: _tip, ...without } = dataset
    expect(resolvePostStyle(base({ style: 'tip' }), without).ok).toBe(false)
  })
})

describe('resolvePostStyle: purity', () => {
  it('returns equal results for equal input and does not mutate it', () => {
    const input = base({ style: 'event', campaign: { defaultTone: 'casual' } })
    const copy = JSON.parse(JSON.stringify(input))
    expect(resolvePostStyle(input)).toEqual(resolvePostStyle(input))
    expect(input).toEqual(copy)
  })
})

describe('legacyGoalStyle and matchToneOption', () => {
  it('legacyGoalStyle', () => {
    expect(legacyGoalStyle('hiring')).toBe('hiring')
    expect(legacyGoalStyle(' Announcement')).toBe('announcement')
    expect(legacyGoalStyle('conversion')).toBeUndefined()
    expect(legacyGoalStyle(null)).toBeUndefined()
    expect(legacyGoalStyle(undefined)).toBeUndefined()
  })

  it('matchToneOption: first tone that is a substring of the lowercased text, else null', () => {
    expect(matchToneOption('A Professional, bold voice')).toBe('professional')
    expect(matchToneOption('CASUAL')).toBe('casual')
    expect(matchToneOption('empathetic and kind')).toBe('empathetic')
    expect(matchToneOption('quirky')).toBeNull()
    expect(matchToneOption('')).toBeNull()
    expect(matchToneOption(null)).toBeNull()
  })

  it("the wizard's TONE_OPTIONS keep their values and labels", () => {
    expect(TONE_OPTIONS).toEqual([
      { value: 'professional', label: 'Professional' },
      { value: 'casual', label: 'Casual' },
      { value: 'bold', label: 'Bold' },
      { value: 'empathetic', label: 'Empathetic' },
    ])
  })
})

describe('resolvePostStyle: missing-input-classic (025 FR-08)', () => {
  // A fixture style whose default look needs a screenshot (the real dataset has none).
  const needy = structuredClone(styles) as Record<string, PostStyle>
  needy.launch = {
    ...needy.launch,
    versions: {
      ...needy.launch.versions,
      [needy.launch.current]: {
        ...needy.launch.versions[needy.launch.current],
        defaultImageStyle: 'device-screen',
      },
    },
  }
  const pick = (over: Partial<ResolveInput>) => {
    const r = resolvePostStyle(base({ style: 'launch', ...over }), needy)
    if (!r.ok) throw new Error(r.message)
    return r
  }

  it('wizard and briefs-api: a default that needs a screenshot is classic with the note', () => {
    for (const surface of ['wizard', 'briefs-api'] as Surface[]) {
      const r = pick({ surface })
      expect(r.imageStyle).toBe('classic')
      expect(r.notes).toContain('missing-input-classic')
    }
  })

  it('an explicit device-screen is classic with the note; with the flag it is kept', () => {
    const explicit = { imageStyle: 'device-screen' }
    expect(ok(base({ explicit })).imageStyle).toBe('classic')
    expect(ok(base({ explicit })).notes).toContain('missing-input-classic')
    const kept = ok(base({ explicit, hasCompositeSource: true }))
    expect(kept.imageStyle).toBe('device-screen')
    expect(kept.notes).not.toContain('missing-input-classic')
  })

  it('unattended-classic still wins for queue, mcp and acp', () => {
    for (const surface of UNATTENDED) {
      const r = pick({ surface })
      expect(r.notes).toContain('unattended-classic')
      expect(r.notes).not.toContain('missing-input-classic')
    }
  })

  it('the released looks are not affected', () => {
    const r = ok(base({ explicit: { imageStyle: 'spotlight' } }))
    expect(r.imageStyle).toBe('spotlight')
    expect(r.notes).not.toContain('missing-input-classic')
  })
})
