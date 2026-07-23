// POST /api/briefs copy-provider-key decision (prod fix 2026-07-23): the wizard
// no longer must send a copyProviderKey in CLI mode — copy defaults to the local
// Claude CLI (OAuth chain). An explicitly provided key is validated (existence
// checked by the route); when omitted in CLI mode we store the 'cli' marker and
// skip the existence check; API mode still requires a key.

import { describe, it, expect } from 'vitest'
import { resolveBriefCopyKey } from '@/lib/brief/copyProvider'

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
