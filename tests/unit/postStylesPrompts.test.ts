// 027 FR-09 / AC-08 (text half): the checklist prompt text, pinned exactly.
import { describe, it, expect, vi } from 'vitest'
import { checklistPromptText, CHECKLIST_PREAMBLE, POST_STYLES_REVISION } from '@/lib/postStyles'
import { briefPostStyleStamp, buildBriefInput, imageRulesAtStamp, imageRulesFor } from '@/lib/agent/briefInput'
import { buildCaptionPrompt } from '@/lib/agent/prompts/caption'
import { buildPathAUserMessage } from '@/lib/agent/prompts/pathA'
import { buildPathBUserMessage } from '@/lib/agent/prompts/pathB'
import { buildBackgroundDecisionPrompt } from '@/lib/agent/prompts/background'
import { buildRefineSystemPrompt } from '@/lib/agent/prompts/refine'
import { PRE_STYLE_CASES } from './fixtures/preStyleCases'
import goldenJson from './fixtures/preStyleGolden.json'
import { styles } from '@/lib/postStyles/styles'
import type { PostStyle } from '@/lib/postStyles/types'

const PREAMBLE_GENERAL =
  'Content rules for this post (post style: General). They outrank the brand voice and the campaign briefing where they conflict. "Stated in the brief" means the value appears in the topic, the description, the campaign briefing or the brand voice text. If a value is not stated, do not write it.'

describe('checklistPromptText', () => {
  it('the preamble constant has one label placeholder and the exact words', () => {
    expect(CHECKLIST_PREAMBLE.split('{label}')).toHaveLength(2)
    expect(CHECKLIST_PREAMBLE.replace('{label}', 'General')).toBe(PREAMBLE_GENERAL)
  })

  it('general, caption scope: exact text', () => {
    expect(checklistPromptText('general', 1, 'caption')).toBe(
      [
        PREAMBLE_GENERAL,
        '- Write a date, price, percentage or other number only if the brief states it. If it does not, leave it out.',
        '- Include exactly one call to action.',
      ].join('\n'),
    )
  })

  it('general, image scope: exact text', () => {
    expect(checklistPromptText('general', 1, 'image')).toBe(
      [
        PREAMBLE_GENERAL,
        '- Print a date, price, percentage or other number on the image only if the brief states it.',
      ].join('\n'),
    )
  })

  it('every style and scope renders the preamble with its own label then one bullet per rule, in order', () => {
    for (const s of Object.values(styles))
      for (const scope of ['caption', 'image'] as const) {
        const rules = s.versions[s.current].checklist.filter((r) => r.scope === scope)
        const text = checklistPromptText(s.key, s.current, scope)
        const lines = text.split('\n')
        expect(lines[0], s.key).toBe(CHECKLIST_PREAMBLE.replace('{label}', s.label))
        expect(lines.slice(1), s.key).toEqual(rules.map((r) => `- ${r.text}`))
      }
  })

  it('returns empty text for an unknown key, an unknown version and a scope with no rules', () => {
    expect(checklistPromptText('nope', 1, 'caption')).toBe('')
    expect(checklistPromptText('constructor', 1, 'caption')).toBe('')
    expect(checklistPromptText('general', 9, 'caption')).toBe('')
    const noImage: Record<string, PostStyle> = {
      ...styles,
      tip: {
        ...styles.tip,
        versions: {
          1: {
            ...styles.tip.versions[1],
            checklist: styles.tip.versions[1].checklist.filter((r) => r.scope === 'caption'),
          },
        },
      },
    }
    expect(checklistPromptText('tip', 1, 'image', noImage)).toBe('')
    expect(checklistPromptText('tip', 1, 'caption', noImage)).not.toBe('')
  })

  it('a retired style still renders (fixture dataset)', () => {
    const dataset: Record<string, PostStyle> = {
      ...styles,
      tip: { ...styles.tip, status: 'retired' },
    }
    expect(checklistPromptText('tip', 1, 'caption', dataset)).toContain('post style: Tip')
  })
})

