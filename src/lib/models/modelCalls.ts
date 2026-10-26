// The model-call recorder (008 FR-07, FR-16, design §6): every call that
// crosses a model boundary with a ResolvedModel — the CLI spawn
// (agent/claudeCli.ts) and the SDK wrapper (models/anthropicCall.ts) — records
// what it is about to run, BEFORE the spawn or the request. It is the seam the
// boundary ACs assert on (AC-12), and the E2E reads it through
// GET /api/test/model-calls.
//
// The sink is pluggable:
//   - production: a no-op, so nothing is kept and nothing grows;
//   - MOCK_AI: a ring buffer of the last 200 records on globalThis, the same
//     pattern as the Prisma client (src/lib/prisma.ts), because `next dev`
//     compiles route modules separately and each would otherwise hold its own;
//   - unit tests: their own sink, via setModelCallSink.
//
// MOCK_AI is read from process.env directly (the same definition as
// src/lib/testHooks.ts), not imported: testHooks' mock branches will record
// through this module (T6), and the import would then be a cycle.

import type { ModelKey, Surface } from './catalogue'
import type { ModelSource, PipelineMode, ResolvedModel } from './resolve'
import type { CaptionRoute } from './route'

export interface ModelCallRecord {
  /** Epoch ms when the call was recorded. */
  at: number
  surface: Surface
  key: ModelKey
  /** The exact string that crossed the boundary (apiId or cliArg). */
  arg: string
  mode: PipelineMode
  source: ModelSource
  substitutedFrom: string | null
  label: string | null
  /** 024 FR-07: the caption credential route; null for every call that is not a caption. */
  route: CaptionRoute | null
}

export interface ModelCallSink {
  record(rec: ModelCallRecord): void
  read(): ModelCallRecord[]
  clear(): void
}

export const MODEL_CALL_RING_SIZE = 200

declare global {
  var __bistecModelCalls: ModelCallRecord[] | undefined
}

const noopSink: ModelCallSink = {
  record() {},
  read: () => [],
  clear() {},
}

const ringSink: ModelCallSink = {
  record(rec) {
    const ring = (globalThis.__bistecModelCalls ??= [])
    ring.push(rec)
    if (ring.length > MODEL_CALL_RING_SIZE) ring.splice(0, ring.length - MODEL_CALL_RING_SIZE)
  },
  read: () => [...(globalThis.__bistecModelCalls ?? [])],
  clear() {
    globalThis.__bistecModelCalls = []
  },
}

function defaultSink(): ModelCallSink {
  return process.env.MOCK_AI === 'true' ? ringSink : noopSink
}

let installed: ModelCallSink | null = null
const sink = (): ModelCallSink => installed ?? defaultSink()

/** Install a sink (unit tests); `null` restores the default. */
export function setModelCallSink(next: ModelCallSink | null): void {
  installed = next
}

export function recordModelCall(rec: Omit<ModelCallRecord, 'at'>): void {
  sink().record({ at: Date.now(), ...rec })
}

/** The recorded calls, oldest first (newest last). */
export function readModelCalls(): ModelCallRecord[] {
  return sink().read()
}

export function clearModelCalls(): void {
  sink().clear()
}

/** The record a boundary writes for a ResolvedModel about to run in `mode`. */
export function modelCallFor(
  model: ResolvedModel,
  mode: PipelineMode,
  label?: string,
  route?: CaptionRoute | null,
): Omit<ModelCallRecord, 'at'> {
  return {
    surface: model.surface,
    key: model.key,
    arg: model.arg,
    mode,
    source: model.source,
    substitutedFrom: model.substitutedFrom,
    label: label || null,
    route: route ?? null,
  }
}
