// 027 FR-07: the wizard's pure style state: the pre-fill, the touched rule,
// what is sent, and how a resumed payload is read back.
import { describe, it, expect } from 'vitest'
import {
  campaignStyleKey,
  knownStyleKey,
  resolveWizardStyle,
  resumeWizardStyle,
  styleAfterInputChange,
  styleAfterSizeChange,
  screenshotWillLetterbox,
  styleRequestFields,
  type WizardStyleInput,
} from '@/lib/brief/wizardStyleState'
import { archetypes } from '@/lib/designData'

const base: WizardStyleInput = {
  postStyle: 'general',
  campaign: null,
  designMode: 'GENERATE',
  aspectRatio: 'SQUARE',
  tone: 'professional',
  toneTouched: false,
  imageStyle: 'classic',
  imageStyleTouched: false,
}

describe('resolveWizardStyle', () => {
  it('general gives professional and classic', () => {
    const v = resolveWizardStyle(base)
    expect(v).toMatchObject({ postStyle: 'general', tone: 'professional', imageStyle: 'classic' })
    expect(v.imageStyleFromStyle).toBe(false)
  })

  it('an untouched tone and image style follow the style', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'launch' })
    expect(v.tone).toBe('bold')
    expect(v.imageStyle).toBe('product-showcase')
    expect(v.imageStyleFromStyle).toBe(true)
    expect(v.toneFromStyle).toBe(true)
  })

  it('a touched tone is never overwritten by a style change', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'promotion', tone: 'casual', toneTouched: true })
    expect(v.tone).toBe('casual')
    expect(v.toneFromStyle).toBe(false)
  })

  it('a touched image style is never overwritten by a style change', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'launch', imageStyle: 'editorial-split', imageStyleTouched: true })
    expect(v.imageStyle).toBe('editorial-split')
    expect(v.imageStyleFromStyle).toBe(false)
    const classic = resolveWizardStyle({ ...base, postStyle: 'launch', imageStyle: 'classic', imageStyleTouched: true })
    expect(classic.imageStyle).toBe('classic')
  })

  it('Path A shows classic whatever the style says; 9:16 now keeps the style default (028)', () => {
    expect(resolveWizardStyle({ ...base, postStyle: 'launch', designMode: 'TEMPLATE' }).imageStyle).toBe('classic')
    expect(resolveWizardStyle({ ...base, postStyle: 'launch', aspectRatio: 'STORY' }).imageStyle).toBe('product-showcase')
  })

  it('the campaign tone beats the style tone while untouched', () => {
    const v = resolveWizardStyle({ ...base, postStyle: 'launch', campaign: { defaultTone: 'Casual and warm' } })
    expect(v.tone).toBe('casual')
  })

  it('an unknown key opens as general', () => {
    expect(resolveWizardStyle({ ...base, postStyle: 'ghost' }).postStyle).toBe('general')
  })

  it('returns the style goal', () => {
    expect(resolveWizardStyle({ ...base, postStyle: 'hiring' }).goal).toBeTruthy()
  })
})

describe('keys', () => {
  it('knownStyleKey falls to general for unknown, blank and non-string', () => {
    expect(knownStyleKey('launch')).toBe('launch')
    expect(knownStyleKey('ghost')).toBe('general')
    expect(knownStyleKey('')).toBe('general')
    expect(knownStyleKey(undefined)).toBe('general')
    expect(knownStyleKey('constructor')).toBe('general')
  })
  it('campaignStyleKey reads the default, else general', () => {
    expect(campaignStyleKey({ defaultPostStyle: 'event' })).toBe('event')
    expect(campaignStyleKey({ defaultPostStyle: null })).toBe('general')
    expect(campaignStyleKey(null)).toBe('general')
  })
})

describe('styleRequestFields', () => {
  it('sends the style only when nothing is touched', () => {
    expect(styleRequestFields({ ...base, postStyle: 'launch' })).toStrictEqual({ postStyle: 'launch' })
  })
  it('sends tone and imageStyle when touched', () => {
    expect(
      styleRequestFields({
        ...base,
        postStyle: 'launch',
        tone: 'casual',
        toneTouched: true,
        imageStyle: 'editorial-split',
        imageStyleTouched: true,
      }),
    ).toStrictEqual({ postStyle: 'launch', tone: 'casual', imageStyle: 'editorial-split' })
  })
  it('a touched classic is sent (it overrides the style default)', () => {
    expect(
      styleRequestFields({ ...base, postStyle: 'launch', imageStyle: 'classic', imageStyleTouched: true }),
    ).toStrictEqual({ postStyle: 'launch', imageStyle: 'classic' })
  })
  it('a template brief never sends an image style', () => {
    expect(
      styleRequestFields({ ...base, designMode: 'TEMPLATE', imageStyle: 'editorial-split', imageStyleTouched: true }),
    ).toStrictEqual({ postStyle: 'general' })
  })
  it('an unknown key is sent as general', () => {
    expect(styleRequestFields({ ...base, postStyle: 'ghost' })).toStrictEqual({ postStyle: 'general' })
  })
})

