// The authoring dataset (007 FR-01): vague design phrases, and the measurable
// rule each one asks for. In-house text, written for this tool. Every `source`
// names a public convention; nothing here is copied from an installed skill.
//
// Deliberately absent: composition (which side an image sits on, region shares,
// archetype keys), which 009 owns.
// Pure and client-safe.

export type Category = 'size' | 'spacing' | 'proportion' | 'colour-share' | 'typography'

export interface SlotRange {
  min: number
  max: number
  unit: string
}

export interface AuthoringEntry {
  key: string
  category: Category
  label: string
  /** Regex sources, compiled with the `giu` flags by the detector. Whole phrases. */
  triggers: readonly string[]
  /** replace: the rule swaps the phrase; insert: it is added as a following sentence. */
  form: 'replace' | 'insert'
  /** The measurable text, with `{slot}` placeholders. Roles, never literal fonts or colours. */
  template: string
  defaults: Record<string, number>
  ranges: Record<string, SlotRange>
  rationale: string
  /** Used only by the MOCK_AI test seam. */
  mockReplacement: string
  source: string
}

const W = String.raw`[\p{L}-]+`
// An ambiguous single word matches only with a design noun within three words.
const near = (words: string, nouns: string) =>
  String.raw`\b(?:${words})\b(?:\s+${W}){0,2}?\s+(?:${nouns})\b`

// The same pairing in the other order: "make the headline big".
const nearAfter = (nouns: string, words: string) =>
  String.raw`\b(?:${nouns})\b(?:\s+${W}){0,2}?\s+(?:${words})\b`

