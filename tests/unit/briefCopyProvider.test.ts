// POST /api/briefs copy-provider-key decision (prod fix 2026-07-23): the wizard
// no longer must send a copyProviderKey in CLI mode — copy defaults to the local
// Claude CLI (OAuth chain). An explicitly provided key is validated (existence
// checked by the route); when omitted in CLI mode we store the 'cli' marker and
// skip the existence check; API mode still requires a key.

import { describe, it, expect } from 'vitest'
import { resolveBriefCopyKey, canSubmitBrief } from '@/lib/brief/copyProvider'

describe('resolveBriefCopyKey — a chosen caption route (024 FR-05, decision C)', () => {
  it("ignores any provided key and stores the 'cli' marker with no existence check, in either mode", () => {
    for (const cliMode of [true, false]) {
      for (const key of [undefined, '', '   ', 'anthropic-123']) {
        expect(resolveBriefCopyKey(key, cliMode, true)).toEqual({ key: 'cli', validateExists: false })
      }
    }
  })

  it('API mode no longer needs a key once the team has chosen (no "required" error)', () => {
    expect(resolveBriefCopyKey(undefined, false, true)).toEqual({ key: 'cli', validateExists: false })
  })

  it('a never-chosen team (routeChosen false) is exactly today', () => {
    expect(resolveBriefCopyKey('anthropic-123', false, false)).toEqual({ key: 'anthropic-123', validateExists: true })
    expect(resolveBriefCopyKey(undefined, false, false)).toEqual({ error: 'copyProviderKey is required' })
  })
})

describe('resolveBriefCopyKey', () => {
  it('uses an explicitly provided key and marks it for existence validation', () => {
    expect(resolveBriefCopyKey('anthropic-123', false)).toEqual({
      key: 'anthropic-123',
      validateExists: true,
    })
    // trims
    expect(resolveBriefCopyKey('  anthropic-123  ', true)).toEqual({
      key: 'anthropic-123',
      validateExists: true,
    })
  })

  it('CLI mode + no key ⇒ the "cli" marker, no existence check', () => {
    expect(resolveBriefCopyKey(undefined, true)).toEqual({ key: 'cli', validateExists: false })
    expect(resolveBriefCopyKey('   ', true)).toEqual({ key: 'cli', validateExists: false })
  })

  it('API mode + no key ⇒ error (still required)', () => {
    expect(resolveBriefCopyKey(undefined, false)).toEqual({ error: 'copyProviderKey is required' })
    expect(resolveBriefCopyKey('', false)).toEqual({ error: 'copyProviderKey is required' })
  })
})

// The wizard's Generate button used to gate on "a COPY provider row exists",
// which stopped matching the route once CLI mode made the key optional: the
// button stayed disabled on a team with no COPY provider, so the CLI default was
// unreachable from the UI even though POST /api/briefs would have accepted it.
// canSubmitBrief is that gate, defined as the negation of the route's own error
// case — these tests pin the two rules together.
describe('canSubmitBrief', () => {
  it('CLI mode + NO registered copy provider ⇒ submittable (the regression)', () => {
    expect(canSubmitBrief(undefined, true)).toBe(true)
    expect(canSubmitBrief('', true)).toBe(true)
    expect(canSubmitBrief('   ', true)).toBe(true)
  })

  it('API mode + no copy provider ⇒ blocked (a 400 would follow)', () => {
    expect(canSubmitBrief(undefined, false)).toBe(false)
    expect(canSubmitBrief('', false)).toBe(false)
  })

  it('an explicit key is submittable in either mode', () => {
    expect(canSubmitBrief('anthropic-123', false)).toBe(true)
    expect(canSubmitBrief('anthropic-123', true)).toBe(true)
  })

  it('agrees with resolveBriefCopyKey for every combination', () => {
    for (const key of [undefined, '', '   ', 'anthropic-123']) {
      for (const cliMode of [true, false]) {
        for (const routeChosen of [true, false]) {
          expect(canSubmitBrief(key, cliMode, routeChosen)).toBe(
            !('error' in resolveBriefCopyKey(key, cliMode, routeChosen)),
          )
        }
      }
    }
  })

  it('a chosen route is submittable with no key in API mode (024)', () => {
    expect(canSubmitBrief(undefined, false, true)).toBe(true)
    expect(canSubmitBrief(undefined, false, false)).toBe(false)
  })
})
