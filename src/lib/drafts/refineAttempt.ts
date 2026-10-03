// The refine attempt loop (change 004 Phase 2, T17): classify → check → verify
// → retry once → accept or "not applied". FR-04/05/07/11/12/13/20,
// AC-07/08/09/10/11/15/16.
//
// The route (api/drafts/[id]/refine) injects the two things that cost money —
// the refine model call and verifyRefine — so this module is unit-testable
// with fakes and every call-count cap is provable (Ruling F).
//
// ── One attempt ──────────────────────────────────────────────────────────────
//   1. runRefine() → the model's RAW reply (never rendered by the runner).
//   2. API mode only: a brand-conflict marker ends the refine as a conflict —
//      checked BEFORE the envelope is parsed (parseConflict is injected).
//   3. parseRefineEnvelope(raw) — no document at all → miss.
//   4. A document with no closing </html> was cut off → miss (truncation rule).
//   5. effectiveClasses(): a DESTRUCTIVE class (replace/remove — the table's
//      `destructive` flag) with an empty supersedes is downgraded to add and
//      counts as a miss (AC-10, FR-04: the route enforces this, the prompt is
//      not trusted to). The retry is told why; a second downgrade ends as not
//      applied. A downgraded constrain simply stays add and is verified by the
//      Haiku verifier.
//   6. Inline-asset reconciliation on the envelope's html (never the raw reply
//      — Ruling C). Renamed / duplicated / unknown tokens, or a truncated
//      __INLINE_ASSET_ prefix no sent token accounts for → mismatch → miss. A
//      token that is absent is intended ONLY when a replace/remove supersedes
//      fragment names it (the image was meant to go); any other absence is a
//      preservation miss — restoreInlineAssets cannot put back an asset whose
//      location is gone, so "restoring" would silently ship the dropped image.
//   7. Only when 3–6 found nothing: verify() — structural post-conditions for
//      replace/remove/constrain (zero model calls, AC-12), one Haiku call when
//      an add class is present (AC-13). Anything but `pass` is a miss (FR-10).
//
// ── Retry once, hard-capped (FR-11 / AC-15) ──────────────────────────────────
// A miss on attempt 1 re-runs the refine with the reasons made explicit (the
// route fences them) on the SAME model (AC-20b); a miss on attempt 2 ends the
// refine as not applied. The loop runs at most MAX_REFINE_ATTEMPTS times and
// verifies at most once per attempt, so there are at most 2 refine calls and 2
// verifier calls for ANY input. Verification is never spent on an attempt that
// already missed in 3–6.
//
// ── What comes back ──────────────────────────────────────────────────────────
// accepted    → `html` (assets restored) is exactly the document that was
//               verified; the route renders + commits it (Ruling D).
// not-applied → nothing is committed (FR-12). `html` is the LAST attempt's
//               restored document when it is usable (else null, with the
//               model-facing reply in `unusableHtml`), plus the typed
//               diagnostics the route stores on the rejected row (FR-13).
// conflict    → API-mode brand conflict, handled by the route as before.
// A throw from runRefine (model crash, timeout) propagates — that is the
// crashed-run channel (pendingActionError), not a not-applied outcome.

import {
  INSTRUCTION_CLASSES,
  type ConstrainTarget,
  type InstructionClass,
} from '@/lib/agent/instructionClasses'
import { effectiveClasses, parseRefineEnvelope } from '@/lib/agent/refineEnvelope'
import { reconcileInlineAssets, restoreInlineAssets } from '@/lib/agent/inlineAssets'
import { isAccepted, type VerifyResult } from '@/lib/drafts/refineVerify'
import type { RefineAttemptDiagnostics, RejectionDiagnostics } from '@/lib/drafts/revisions'
import type { DraftActionCompletion } from '@/lib/drafts/draftActions'

export const MAX_REFINE_ATTEMPTS = 2

export type RefineAttemptNumber = 1 | 2

