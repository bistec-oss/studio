import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { isCliMode } from '@/lib/agent/config'
import { runClaudeCli } from '@/lib/agent/claudeCli'
import { runWithClaudeAuth, type ClaudeCliAuth } from '@/lib/agent/claudeAuth'
import { MOCK_AI, mockClaudeTokenValidation } from '@/lib/testHooks'

// Resolver layer for Claude CLI auth: personal UserClaudeToken → team
// Team.encryptedClaudeToken → no credential (the old shared-env-token and
// dev-logged-in-session tiers are deleted). Routes wrap their model-calling
// span in withClaudeAuth(); everything below runClaudeCli then bills whichever
// tier resolved, with the team token as the one fallback tier (retried once on
// an observed auth failure — see claudeCli.ts). See claudeAuth.ts for the
// AsyncLocalStorage design note.

/**
 * The credential for this call: the personal token when userId is given, CLI
 * mode is on, the row is ACTIVE, and the account isn't disabled; otherwise the
 * team's token; otherwise null (no credential — a CLI-mode call will then hard
 * -fail in claudeCli.ts). Not CLI mode ⇒ always null, without any DB query
 * (tokens are CLI-only).
 */
export async function resolveClaudeAuth(
  userId: string | null,
  teamId: string
): Promise<ClaudeCliAuth | null> {
  if (!isCliMode()) return null

  if (userId) {
    const row = await prisma.userClaudeToken.findUnique({
      where: { userId },
      include: { user: { select: { disabled: true } } },
    })
    if (row && row.status === 'ACTIVE' && !row.user.disabled) {
      return {
        token: decrypt(row.encryptedToken),
        userId,
        teamId,
        onAuthFailure: () => markUserTokenInvalid(userId),
        // Resolved lazily — only queried if the personal token is rejected.
        resolveFallback: () => resolveTeamClaudeAuth(teamId),
      }
    }
  }

  return resolveTeamClaudeAuth(teamId)
}

async function resolveTeamClaudeAuth(teamId: string): Promise<ClaudeCliAuth | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { encryptedClaudeToken: true },
  })
  if (!team?.encryptedClaudeToken) return null
  return {
    token: decrypt(team.encryptedClaudeToken),
    userId: null,
    teamId,
    onAuthFailure: () => markTeamClaudeTokenInvalid(teamId),
    // No tier below the team token.
  }
}

/**
 * Route-facing wrapper: resolve the credential (personal → team) and run fn
 * with it in scope. Fast no-op (no DB query) outside CLI mode. Wrap the whole
 * model-calling span so every `claude -p` the span spawns shares one resolved
 * credential.
 */
export async function withClaudeAuth<T>(
  userId: string | null,
  teamId: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!isCliMode()) return fn()
  const auth = await resolveClaudeAuth(userId, teamId)
  return runWithClaudeAuth(auth, fn)
}

/**
 * Flags the stored personal token after an observed auth failure so the UI
 * prompts a reconnect and later calls skip it. updateMany ⇒ idempotent and a
 * no-op when the row was deleted mid-flight or a concurrent failure already
 * flipped it.
 */
export async function markUserTokenInvalid(userId: string): Promise<void> {
  await prisma.userClaudeToken.updateMany({
    where: { userId },
    data: { status: 'INVALID' },
  })
}

/**
 * Clears the team's Claude token after an observed auth failure. The Team
 * model has no status column (unlike UserClaudeToken) — the credential is
 * simply removed, same effect as a team admin disconnecting it; a team admin
 * must paste a fresh one in Team Settings. updateMany ⇒ idempotent.
 */
export async function markTeamClaudeTokenInvalid(teamId: string): Promise<void> {
  await prisma.team.updateMany({
    where: { id: teamId },
    data: { encryptedClaudeToken: null, claudeKeyPrefix: null },
  })
  console.warn(`[userToken] team ${teamId} Claude token rejected — cleared, a team admin must reconnect`)
}

export type TokenValidationResult = { ok: true; skipped?: boolean } | { ok: false; error: string }

/**
 * Save-time validation for a pasted token (PUT /api/me/claude-token or
 * PUT /api/team/claude-token — both routes share this contract).
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
