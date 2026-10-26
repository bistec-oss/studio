// Post styles (027): the dataset. One idea: a post style is data, and every
// reader (the wizard, the briefs route, the queue, MCP, ACP, the caption and
// image prompts) reads this one copy through src/lib/postStyles.
//
// THE KEY RULE (permanent):
//  - a key is never reused for a different meaning and never renamed;
//  - a retired style (`status: 'retired'`) stays resolvable and is hidden from
//    pickers, so stored briefs, queue entries, campaigns and stamps keep working;
//  - a future team-owned style gets its own id column and never a bare string
//    in Brief.postStyle, ScheduledGeneration.postStyle or Campaign.defaultPostStyle.
//
// THE VERSION RULE: a released version is never edited. A change adds
// versions[n+1] and moves `current`; the committed hash table in
// tests/unit/postStylesDataset.test.ts fails on an in-place edit.
//
// "Stated in the brief" in a rule means the value appears in the topic, the
// description, the campaign briefing or the brand voice text.
import { getArchetype, type ArchetypeMap } from '@/lib/designData'
import type { PostStyle, PostStyleKey } from './types'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v)
  }
  return value
}

export const styles: Readonly<Record<PostStyleKey, PostStyle>> = deepFreeze({
  general: {
    key: 'general',
    label: 'General',
    summary: 'A post that is not one of the kinds below.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        goal: 'awareness',
        defaultTone: 'professional',
        defaultImageStyle: 'classic',
        checklist: [
          {
            id: 'general.no-invented-values',
            scope: 'caption',
            check: 'facts-check',
            text: 'Write a date, price, percentage or other number only if the brief states it. If it does not, leave it out.',
          },
          {
            id: 'general.one-cta',
            scope: 'caption',
            text: 'Include exactly one call to action.',
          },
          {
            id: 'general.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a date, price, percentage or other number on the image only if the brief states it.',
          },
        ],
      },
    },
  },
  launch: {
    key: 'launch',
    label: 'Launch / new offer',
    summary: 'A new product, feature or offer going live.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        goal: 'conversion',
        defaultTone: 'bold',
        defaultImageStyle: 'product-showcase',
        checklist: [
          {
            id: 'launch.name-it',
            scope: 'caption',
            text: 'Name the thing being launched in the first sentence, as the brief writes the name.',
          },
          {
            id: 'launch.no-invented-specs',
            scope: 'caption',
            check: 'facts-check',
            text: 'State a feature, spec, price or date only if the brief states it.',
          },
          {
            id: 'launch.one-cta',
            scope: 'caption',
            text: 'Include exactly one call to action.',
          },
          {
            id: 'launch.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print the launch name as the brief writes it. Print no spec, price or date the brief does not state.',
          },
        ],
      },
    },
  },
  promotion: {
    key: 'promotion',
    label: 'Promotion / deal',
    summary: 'An offer, a discount or a deal.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        goal: 'conversion',
        defaultTone: 'bold',
        defaultImageStyle: 'classic',
        checklist: [
          {
            id: 'promotion.offer-if-stated',
            scope: 'caption',
            check: 'facts-check',
            text: "State the offer, a price, a discount or percentage and an end date only if the brief states each one. If the brief gives no end date, write no urgency phrase ('today only', 'limited time', 'ends soon').",
          },
          {
            id: 'promotion.open-cta',
            scope: 'caption',
            text: "If the brief states no price or end date, close with an open call to action such as 'Find out more' or 'Get in touch'.",
          },
          {
            id: 'promotion.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a price, a percentage or an end date on the image only if the brief states it.',
          },
        ],
      },
      2: {
        goal: 'conversion',
        defaultTone: 'bold',
        defaultImageStyle: 'spotlight',
        checklist: [
          {
            id: 'promotion.offer-if-stated',
            scope: 'caption',
            check: 'facts-check',
            text: "State the offer, a price, a discount or percentage and an end date only if the brief states each one. If the brief gives no end date, write no urgency phrase ('today only', 'limited time', 'ends soon').",
          },
          {
            id: 'promotion.open-cta',
            scope: 'caption',
            text: "If the brief states no price or end date, close with an open call to action such as 'Find out more' or 'Get in touch'.",
          },
          {
            id: 'promotion.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a price, a percentage or an end date on the image only if the brief states it.',
          },
        ],
      },
    },
  },
  event: {
    key: 'event',
    label: 'Event',
    summary: 'An event, a webinar or a session people can attend.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        goal: 'engagement',
        defaultTone: 'professional',
        defaultImageStyle: 'classic',
        checklist: [
          {
            id: 'event.when-where-if-stated',
            scope: 'caption',
            check: 'facts-check',
            text: 'State the date, the time and the place only if the brief states each one. Omit any it does not state.',
          },
          {
            id: 'event.how-to-join',
            scope: 'caption',
            text: 'Say how to register or attend as the brief states it. If it states none, invite people to ask for details.',
          },
          {
            id: 'event.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a date, a time or a place on the image only if the brief states it.',
          },
        ],
      },
      2: {
        goal: 'engagement',
        defaultTone: 'professional',
        defaultImageStyle: 'full-bleed-scene',
        checklist: [
          {
            id: 'event.when-where-if-stated',
            scope: 'caption',
            check: 'facts-check',
            text: 'State the date, the time and the place only if the brief states each one. Omit any it does not state.',
          },
          {
            id: 'event.how-to-join',
            scope: 'caption',
            text: 'Say how to register or attend as the brief states it. If it states none, invite people to ask for details.',
          },
          {
            id: 'event.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a date, a time or a place on the image only if the brief states it.',
          },
        ],
      },
    },
  },
  hiring: {
    key: 'hiring',
    label: 'Hiring',
    summary: 'A role that is open.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        goal: 'hiring',
        defaultTone: 'professional',
        defaultImageStyle: 'classic',
        checklist: [
          {
            id: 'hiring.role-named',
            scope: 'caption',
            text: 'Name the role in the first sentence, as the brief writes it.',
          },
          {
            id: 'hiring.how-to-apply',
            scope: 'caption',
            text: 'Say how to apply as the brief states it. If it states none, ask applicants to get in touch.',
          },
          {
            id: 'hiring.no-invented-terms',
            scope: 'caption',
            check: 'facts-check',
            text: 'State a salary, location, work arrangement, benefit or deadline only if the brief states it.',
          },
          {
            id: 'hiring.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print the role name. Print no salary, location or deadline the brief does not state.',
          },
        ],
      },
      2: {
        goal: 'hiring',
        defaultTone: 'professional',
        defaultImageStyle: 'full-bleed-scene',
        checklist: [
          {
            id: 'hiring.role-named',
            scope: 'caption',
            text: 'Name the role in the first sentence, as the brief writes it.',
          },
          {
            id: 'hiring.how-to-apply',
            scope: 'caption',
            text: 'Say how to apply as the brief states it. If it states none, ask applicants to get in touch.',
          },
          {
            id: 'hiring.no-invented-terms',
            scope: 'caption',
            check: 'facts-check',
            text: 'State a salary, location, work arrangement, benefit or deadline only if the brief states it.',
          },
          {
            id: 'hiring.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print the role name. Print no salary, location or deadline the brief does not state.',
          },
        ],
      },
    },
  },
  announcement: {
    key: 'announcement',
    label: 'Announcement',
    summary: 'News the audience should hear first.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        goal: 'announcement',
        defaultTone: 'professional',
        defaultImageStyle: 'editorial-split',
        checklist: [
          {
            id: 'announcement.news-first',
            scope: 'caption',
            text: 'Put the news itself in the first sentence, and in the on-image headline, in plain words, not as a teaser.',
          },
          {
            id: 'announcement.no-invented-values',
            scope: 'caption',
            check: 'facts-check',
            text: 'State a date or number only if the brief states it.',
          },
          {
            id: 'announcement.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a date or number on the image only if the brief states it.',
          },
        ],
      },
    },
  },
  tip: {
    key: 'tip',
    label: 'Tip / how-to',
    summary: 'One useful thing the reader can do.',
    status: 'active',
    current: 1,
    versions: {
      1: {
        goal: 'engagement',
        defaultTone: 'casual',
        defaultImageStyle: 'classic',
        checklist: [
          {
            id: 'tip.one-tip',
            scope: 'caption',
            text: 'Give one concrete tip the reader can use today, in one or two sentences.',
          },
          {
            id: 'tip.no-invented-stats',
            scope: 'caption',
            check: 'facts-check',
            text: 'Quote a statistic, a percentage or a study only if the brief states it.',
          },
          {
            id: 'tip.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print no statistic or percentage the brief does not state.',
          },
        ],
      },
    },
  },
  milestone: {
    key: 'milestone',
    label: 'Milestone',
    summary: 'A count, an anniversary or an achievement worth marking.',
    status: 'active',
    current: 2,
    versions: {
      1: {
        goal: 'awareness',
        defaultTone: 'bold',
        defaultImageStyle: 'classic',
        checklist: [
          {
            id: 'milestone.number-if-stated',
            scope: 'caption',
            check: 'facts-check',
            text: 'State the milestone figure (a count, a year or an amount) only if the brief states it. Otherwise describe the milestone without a number.',
          },
          {
            id: 'milestone.thank-audience',
            scope: 'caption',
            text: 'Thank the audience in one sentence.',
          },
          {
            id: 'milestone.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a number or a year on the image only if the brief states it.',
          },
        ],
      },
      2: {
        goal: 'awareness',
        defaultTone: 'bold',
        defaultImageStyle: 'spotlight',
        checklist: [
          {
            id: 'milestone.number-if-stated',
            scope: 'caption',
            check: 'facts-check',
            text: 'State the milestone figure (a count, a year or an amount) only if the brief states it. Otherwise describe the milestone without a number.',
          },
          {
            id: 'milestone.thank-audience',
            scope: 'caption',
            text: 'Thank the audience in one sentence.',
          },
          {
            id: 'milestone.image-values',
            scope: 'image',
            check: 'facts-check',
            text: 'Print a number or a year on the image only if the brief states it.',
          },
        ],
      },
    },
  },
})

