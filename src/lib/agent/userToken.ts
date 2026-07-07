import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { isCliMode } from '@/lib/agent/config'
import { runClaudeCli } from '@/lib/agent/claudeCli'
import { runWithClaudeAuth, type ClaudeCliAuth } from '@/lib/agent/claudeAuth'
import { MOCK_AI, mockClaudeTokenValidation } from '@/lib/testHooks'

// Resolver layer for per-user Claude OAuth tokens (UserClaudeToken rows).
// Routes wrap their model-calling span in withUserClaudeAuth(); everything
// below runClaudeCli then bills the acting user's Claude subscription, with
// the shared server token as the fallback tier. See claudeAuth.ts for the
// AsyncLocalStorage design note.

/**
 * The acting user's CLI auth, or null ⇒ caller falls through to the shared
 * credential. Null when: not CLI mode (tokens are CLI-only), no row, the row
 * is INVALID (awaiting reconnect), or the account is deactivated.
 */
export async function resolveClaudeAuthForUser(userId: string): Promise<ClaudeCliAuth | null> {
  if (!isCliMode()) return null
  const row = await prisma.userClaudeToken.findUnique({
    where: { userId },
    include: { user: { select: { disabled: true } } },
  })
  if (!row || row.status !== 'ACTIVE' || row.user.disabled) return null
  return {
    token: decrypt(row.encryptedToken),
    userId,
    onAuthFailure: () => markUserTokenInvalid(userId),
  }
}

/**
 * Route-facing wrapper: resolve the user's token and run fn with it in scope.
 * Fast no-op (no DB query) outside CLI mode. Wrap the whole model-calling span
 * so every `claude -p` the span spawns shares one resolved token.
 */
export async function withUserClaudeAuth<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  if (!isCliMode()) return fn()
  const auth = await resolveClaudeAuthForUser(userId)
  return runWithClaudeAuth(auth, fn)
}

/**
 * Flags the stored token after an observed auth failure so the UI prompts a
 * reconnect and later calls skip it. updateMany ⇒ idempotent and a no-op when
 * the row was deleted mid-flight or a concurrent failure already flipped it.
 */
export async function markUserTokenInvalid(userId: string): Promise<void> {
  await prisma.userClaudeToken.updateMany({
    where: { userId },
    data: { status: 'INVALID' },
  })
}

export type TokenValidationResult = { ok: true; skipped?: boolean } | { ok: false; error: string }

/**
 * Save-time validation for a pasted token (PUT /api/me/claude-token).
 *   MOCK_AI    → deterministic seam (E2E runs claude-html and can't spawn the CLI)
 *   CLI mode   → live `claude -p` ping under the candidate token; ANY failure
 *                rejects (fail closed) — an expired token and a broken CLI both
 *                mean we can't vouch for the token
 *   API mode   → { ok, skipped } — stored unvalidated/dormant; it only starts
 *                being used (and can then be live-validated) under CLI mode
 */
export async function validateClaudeToken(token: string): Promise<TokenValidationResult> {
  if (MOCK_AI) {
    const mock = mockClaudeTokenValidation(token)
    return mock.ok ? { ok: true } : { ok: false, error: mock.error ?? 'Token validation failed' }
  }
  if (!isCliMode()) return { ok: true, skipped: true }
  try {
    await runClaudeCli('Reply with exactly: pong', {
      model: 'haiku',
      timeoutMs: 60_000,
      label: 'token-validate',
      authToken: token,
    })
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(`[userToken] token validation failed: ${message}`)
    return {
      ok: false,
      error:
        'Token was rejected by Claude. Re-run `claude setup-token` and paste the fresh token — ' +
        'and check it was copied completely.',
    }
  }
}