describe('resumeWizardStyle', () => {
  const ctx = { campaign: null, designMode: 'GENERATE' as const, aspectRatio: 'SQUARE' as const }
  it('a stored tone equal to the style default stays untouched', () => {
    const r = resumeWizardStyle({ postStyle: 'launch', tone: 'bold', imageStyle: 'product-showcase' }, ctx)
    expect(r).toMatchObject({ postStyle: 'launch', toneTouched: false, imageStyleTouched: false })
  })
  it('a stored tone that differs is the users own', () => {
    expect(resumeWizardStyle({ postStyle: 'launch', tone: 'casual' }, ctx).toneTouched).toBe(true)
  })
  it('an absent stored image style under a style that sets one is a touched classic', () => {
    const r = resumeWizardStyle({ postStyle: 'launch', tone: 'bold' }, ctx)
    expect(r.imageStyleTouched).toBe(true)
    expect(r.imageStyle).toBe('classic')
  })
  it('an old row with no style resumes as general, untouched', () => {
    const r = resumeWizardStyle({ tone: 'professional' }, ctx)
    expect(r).toMatchObject({ postStyle: 'general', toneTouched: false, imageStyleTouched: false })
  })
  it('an unknown stored style opens as general', () => {
    expect(resumeWizardStyle({ postStyle: 'ghost', tone: 'professional' }, ctx).postStyle).toBe('general')
  })
})

describe('styleAfterSizeChange (028)', () => {
  it('keeps every shipped look at every size', () => {
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const)
      for (const k of ['classic', 'product-showcase', 'editorial-split', 'full-bleed-scene', 'spotlight'])
        expect(styleAfterSizeChange(k, size)).toEqual({ imageStyle: k, reset: false })
  })

  it('resets a look the new size does not declare (fixture dataset)', () => {
    const looks = structuredClone(archetypes) as Record<string, (typeof archetypes)[string]>
    delete looks.spotlight.versions[looks.spotlight.current].sizes.STORY
    expect(styleAfterSizeChange('spotlight', 'STORY', looks)).toEqual({ imageStyle: 'classic', reset: true })
    expect(styleAfterSizeChange('spotlight', 'SQUARE', looks)).toEqual({ imageStyle: 'spotlight', reset: false })
    expect(styleAfterSizeChange('classic', 'STORY', looks).reset).toBe(false)
  })
})

describe('device-screen in the wizard (025 FR-08)', () => {
  it('a touched device-screen resolves to classic until a screenshot can be supplied', () => {
    const v = resolveWizardStyle({ ...base, imageStyle: 'device-screen', imageStyleTouched: true })
    expect(v.imageStyle).toBe('classic')
  })

  it('a size change and a resume both drop device-screen', () => {
    expect(styleAfterSizeChange('device-screen', 'SQUARE')).toEqual({ imageStyle: 'classic', reset: true })
  })
})

describe('device-screen with a product screenshot (025 FR-17)', () => {
  it('styleAfterInputChange keeps device-screen only while a screenshot is held', () => {
    const held = { hasCompositeSource: true }
    for (const size of ['SQUARE', 'PORTRAIT', 'STORY'] as const) {
      expect(styleAfterInputChange('device-screen', size, undefined, held)).toEqual({
        imageStyle: 'device-screen',
        reset: false,
      })
      // Removing the screenshot while the look is picked resets the pick.
      expect(styleAfterInputChange('device-screen', size, undefined, { hasCompositeSource: false })).toEqual({
        imageStyle: 'classic',
        reset: true,
      })
    }
    // Another look is unaffected by the screenshot either way.
    expect(styleAfterInputChange('spotlight', 'SQUARE', undefined, held).reset).toBe(false)
    expect(styleAfterInputChange('spotlight', 'SQUARE').reset).toBe(false)
  })

  it('the size-change wrapper still assumes no screenshot', () => {
    expect(styleAfterSizeChange('device-screen', 'STORY').reset).toBe(true)
  })

  it('a touched device-screen is kept by the resolver only when the flag is set', () => {
    const touched = { ...base, imageStyle: 'device-screen', imageStyleTouched: true }
    expect(resolveWizardStyle(touched).imageStyle).toBe('classic')
    expect(resolveWizardStyle({ ...touched, hasCompositeSource: true }).imageStyle).toBe('device-screen')
  })

  it('the request carries a touched device-screen as the look key', () => {
    const r = styleRequestFields({ ...base, imageStyle: 'device-screen', imageStyleTouched: true, hasCompositeSource: true })
    expect(r.imageStyle).toBe('device-screen')
  })

  it('advises letterboxing when the aspect differs from the screen by more than 10%', () => {
    // SQUARE screen: 72% x 45% of 1080 = 777.6 x 486 px = 1.6.
    expect(screenshotWillLetterbox('SQUARE', { width: 1000, height: 1000 })).toBe(true)
    expect(screenshotWillLetterbox('SQUARE', { width: 1600, height: 1000 })).toBe(false)
    // Inside 10% either way: no advisory; just outside: advisory.
    expect(screenshotWillLetterbox('SQUARE', { width: 1740, height: 1000 })).toBe(false)
    expect(screenshotWillLetterbox('SQUARE', { width: 1780, height: 1000 })).toBe(true)
    expect(screenshotWillLetterbox('SQUARE', { width: 1450, height: 1000 })).toBe(false)
    expect(screenshotWillLetterbox('SQUARE', { width: 1420, height: 1000 })).toBe(true)
    // A degenerate size is never advised.
    expect(screenshotWillLetterbox('SQUARE', { width: 0, height: 0 })).toBe(false)
  })

  it('uses the screen of the picked size (STORY is wider than the square screen)', () => {
    // STORY screen: 84% x 29.5% of 1080x1920 = 907.2 x 566.4 = 1.6017.
    expect(screenshotWillLetterbox('STORY', { width: 1600, height: 1000 })).toBe(false)
    expect(screenshotWillLetterbox('STORY', { width: 1000, height: 1000 })).toBe(true)
  })
})
