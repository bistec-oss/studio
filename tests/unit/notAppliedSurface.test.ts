// T11 — the not-applied outcome on the poll, and the UI that surfaces it.
//
// Source-asserted, for the reason refineWiring.test.ts gives: the poll route
// cannot be imported without its auth wrapper and a live Prisma client, and the
// panel is a client component whose behaviour here is one branch of a polling
// effect. What these assertions are actually FOR is the failure the plan called
// out by name: the client and server halves of one merge agreeing on a field
// name only by luck. Both halves are read from disk in the same test, so a
// rename on one side that is not made on the other fails here rather than
// silently surfacing `undefined` in the panel.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../', p), 'utf8')

const pollRoute = read('src/app/api/drafts/[id]/route.ts')
const apiTypes = read('src/lib/api-types.ts')
const panel = read('src/components/drafts/RefinementPanel.tsx')
const draftPage = read('src/app/(app)/drafts/[id]/page.tsx')
const schema = read('prisma/schema.prisma')

// The one name. Spelled once here so a rename is a one-line test edit that
// forces every half to be renamed with it.
const FIELD = 'notAppliedReason'

describe('the not-applied poll field is one name end to end (AC-18)', () => {
  it('is the column name, so nothing is remapped in between', () => {
    expect(schema).toContain(`${FIELD}   String?`)
  })

  it('is constructed on the poll response', () => {
    expect(pollRoute).toContain(`${FIELD}: draft.${FIELD},`)
  })

  it('is declared on the client-side poll contract', () => {
    expect(apiTypes).toContain(`${FIELD}: string | null`)
  })

  it('is declared on, and passed to, the panel that surfaces it', () => {
    expect(panel).toContain(`${FIELD}: string | null`)
    expect(draftPage).toContain(`${FIELD}={draft.${FIELD}}`)
  })
})

describe('it stays separate from the existing error channel (FR-14)', () => {
  it('is not folded into pendingActionError or failureReason on the response', () => {
    // Each of those three response fields is populated from its own source;
    // none of them is the not-applied value under another name.
    expect(pollRoute).toContain('pendingActionError: effective.pendingActionError,')
    expect(pollRoute).toContain('failureReason: effective.failureReason,')
    expect(pollRoute).not.toContain(`pendingActionError: draft.${FIELD}`)
    expect(pollRoute).not.toContain(`failureReason: draft.${FIELD}`)
  })

  it('does not travel through the stuck-action recovery, which never touches it', () => {
    // recoverIfStuck writes pendingActionError = STUCK_ACTION_REASON on a stale
    // claim. A not-applied refine released its claim cleanly, so it has no
    // business in that shape — and a second copy of the value there could
    // disagree with the row.
    const recovery = pollRoute.slice(
      pollRoute.indexOf('async function recoverIfStuck'),
      pollRoute.indexOf('async function loadDraft'),
    )
    expect(recovery).not.toContain(FIELD)
  })

  it('resolves the chat message to its own status, not to the error status', () => {
    expect(panel).toContain(`} else if (${FIELD}) {`)
    expect(panel).toContain(`setStatus('not-applied', ${FIELD})`)
    // Ordering is load-bearing: a twice-missed refine has a null
    // pendingActionError and an unmoved revision pointer, so a branch placed
    // after either of those would never be reached.
    expect(panel.indexOf(`} else if (${FIELD}) {`)).toBeLessThan(
      panel.indexOf('} else if (pendingActionError) {'),
    )
  })

  it('re-renders on a change to the field, or the poll would never resolve it', () => {
    expect(panel).toContain(
      `}, [pendingAction, pendingActionError, ${FIELD}, conflict, currentRevisionNumber, onRefined])`,
    )
  })
})

describe('it is surfaced as a hard failure, not a warning (FR-14)', () => {
  const card = panel.slice(panel.indexOf(`{${FIELD} && `), panel.indexOf('{conflictCard && ('))

  it('renders only when no action is in flight', () => {
    expect(card).toContain(`{${FIELD} && pendingAction === null && (`)
  })

  it('states that nothing changed and that no version exists', () => {
    expect(card).toContain('your design is unchanged')
    expect(card).toContain('No new version was created')
  })

  it('shows the verifier’s stated measurement rather than swallowing it', () => {
    expect(card).toContain(`{${FIELD}}`)
  })

  it('reads as a failure, not as the amber brand-conflict decision', () => {
    expect(card).toContain('border-red-300')
    expect(card).not.toContain('amber')
  })

  it('is not dismissible — there is no successful result to dismiss it onto', () => {
    expect(card).not.toContain('onClick')
  })
})