export interface RefineRunRequest {
  attempt: RefineAttemptNumber
  // The model the route received — the same on the retry (FR-14b / AC-20b).
  model: string
  // Attempt 2 only: why attempt 1 was not accepted (the route renders them,
  // fenced, into the retry note — prompts/refine.ts buildRefineRetryNote).
  retryReasons?: string[]
}

export interface RefineVerifyRequest {
  attempt: RefineAttemptNumber
  classes: InstructionClass[] // effective classes
  supersedes: string[]
  constrains: ConstrainTarget[]
  afterHtml: string // model-facing (tokens intact) — the document that will be committed
}

export interface RefineVerifyOutcome {
  result: VerifyResult
  // Verifier MODEL calls this verification spent (0 or 1).
  modelCalls: number
}

export interface RefineAttemptDeps<C> {
  runRefine(req: RefineRunRequest): Promise<string>
  verify(req: RefineVerifyRequest): Promise<RefineVerifyOutcome>
  // API mode's brand-conflict marker detector; omitted in CLI mode.
  parseConflict?(raw: string): C | null
}

export interface RefineAttemptInput {
  model: string
  // token → data URI for the document the model was shown (extractInlineAssets).
  inlineAssets: Record<string, string>
}

export type RefineAttemptResult<C> =
  | { kind: 'accepted'; html: string; refineCalls: number; verifierCalls: number }
  | { kind: 'conflict'; conflict: C; refineCalls: number; verifierCalls: number }
  | {
      kind: 'not-applied'
      reason: string
      html: string | null
      unusableHtml: string | null
      diagnostics: Omit<RejectionDiagnostics, 'export'>
    }

// Caps on what enters the diagnostics / retry prompt.
const MAX_REASON_CHARS = 300
const MAX_FRAGMENT_CHARS = 200
const MAX_LIST = 20

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const clipList = (xs: string[], n = MAX_FRAGMENT_CHARS) => xs.slice(0, MAX_LIST).map((x) => clip(x, n))

const TOKEN_PREFIX_RE = /__INLINE_ASSET_/g
const COMPLETE_DOCUMENT_RE = /<\/html\s*>\s*$/i

type Reconcile = RefineAttemptDiagnostics['reconcile']

// Ruling C on the envelope's html. `covering` is the supersedes list when a
// (non-downgraded) replace/remove is present, else [] — only a destructive
// class may drop a token.
export function reconcileTokens(sentTokens: string[], html: string, covering: string[]): Reconcile {
  const r = reconcileInlineAssets(sentTokens, html)
  if (r.kind === 'mismatch') return { kind: 'mismatch', missing: [], reason: clip(r.reason, MAX_REASON_CHARS) }

  // Every "__INLINE_ASSET_" must belong to a well-formed sent token; one that
  // doesn't (cut off, or mangled so TOKEN_RE never matched it) is a mismatch.
  const prefixes = html.match(TOKEN_PREFIX_RE)?.length ?? 0
  const wellFormed = sentTokens.reduce((n, t) => n + html.split(t).length - 1, 0)
  if (prefixes > wellFormed) {
    return {
      kind: 'mismatch',
      missing: [],
      reason: 'the reply contains a truncated or malformed __INLINE_ASSET_ placeholder — every placeholder must be kept exactly as written',
    }
  }

  if (r.kind === 'clean') return { kind: 'clean', missing: [] }
  const uncovered = r.missing.filter((t) => !covering.some((f) => f.includes(t)))
  if (uncovered.length === 0) return { kind: 'intended-removal', missing: r.missing }
  return {
    kind: 'preservation-miss',
    missing: r.missing,
    reason: clip(
      `the reply dropped image placeholder(s) ${uncovered.join(', ')} that no replace or remove names in supersedes — keep every __INLINE_ASSET_n__ token exactly unless its image is deliberately replaced or removed (then list that token in supersedes)`,
      MAX_REASON_CHARS,
    ),
  }
}