// ── T4: delivery (027 FR-09, AC-08, AC-16 prompt half) ───────────────────────

const kitFixture = {
  id: 'kit-1',
  name: 'Golden',
  colors: ['#0A1F44'],
  fonts: [{ name: 'Poppins', url: 'https://fonts.example/poppins' }],
  logoUrl: null,
  logos: [],
  voicePrompt: 'Warm and direct.',
  source: 'explicit' as const,
}
const GOLDEN: Record<string, string> = goldenJson
const CAPTION = checklistPromptText('promotion', 1, 'caption')
const IMAGE = checklistPromptText('promotion', 1, 'image')
const briefRow = (over: Record<string, unknown> = {}) =>
  ({
    id: 'b1',
    topic: 'Spring sale',
    description: 'Two weeks',
    goal: 'conversion',
    tone: 'bold',
    channels: ['INSTAGRAM'],
    designMode: 'GENERATE',
    aspectRatio: 'SQUARE',
    postStyle: 'promotion',
    ...over,
  }) as never

describe('AC-16 (golden half): a brief with no style produces the prompts of before 027, byte for byte', () => {
  it('every builder, called with no rules, equals the text captured at the base commit', () => {
    expect(Object.keys(GOLDEN).sort()).toEqual(Object.keys(PRE_STYLE_CASES).sort())
    for (const [name, build] of Object.entries(PRE_STYLE_CASES)) {
      expect(build(), name).toBe(GOLDEN[name])
    }
  })

  it('a stored null, blank or absent post style adds no caption rules to the BriefInput', () => {
    for (const postStyle of [null, undefined, '', '   '])
      expect(buildBriefInput(briefRow({ postStyle }))).not.toHaveProperty('captionRules')
  })
})

describe('FR-09: the caption rules', () => {
  it('buildBriefInput sets captionRules to the caption-scope text of the brief’s key at the current version', () => {
    expect(buildBriefInput(briefRow()).captionRules).toBe(CAPTION)
    expect(CAPTION).not.toBe('')
  })

  it('the caption user prompt carries them after the Tone line and before "Write the following", and no image rule', () => {
    const { user } = buildCaptionPrompt(buildBriefInput(briefRow()), ['HEADLINE', 'INSTAGRAM', 'LINKEDIN'])
    const tone = user.indexOf('Tone: bold')
    const rules = user.indexOf(CAPTION)
    const task = user.indexOf('Write the following')
    expect(tone).toBeGreaterThan(-1)
    expect(rules).toBeGreaterThan(tone)
    expect(task).toBeGreaterThan(rules)
    expect(user.slice(tone, task)).toBe(`Tone: bold\n\n${CAPTION}\n\n`)
    for (const line of IMAGE.split('\n').slice(1)) expect(user).not.toContain(line)
  })

  it('the system prompt is unchanged by the rules', () => {
    const base = buildBriefInput(briefRow({ postStyle: null }))
    const styled = buildBriefInput(briefRow())
    expect(buildCaptionPrompt(styled, ['LINKEDIN']).system).toBe(buildCaptionPrompt(base, ['LINKEDIN']).system)
  })
})

