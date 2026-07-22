import { AsyncLocalStorage } from 'node:async_hooks'

// Per-request Claude CLI auth context.
//
// ⚠️ IMPLICIT CONTEXT — read this before touching CLI auth. The acting
// credential (a member's personal OAuth token, or the team's shared token) is
// NOT threaded through function signatures; it rides an AsyncLocalStorage set
// at the route entry point (withClaudeAuth in userToken.ts) and is read at the
// single spawn site (runClaudeCliOnce, claudeCli.ts). Rationale: every CLI call
// funnels through runClaudeCli, but explicit threading would touch 14+
// signatures including the provider-agnostic CopyProvider interface with a
// Claude-CLI-only concern.
//
// There are exactly two tiers now — personal, then team — and NO further
// fallback below the team tier: a caller that never enters runWithClaudeAuth,
// or whose resolveClaudeAuth found neither a personal nor a team token, gets a
// no-credential ClaudeCliError from runClaudeCliOnce. CLI mode always requires
// an explicit credential (the old shared-env-token and dev-logged-in-session
// tiers are deleted — see claudeCli.ts).
//
// This module is deliberately dependency-free (only node:async_hooks) so it can
// sit below claudeCli.ts without import cycles; the prisma-aware resolver lives
// in userToken.ts. `resolveFallback` is how the retry-once-on-auth-failure logic
// in claudeCli.ts reaches the team tier WITHOUT claudeCli.ts importing prisma or
// userToken.ts (userToken.ts itself imports claudeCli.ts, for token validation —
// a direct import would be a cycle): resolveClaudeAuth (userToken.ts) closes
// over the teamId and hands back a ready-made ClaudeCliAuth for the team when
// the personal token is rejected.

export interface ClaudeCliAuth {
  /** Decrypted OAuth token (`sk-ant-oat01-…`) — personal or the team's. */
  token: string
  /** The acting user, when this is the PERSONAL tier; null for the team tier. */
  userId: string | null
  /** The active team this call is scoped/billed under. */
  teamId: string
  /**
   * Marks the stored credential invalid after an observed auth failure.
   * Injected by the resolver layer so this module (and claudeCli.ts) never
   * import prisma. Must be idempotent — concurrent failures may invoke it
   * more than once.
   */
  onAuthFailure: () => Promise<void>
  /**
   * Resolves the next credential tier to retry against after THIS token is
   * rejected. undefined ⇒ no further tier (this auth IS already the team
   * tier, or the personal tier was resolved with nothing below it) — a
   * failure here propagates with no retry.
   */
  resolveFallback?: () => Promise<ClaudeCliAuth | null>
}

const storage = new AsyncLocalStorage<ClaudeCliAuth>()

/** Runs fn with the given auth visible to runClaudeCli. null ⇒ plain passthrough (no credential in scope — runClaudeCliOnce throws if a CLI-mode call actually tries to spawn). */
export function runWithClaudeAuth<T>(auth: ClaudeCliAuth | null, fn: () => Promise<T>): Promise<T> {
  if (!auth) return fn()
  return storage.run(auth, fn)
}

/** The acting credential, if the current async chain entered runWithClaudeAuth. */
export function currentClaudeAuth(): ClaudeCliAuth | undefined {
  return storage.getStore()
}