interface Assessed {
  diag: RefineAttemptDiagnostics
  // The model-facing document, when there was one.
  modelHtml: string | null
  // The envelope's fragments, unclipped (the diagnostics carry clipped copies).
  supersedes: string[]
  constrains: ConstrainTarget[]
  // True when the document can be rendered (complete, tokens reconcilable).
  usable: boolean
  // Checked and ready to verify (no pre-verification miss).
  verifiable: boolean
}

function skippedReconcile(): Reconcile {
  return { kind: 'skipped', missing: [] }
}

// Steps 3–6: everything decidable without a render or a model call.
function assess(attempt: RefineAttemptNumber, raw: string, inlineAssets: Record<string, string>): Assessed {
  const env = parseRefineEnvelope(raw)
  if (!env) {
    return {
      diag: {
        attempt,
        document: 'none',
        classes: [],
        classificationDefaulted: true,
        effectiveClasses: [],
        downgraded: [],
        supersedes: [],
        constrains: [],
        reconcile: skippedReconcile(),
        verdict: 'skipped',
        reasons: ['the reply contained no HTML document — reply with the JSON header and then the complete HTML document'],
        verifierCalls: 0,
      },
      modelHtml: null,
      supersedes: [],
      constrains: [],
      usable: false,
      verifiable: false,
    }
  }

  // A narrating model is worth seeing (htmlDocument.ts); the narration itself
  // is never rendered.
  if (env.discarded) {
    console.warn(`[refine] attempt ${attempt}: discarded ${env.discarded.length} chars around the envelope: ${JSON.stringify(env.discarded.slice(0, 300))}`)
  }
  const eff = effectiveClasses(env)
  const fragments = { supersedes: env.supersedes, constrains: env.constrains }
  const base = {
    attempt,
    classes: env.classes,
    classificationDefaulted: env.classificationDefaulted,
    effectiveClasses: eff.classes,
    downgraded: eff.downgraded,
    supersedes: clipList(env.supersedes),
    constrains: env.constrains.slice(0, MAX_LIST).map((t) => ({ ...t, fragment: clip(t.fragment, MAX_FRAGMENT_CHARS) })),
    verifierCalls: 0,
  }

  if (!COMPLETE_DOCUMENT_RE.test(env.html)) {
    return {
      diag: {
        ...base,
        document: 'truncated',
        reconcile: skippedReconcile(),
        verdict: 'skipped',
        reasons: ['the reply document was cut off before </html> — the reply must contain the complete document'],
      },
      modelHtml: env.html,
      ...fragments,
      usable: false,
      verifiable: false,
    }
  }

  const reasons: string[] = []
  for (const c of eff.downgraded.filter((d) => INSTRUCTION_CLASSES[d].destructive)) {
    reasons.push(
      `${c}: supersedes was empty, so nothing may be ${c === 'replace' ? 'replaced' : 'removed'} — list what the instruction ${c === 'replace' ? 'replaces' : 'removes'} in supersedes, copied verbatim from the current design`,
    )
  }
  const destructive = eff.classes.some((c) => INSTRUCTION_CLASSES[c].destructive)
  const reconcile = reconcileTokens(Object.keys(inlineAssets), env.html, destructive ? env.supersedes : [])
  if (reconcile.reason) reasons.push(reconcile.reason)

  return {
    diag: { ...base, document: 'complete', reconcile, verdict: 'skipped', reasons },
    modelHtml: env.html,
    ...fragments,
    usable: reconcile.kind !== 'mismatch',
    verifiable: reasons.length === 0,
  }
}

function missReasons(result: VerifyResult): string[] {
  // Never empty for a miss: the retry must always be told why.
  if (result.kind === 'miss') {
    return result.reasons.length > 0 ? clipList(result.reasons, MAX_REASON_CHARS) : ['the check found the instruction not applied']
  }
  if (result.kind === 'unavailable') return [clip(`verification unavailable (treated as a miss): ${result.reason}`, MAX_REASON_CHARS)]
  return []
}

