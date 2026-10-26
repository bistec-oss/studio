// Pure prompt builders for the brand-kit prompt upgrade (007 FR-06, FR-09, FR-10).
// No I/O. The base text is untrusted: it enters only through fenceUntrusted,
// after UNTRUSTED_CONTENT_GUARD. Fonts and colours are named by role, so the
// kit's own font names and hex values never reach the model.
import type { AuthoringEntry } from '@/lib/designData/authoring'
import type { Candidate } from '@/lib/designData/authoring'
import { UNTRUSTED_CONTENT_GUARD, fenceUntrusted } from '@/lib/agent/untrusted'

export interface UpgradePrompt {
  system: string
  user: string
}

function rangeText(entry: AuthoringEntry): string {
  return Object.entries(entry.ranges)
    .map(([slot, r]) => `${slot} ${r.min} to ${r.max} ${r.unit}`)
    .join(', ')
}

export function buildUpgradePrompt(input: {
  candidates: ReadonlyArray<{ candidate: Candidate; entry: AuthoringEntry }>
  roles: readonly string[]
  text: string
}): UpgradePrompt {
  const roleLine =
    input.roles.length > 0 ? input.roles.join(', ') : '(none: name no fonts or colours)'
  const candidateLines = input.candidates.map(
    ({ candidate, entry }) =>
      `- id: ${candidate.id} | category: ${candidate.category} | quote: ${JSON.stringify(candidate.quote)} | entry: ${entry.label} | template: ${entry.template} | range: ${rangeText(entry)} | why: ${entry.rationale}`,
  )
  const system = [
    'You turn vague design instructions in a brand kit prompt into measurable rules.',
    "For each CANDIDATE below, write the replacement text for its entry. Use only numbers inside the entry's range.",
    `Refer to fonts and colours ONLY by these role names: ${roleLine}. Never write a hex value, a URL, a font name or HTML.`,
    'Reply with ONLY a ```kitedits block: [ { "candidateId": string, "replacement": string } ]. You may omit a candidate. You may not add one. Do not change the quote.',
    UNTRUSTED_CONTENT_GUARD,
    '',
    '# Candidates',
    ...candidateLines,
  ].join('\n')
  const user = `The brand kit prompt to improve:\n\n${fenceUntrusted(input.text)}`
  return { system, user }
}

// The "Improve with AI" prompt, moved here verbatim so a golden test can pin it
// (007 FR-15: the improve prompt text must not change).
export function buildImprovePrompt(currentPrompt: string): string {
  return `You are a brand strategist. Improve the following brand voice prompt for an AI design agent.

Current prompt:
${currentPrompt}

Make it more specific, actionable, and comprehensive. Add concrete guidance on visual composition, spacing, hierarchy, and specific do/don't rules. Keep the same second-person tone. Return only the improved prompt text, no preamble.`
}
