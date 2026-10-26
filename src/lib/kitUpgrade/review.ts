// The host-agnostic review core (007 FR-12). It takes plain text and a list of
// edits; it knows nothing about brand kits, so the kit editor is the first host
// and a briefing editor can be the second. The repo has no jsdom, so what is
// stale, applied or dismissed is a pure function the unit tests can drive.
// Imports a type only.
import type { Edit } from '@/lib/designData/authoring/validate'

export type EditStatus = 'pending' | 'accepted' | 'rejected' | 'stale'

export interface ReviewState {
  edits: Array<{ edit: Edit; status: EditStatus }>
  /** `dismissKey` values, held for the session only. */
  dismissed: ReadonlySet<string>
}

export type ReviewAction =
  | { type: 'proposed'; edits: readonly Edit[]; text: string }
  | { type: 'accept'; id: string }
  | { type: 'reject'; id: string }
  | { type: 'textChanged'; text: string }
  | { type: 'dismiss'; key: string }
  | { type: 'reset' }

export const initialReviewState: ReviewState = { edits: [], dismissed: new Set() }

const KEY_SEP = '\u0001'
export const dismissKey = (entryKey: string, quote: string): string =>
  `${entryKey}${KEY_SEP}${quote}`

function countOccurrences(text: string, quote: string): number {
  if (!quote) return 0
  let n = 0
  for (let i = text.indexOf(quote); i !== -1; i = text.indexOf(quote, i + 1)) n++
  return n
}

/** Where the edit's quote sits, only when it occurs exactly once. */
export function locateEdit(
  text: string,
  edit: Pick<Edit, 'quote'>,
): { start: number; end: number } | null {
  if (countOccurrences(text, edit.quote) !== 1) return null
  const start = text.indexOf(edit.quote)
  return { start, end: start + edit.quote.length }
}

/** The text with the edit applied. An edit that cannot be located leaves the text as it was. */
export function applyEdit(text: string, edit: Edit): string {
  const at = locateEdit(text, edit)
  if (!at) return text
  if (edit.kind === 'replace')
    return text.slice(0, at.start) + edit.replacement + text.slice(at.end)
  // insert: after the sentence holding the quote, one space between.
  const rest = text.slice(at.end)
  const stop = rest.search(/[.!?](?=\s|$)|\n/)
  if (stop === -1) return `${text}. ${edit.replacement}`
  if (rest[stop] === '\n')
    return `${text.slice(0, at.end + stop)}. ${edit.replacement}${rest.slice(stop)}`
  const pos = at.end + stop + 1
  return `${text.slice(0, pos)} ${edit.replacement}${text.slice(pos)}`
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'proposed':
      return {
        ...state,
        edits: action.edits.map((edit) => ({
          edit,
          status: locateEdit(action.text, edit) ? 'pending' : 'stale',
        })),
      }
    case 'accept':
      return setStatus(state, action.id, 'accepted')
    case 'reject':
      return setStatus(state, action.id, 'rejected')
    case 'textChanged': {
      // A pending or stale edit follows the text: its quote must occur exactly once.
      const edits = state.edits.map((e) =>
        e.status === 'pending' || e.status === 'stale'
          ? { ...e, status: (locateEdit(action.text, e.edit) ? 'pending' : 'stale') as EditStatus }
          : e,
      )
      // A dismissal whose quote is gone from the text is dropped.
      const dismissed = new Set(
        [...state.dismissed].filter((k) => action.text.includes(k.slice(k.indexOf(KEY_SEP) + 1))),
      )
      return { edits, dismissed }
    }
    case 'dismiss':
      return { ...state, dismissed: new Set(state.dismissed).add(action.key) }
    case 'reset':
      return initialReviewState
  }
}

// Only a pending edit can be accepted or rejected; accepting a stale edit is a no-op.
function setStatus(state: ReviewState, id: string, status: 'accepted' | 'rejected'): ReviewState {
  return {
    ...state,
    edits: state.edits.map((e) =>
      e.edit.id === id && e.status === 'pending' ? { ...e, status } : e,
    ),
  }
}

/**
 * Accept one edit against the current text: apply it and re-check the rest.
 * Returns the state and text unchanged when the edit is not pending.
 */
export function acceptEdit(
  state: ReviewState,
  id: string,
  text: string,
): { state: ReviewState; text: string } {
  const entry = state.edits.find((e) => e.edit.id === id)
  if (!entry || entry.status !== 'pending' || !locateEdit(text, entry.edit)) return { state, text }
  const next = applyEdit(text, entry.edit)
  return {
    state: reviewReducer(reviewReducer(state, { type: 'accept', id }), {
      type: 'textChanged',
      text: next,
    }),
    text: next,
  }
}