export function notAppliedReason(reasons: string[]): string {
  return `The edit could not be applied — it failed the check on both attempts, so the design was left unchanged. Last check: ${reasons.join('; ') || 'no reason recorded'}`
}

export async function runRefineAttempts<C>(
  input: RefineAttemptInput,
  deps: RefineAttemptDeps<C>,
): Promise<RefineAttemptResult<C>> {
  const attempts: RefineAttemptDiagnostics[] = []
  let refineCalls = 0
  let verifierCalls = 0
  let last: Assessed | null = null

  for (let n = 1; n <= MAX_REFINE_ATTEMPTS; n++) {
    const attempt = n as RefineAttemptNumber
    const retryReasons = attempts.at(-1)?.reasons
    refineCalls++
    const raw = await deps.runRefine({ attempt, model: input.model, ...(retryReasons ? { retryReasons } : {}) })

    const conflict = deps.parseConflict?.(raw) ?? null
    if (conflict) return { kind: 'conflict', conflict, refineCalls, verifierCalls }

    const a = assess(attempt, raw, input.inlineAssets)
    if (a.verifiable) {
      let outcome: RefineVerifyOutcome
      try {
        outcome = await deps.verify({
          attempt,
          classes: a.diag.effectiveClasses,
          supersedes: a.supersedes,
          constrains: a.constrains,
          afterHtml: a.modelHtml!,
        })
      } catch (err) {
        // verifyRefine never rejects; an injected verify that does fails closed (FR-10).
        outcome = { result: { kind: 'unavailable', reason: err instanceof Error ? err.message : String(err) }, modelCalls: 0 }
      }
      // The TRUE count, never clamped: if verify ever spent more than one call,
      // the diagnostics must say so and the schema (max 1 per attempt, 2 in
      // total — AC-15) rejects the record rather than under-reporting it.
      verifierCalls += outcome.modelCalls
      a.diag.verifierCalls = outcome.modelCalls
      a.diag.verdict = outcome.result.kind
      a.diag.reasons = missReasons(outcome.result)
      if (isAccepted(outcome.result)) {
        return { kind: 'accepted', html: restoreInlineAssets(a.modelHtml!, input.inlineAssets), refineCalls, verifierCalls }
      }
    }
    attempts.push(a.diag)
    last = a
  }

  const finalReasons = attempts.at(-1)!.reasons
  return {
    kind: 'not-applied',
    reason: notAppliedReason(finalReasons),
    html: last!.usable ? restoreInlineAssets(last!.modelHtml!, input.inlineAssets) : null,
    unusableHtml: last!.usable ? null : last!.modelHtml,
    diagnostics: { version: 1, refineCalls, verifierCalls, attempts, reasons: finalReasons },
  }
}

// ── Settling the outcome ─────────────────────────────────────────────────────
// The one place an outcome turns into a write, so "not applied → nothing is
// committed" (FR-12 / AC-16) is a property of this switch, not of the route's
// discipline. Returns the draft-action completion: 'not-applied' tells
// startDraftAction to release the claim WITHOUT clearing the outcome the
// reject sink just recorded (a clean completion, no pendingActionError).
export interface RefineSinks<C> {
  commit(html: string): Promise<void>
  reject(result: Extract<RefineAttemptResult<C>, { kind: 'not-applied' }>): Promise<void>
  conflict(conflict: C): Promise<void>
}

export async function settleRefine<C>(
  result: RefineAttemptResult<C>,
  sinks: RefineSinks<C>,
): Promise<DraftActionCompletion | void> {
  switch (result.kind) {
    case 'accepted':
      await sinks.commit(result.html)
      return
    case 'conflict':
      await sinks.conflict(result.conflict)
      return
    case 'not-applied':
      await sinks.reject(result)
      return 'not-applied'
  }
}