export const entries: readonly AuthoringEntry[] = [
  {
    key: 'logo-clear-space',
    category: 'spacing',
    label: 'Clear space',
    triggers: [
      near('generous|ample|plenty of|enough', 'space|spacing|margins?|padding|gaps?|room'),
      String.raw`\bbreathing room\b`,
    ],
    form: 'replace',
    template: 'clear space of {min} to {max} wordmark letters on every side',
    defaults: { min: 1, max: 2 },
    ranges: { min: { min: 1, max: 2, unit: 'letters' }, max: { min: 1, max: 2, unit: 'letters' } },
    rationale:
      'Clear space measured in wordmark letters stays in proportion when the logo is resized.',
    mockReplacement: 'clear space of 1 to 2 wordmark letters on every side',
    source: 'Brand-guideline convention: logo clear space as a multiple of a letter height.',
  },
  {
    key: 'mark-size-match',
    category: 'size',
    label: 'Matching logo size',
    triggers: [
      String.raw`\b(?:similar|same|equal)\s+(?:visual\s+)?(?:heights?|sizes?)\b`,
      String.raw`\bmatch(?:es|ing)?\s+(?:in\s+|the\s+)?(?:visual\s+)?(?:heights?|sizes?)\b`,
    ],
    form: 'insert',
    template: 'Set the wordmark capitals of each logo to the same height, within {tol}%.',
    defaults: { tol: 5 },
    ranges: { tol: { min: 1, max: 5, unit: '%' } },
    rationale:
      'Logos with different shapes look matched when their lettering has the same cap height, not the same box.',
    mockReplacement: 'Set the wordmark capitals of each logo to the same height, within 5%.',
    source: 'Optical-size matching convention: align logos by cap height.',
  },
  {
    key: 'element-scale',
    category: 'size',
    label: 'Element size',
    triggers: [near('large|big|small|tiny', 'logos?|icons?|badges?')],
    form: 'insert',
    template: 'Set each logo to {min} to {max}% of the canvas width.',
    defaults: { min: 12, max: 20 },
    ranges: { min: { min: 12, max: 20, unit: '%' }, max: { min: 12, max: 20, unit: '%' } },
    rationale:
      'A width as a share of the canvas keeps a logo the same relative size at every post size.',
    mockReplacement: 'Set each logo to 12 to 20% of the canvas width.',
    source: 'Brand-guideline convention: logo width as a percentage of the layout width.',
  },
  {
    key: 'margin-even',
    category: 'spacing',
    label: 'Even margins',
    triggers: [String.raw`\b(?:consistent|even|uniform)\s+(?:margins?|padding|spacing)\b`],
    form: 'replace',
    template: 'margins of {px} px on all sides, scaled with the canvas',
    defaults: { px: 48 },
    ranges: { px: { min: 32, max: 64, unit: 'px' } },
    rationale:
      'One pixel value on a 1080 px canvas is a rule a render can be held to; "consistent" is not.',
    mockReplacement: 'margins of 48 px on all sides, scaled with the canvas',
    source: 'Layout convention: a single outer margin on a 1080 px social canvas.',
  },
  {
    key: 'canvas-share',
    category: 'colour-share',
    label: 'Colour share',
    triggers: [
      String.raw`\b(?:primary|dominant|main)\s+(?:canvas|background|colou?r)\b`,
      String.raw`\bdominates?\b`,
    ],
    form: 'insert',
    template:
      'Brand colour 1 covers {main}% of the canvas, brand colour 2 no more than {second}%, and accents fill the rest.',
    defaults: { main: 60, second: 30 },
    ranges: { main: { min: 55, max: 70, unit: '%' }, second: { min: 25, max: 30, unit: '%' } },
    rationale:
      'Without a share, the model picks the proportion; a number keeps the canvas the colour you named.',
    mockReplacement:
      'Brand colour 1 covers 60% of the canvas, brand colour 2 no more than 30%, and accents fill the rest.',
    source: 'The 60-30-10 colour proportion convention.',
  },
  {
    key: 'whitespace-share',
    category: 'proportion',
    label: 'Free space',
    triggers: [
      near('balanced', 'layouts?|compositions?|canvas|designs?|whitespace|white space|spacing'),
      String.raw`\b(?:airy|uncluttered)\b`,
      String.raw`\bbreathing room (?:around|in|across) (?:the )?(?:layout|canvas|composition|design)\b`,
    ],
    form: 'insert',
    template: 'Keep at least {min}% of the canvas free of text and graphics.',
    defaults: { min: 25 },
    ranges: { min: { min: 20, max: 40, unit: '%' } },
    rationale: 'A free-space share is checkable; "airy" or "balanced" is a mood.',
    mockReplacement: 'Keep at least 25% of the canvas free of text and graphics.',
    source: 'Layout convention: minimum free area as a share of the canvas.',
  },
  {
    key: 'edge-blend',
    category: 'proportion',
    label: 'Edge blend',
    triggers: [near('soft|smooth|subtle', 'edges?|blends?|transitions?|fades?')],
    form: 'replace',
    template: 'blend that fades across {min} to {max}% of the canvas width',
    defaults: { min: 10, max: 15 },
    ranges: { min: { min: 10, max: 15, unit: '%' }, max: { min: 10, max: 15, unit: '%' } },
    rationale:
      'A fade width as a share of the canvas width turns "soft" into a gradient the render can be measured against.',
    mockReplacement: 'blend that fades across 10 to 15% of the canvas width',
    source: 'Image-masking convention: a gradient mask as a share of the layout width.',
  },
  {
    key: 'type-scale',
    category: 'typography',
    label: 'Headline scale',
    triggers: [
      near('big|bigger|large|larger|huge|oversized|small|tiny', 'headlines?|headings?|titles?'),
      nearAfter('headlines?|headings?|titles?', 'big|bigger|large|larger|huge|oversized|small|tiny'),
    ],
    form: 'insert',
    template: 'The headline is {ratio}× the body text size.',
    defaults: { ratio: 2.5 },
    ranges: { ratio: { min: 1.5, max: 4, unit: '×' } },
    rationale:
      'A headline-to-body ratio is a number a render can be held to; "big" leaves the size to the model.',
    mockReplacement: 'The headline is 2.5× the body text size.',
    source:
      'modular-scale practice (Tim Brown, "More Meaningful Typography", A List Apart, 2011): headline-to-body steps of about 1.5 to 4 at social-post sizes; recorded as a team convention',
  },
  {
    key: 'body-min-size',
    category: 'typography',
    label: 'Body text size',
    triggers: [
      near('readable|legible|small|tiny', 'text|body|copy|type|captions?|subtext'),
      nearAfter('text|body|copy|captions?|subtext', 'readable|legible'),
    ],
    form: 'insert',
    template: 'Body text is at least {px} px on the {width} px wide canvas.',
    defaults: { px: 28, width: 1080 },
    ranges: { px: { min: 24, max: 40, unit: 'px' }, width: { min: 1080, max: 1080, unit: 'px' } },
    rationale:
      'A minimum pixel size on a named canvas width keeps body text readable at phone feed size.',
    mockReplacement: 'Body text is at least 28 px on the 1080 px wide canvas.',
    source:
      'team convention (031): readable at phone feed size; every current canvas is 1080 px wide',
  },
  {
    key: 'heading-line-height',
    category: 'typography',
    label: 'Headline line height',
    triggers: [
      near(
        'tight|tighter|loose|looser|compact',
        'headlines?|headings?|titles?|leading|line[- ]height|line spacing',
      ),
      nearAfter('headlines?|headings?|titles?', 'tight|tighter|loose|looser|compact'),
    ],
    form: 'insert',
    template: 'Headline line height is {lh}× its size.',
    defaults: { lh: 1.1 },
    ranges: { lh: { min: 0.95, max: 1.3, unit: '×' } },
    rationale: '"Tight" is a mood; a line height as a multiple of the type size is a value.',
    mockReplacement: 'Headline line height is 1.1× its size.',
    source: 'common display-type practice; a team convention',
  },
]

export function getEntry(key: string): AuthoringEntry | undefined {
  return entries.find((e) => e.key === key)
}

/** The template with each `{slot}` replaced by the given values. */
export function fillTemplate(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, slot: string) =>
    slot in values ? String(values[slot]) : whole,
  )
}