describe('FR-09: the image rules', () => {
  it('imageRulesFor is the image-scope text, for Path B and for Path A', () => {
    expect(imageRulesFor(briefRow())).toBe(IMAGE)
    expect(imageRulesFor(briefRow({ designMode: 'TEMPLATE' }))).toBe(IMAGE)
    expect(imageRulesFor(briefRow({ postStyle: null }))).toBeUndefined()
  })

  it('Path A: after the brief fields, before the final instruction, and no caption rule', () => {
    const msg = buildPathAUserMessage({
      slimTemplate: '<div/>', headline: 'Hi', topic: 'Spring sale', description: 'Two weeks',
      mode: 'api', width: 1080, height: 1080, imageRules: IMAGE,
    })
    expect(msg).toContain(`Description: Two weeks\n\n${IMAGE}\n\nReplace all placeholder text.`)
    for (const line of CAPTION.split('\n').slice(1)) expect(msg).not.toContain(line)
  })

  it('Path B: after the headline block and the image section', () => {
    const msg = buildPathBUserMessage({
      topic: 't', description: null, goal: 'g', tone: 'bold', channels: ['INSTAGRAM'], headline: 'Hi',
      mode: 'api', width: 1080, height: 1080, briefImages: [{ url: 'https://x/y.png', intent: 'embed' }], imageRules: IMAGE,
    })
    const images = msg.indexOf('Provided images')
    expect(msg.indexOf(IMAGE)).toBeGreaterThan(images)
    expect(msg.indexOf('Design a complete')).toBeGreaterThan(msg.indexOf(IMAGE))
  })

  it('the background decision: after the Tone line, before the headline block', () => {
    const { user } = buildBackgroundDecisionPrompt({
      kit: kitFixture, topic: 't', description: 'd', goal: 'g', tone: 'bold', headline: 'Hi', imageRules: IMAGE,
    })
    expect(user).toContain(`Tone: bold\n\n${IMAGE}\n\n`)
    expect(user.indexOf(IMAGE)).toBeLessThan(user.indexOf('On-image headline'))
  })

  it('refine: the system prompt carries the rules in both modes, and the 009 contract keeps its place before them', () => {
    for (const mode of ['cli', 'api'] as const) {
      const plain = buildRefineSystemPrompt({ kit: kitFixture, mode, width: 1080, height: 1080, hasInlineAssets: false })
      const withRules = buildRefineSystemPrompt({ kit: kitFixture, mode, width: 1080, height: 1080, hasInlineAssets: false, imageRules: IMAGE })
      expect(withRules).toContain(IMAGE)
      expect(withRules.replace(`\n\n${IMAGE}`, '')).toBe(plain)
    }
  })
})

describe('FR-09: refine reads the draft’s STAMPED version (imageRulesAtStamp)', () => {
  it('a stamp that resolves yields the image-scope rules of that (key, version)', () => {
    expect(imageRulesAtStamp({ key: 'promotion', version: 1, revision: 8 }, 'd1')).toBe(IMAGE)
  })

  it('no stamp, or an unreadable one, passes nothing and says nothing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(imageRulesAtStamp(null, 'd1')).toBeUndefined()
    expect(imageRulesAtStamp('garbage', 'd1')).toBeUndefined()
    expect(imageRulesAtStamp({ key: 'promotion' }, 'd1')).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('a stamp whose key or version no longer resolves passes nothing and warns once, never throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(imageRulesAtStamp({ key: 'gone', version: 1, revision: 8 }, 'd1')).toBeUndefined()
    expect(imageRulesAtStamp({ key: 'promotion', version: 9, revision: 8 }, 'd2')).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(2)
    expect(String(warn.mock.calls[0][0])).toContain('d1')
    warn.mockRestore()
  })
})

describe('NFR-04: a stored key that does not resolve fails closed', () => {
  it('buildBriefInput, imageRulesFor and briefPostStyleStamp throw the named error', () => {
    const bad = briefRow({ postStyle: 'nope' })
    expect(() => buildBriefInput(bad)).toThrow('Post style "nope" is not available')
    expect(() => imageRulesFor(bad)).toThrow('Post style "nope" is not available')
    expect(() => briefPostStyleStamp(bad)).toThrow('Post style "nope" is not available')
  })

  it('briefPostStyleStamp is the key at the current version with the dataset revision', () => {
    expect(briefPostStyleStamp(briefRow())).toEqual({ key: 'promotion', version: 2, revision: POST_STYLES_REVISION })
    expect(briefPostStyleStamp(briefRow({ postStyle: null }))).toBeNull()
  })
})
