// The checklist prompt text (027 FR-09). One function renders a style version's
// rules for one scope; every builder that carries them calls this and nothing
// else, so the wording lives in one place.
import { getStyle } from './styles'
import type { PostStyle, RuleScope } from './types'

// The single preamble. `{label}` is the style's label.
export const CHECKLIST_PREAMBLE =
  'Content rules for this post (post style: {label}). They outrank the brand voice and the campaign briefing where they conflict. "Stated in the brief" means the value appears in the topic, the description, the campaign briefing or the brand voice text. If a value is not stated, do not write it.'

// '' when the style or version does not resolve, or the scope has no rules.
export function checklistPromptText(
  key: string,
  version: number,
  scope: RuleScope,
  source?: Readonly<Record<string, PostStyle>>,
): string {
  const style = getStyle(key, source)
  if (!style || !Object.hasOwn(style.versions, version)) return ''
  const rules = style.versions[version].checklist.filter((r) => r.scope === scope)
  if (rules.length === 0) return ''
  return [
    CHECKLIST_PREAMBLE.replace('{label}', style.label),
    ...rules.map((r) => `- ${r.text}`),
  ].join('\n')
}