// The sum of `current` over all styles. It strictly increases whenever a version
// or a style is added, so a checklist edit can never leave it unchanged.
export function revisionOf(dataset: Readonly<Record<string, PostStyle>>): number {
  return Object.values(dataset).reduce((n, s) => n + s.current, 0)
}
export const POST_STYLES_REVISION = revisionOf(styles)

// The active styles, in table order (the pickers).
// `source` exists so a test can run the real filter on a fixture dataset.
export function activeStyles(
  source: Readonly<Record<string, PostStyle>> = styles,
): readonly PostStyle[] {
  return Object.values(source).filter((s) => s.status === 'active')
}

// An active or retired style, else undefined. Own-property lookup, so
// 'constructor' and '__proto__' never resolve.
export function getStyle(
  key: unknown,
  source: Readonly<Record<string, PostStyle>> = styles,
): PostStyle | undefined {
  return typeof key === 'string' && Object.hasOwn(source, key) ? source[key] : undefined
}

// True for any key in the dataset, retired included.
export function isStyleKey(raw: unknown): raw is PostStyleKey {
  return getStyle(raw) !== undefined
}

// Every default image style names a real key: `classic`, or any look in the
// dataset (a retired look still counts, so a released version stays valid).
// A module-load assertion throws in non-production so a bad edit fails at import
// (the unit test asserts the same thing through this function).
export function defaultImageStyleProblems(
  dataset: Readonly<Record<string, PostStyle>>,
  looks?: ArchetypeMap, // tests only: a fixture look dataset
): string[] {
  const problems: string[] = []
  for (const s of Object.values(dataset)) {
    for (const [n, v] of Object.entries(s.versions)) {
      const k = v.defaultImageStyle
      if (k !== 'classic' && !getArchetype(k, looks))
        problems.push(
          `${s.key}@${n}: defaultImageStyle '${k}' is not classic or a look in the dataset`,
        )
    }
  }
  return problems
}
if (process.env.NODE_ENV !== 'production') {
  const problems = defaultImageStyleProblems(styles)
  if (problems.length) throw new Error(`post styles: ${problems.join('; ')}`)
}
