// The carrier for an action's analytics fields (006 design "Draft actions").
// A plain mutable object the route creates, passes to startDraftAction and
// closes over in its `work`; no ambient state. The token-usage accumulator
// (006 FR-09) is the one ambient piece, below.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { EventPayloadInput } from './catalogue'

export type DraftActionPayload = EventPayloadInput<'draft_action.settled'>

export interface ActionTrace {
  /** Epoch ms; startDraftAction sets it at entry. */
  startedAt: number
  /** Set by the refine conflict sink so the settle reports `conflict`. */
  outcome?: 'conflict'
  fields: Partial<DraftActionPayload>
}

export function newActionTrace(): ActionTrace {
  return { startedAt: Date.now(), fields: {} }
}

// ── Token usage (006 FR-09) ──────────────────────────────────────────────────
// Tokens are produced inside createMessage, too deep to thread. An emitter opens
// a store with withUsage; createMessage calls addUsage, which does nothing when
// no store is active (so every other caller is unchanged). The CLI path never
// calls it, so a CLI run's store stays at calls === 0 and reports null.
export interface UsageStore {
  input: number
  output: number
  calls: number
}

const usageStorage = new AsyncLocalStorage<UsageStore>()

export function newUsage(): UsageStore {
  return { input: 0, output: 0, calls: 0 }
}

/** Runs `fn` with `store` active; the store outlives the call so a throw still reports what was spent. */
export function withUsage<T>(store: UsageStore, fn: () => Promise<T>): Promise<T> {
  return usageStorage.run(store, fn)
}

/** Adds one response's usage to the active store; a no-op with no store. */
export function addUsage(u: { input_tokens?: number | null; output_tokens?: number | null } | null | undefined): void {
  const store = usageStorage.getStore()
  if (!store || !u) return
  store.calls += 1
  store.input += u.input_tokens ?? 0
  store.output += u.output_tokens ?? 0
}

/** The payload fields: null (not reported) when no call reported usage. */
export function usageFields(store: UsageStore): { inputTokens: number | null; outputTokens: number | null } {
  return store.calls > 0
    ? { inputTokens: store.input, outputTokens: store.output }
    : { inputTokens: null, outputTokens: null }
}
