// The reason an unattended post action was not run (027 FR-12). Pure: fixed
// sentences around the flagged values (a value as written, never caption text),
// at most five values and "and N more", the whole reason at most 300 characters.
import type { FactsCheck } from '@/lib/factsCheck/types'

export const HELD_REASON_MAX = 300
const MAX_VALUES = 5
const TAIL = 'Review the draft, then publish it by hand.'

export const HELD_REASON_COULD_NOT_RUN = `Not published: the facts check could not run. ${TAIL}`

/** True when the check does not let an auto-publish run: anything but `clear` (a missing check included). */
export function checkHoldsPublish(check: FactsCheck | null): boolean {
  return !check || check.status !== 'clear'
}

export function heldReasonFor(check: FactsCheck | null): string {
  if (!check || check.status !== 'flagged' || check.flagged.length === 0) {
    return HELD_REASON_COULD_NOT_RUN
  }
  const seen: string[] = []
  for (const f of check.flagged) if (!seen.includes(f.value)) seen.push(f.value)
  const shown = seen.slice(0, MAX_VALUES)
  const rest = seen.length - shown.length
  const values = shown.join(', ') + (rest > 0 ? ` and ${rest} more` : '')
  const reason = `Not published: the facts check flagged ${values}. ${TAIL}`
  return reason.length > HELD_REASON_MAX ? reason.slice(0, HELD_REASON_MAX - 1) + '…' : reason
}
