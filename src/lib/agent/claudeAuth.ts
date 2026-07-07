import { AsyncLocalStorage } from 'node:async_hooks'

// Per-request Claude CLI auth context.
//
// ⚠️ IMPLICIT CONTEXT — read this before touching CLI auth. The acting user's
// personal OAuth token is NOT threaded through function signatures; it rides an
// AsyncLocalStorage set at the route entry point (withUserClaudeAuth in
// userToken.ts) and is read at the single spawn site (runClaudeCli). Rationale:
// every CLI call funnels through runClaudeCli, but explicit threading would
// touch 14+ signatures including the provider-agnostic CopyProvider interface
// with a Claude-CLI-only concern. The trade-off is implicitness — mitigated by
// the fail-safe default: any caller that never enters runWithClaudeAuth (the
// scheduler worker, MCP/ACP, scripts) simply uses the shared server credential.
//
// This module is deliberately dependency-free (only node:async_hooks) so it can
// sit below claudeCli.ts without import cycles; the prisma-aware resolver lives
// in userToken.ts.

export interface ClaudeCliAuth {
  /** Decrypted personal OAuth token (`sk-ant-oat01-…`). */
  token: string
  userId: string
  /**
   * Marks the stored token INVALID after an observed auth failure. Injected by
   * the resolver layer so this module (and claudeCli.ts) never import prisma.
   * Must be idempotent — concurrent failures may invoke it more than once.
   */
  onAuthFailure: () => Promise<void>
}

const storage = new AsyncLocalStorage<ClaudeCliAuth>()

/** Runs fn with the given auth visible to runClaudeCli. null ⇒ plain passthrough (shared credential). */
export function runWithClaudeAuth<T>(auth: ClaudeCliAuth | null, fn: () => Promise<T>): Promise<T> {
  if (!auth) return fn()
  return storage.run(auth, fn)
}

/** The acting user's CLI auth, if the current async chain entered runWithClaudeAuth. */
export function currentClaudeAuth(): ClaudeCliAuth | undefined {
  return storage.getStore()
}
