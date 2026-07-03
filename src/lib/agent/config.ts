// Central pipeline configuration: CLI-mode detection and the per-path model
// policy. Every route/runner derives model choice from here — a model upgrade
// is a one-line edit instead of a synchronized sweep across call sites.

import { env } from '@/lib/env'

export type DesignPath = 'A' | 'B'
export type PipelineMode = 'api' | 'cli'

// CLI mode routes design generation through the local Claude Code CLI
// (`claude -p`, no API key) instead of the Anthropic SDK tool-use loop.
export function isCliMode(): boolean {
  return env.DESIGN_PROVIDER === 'cli'
}

export function pipelineMode(): PipelineMode {
  return isCliMode() ? 'cli' : 'api'
}

// Path A (template fill) is a constrained task → Haiku.
// Path B (freeform) needs stronger layout reasoning → Sonnet.
// The CLI accepts short aliases; the API needs full model IDs.
const API_MODELS: Record<DesignPath, string> = {
  A: 'claude-haiku-4-5-20251001',
  B: 'claude-sonnet-4-6',
}
const CLI_MODELS: Record<DesignPath, string> = {
  A: 'haiku',
  B: 'sonnet',
}

// Note: in CLI mode the CLAUDE_CLI_MODEL env var (read in claudeCli.ts) still
// acts as a global override on top of this per-path policy.
export function modelFor(path: DesignPath, mode: PipelineMode = pipelineMode()): string {
  return mode === 'cli' ? CLI_MODELS[path] : API_MODELS[path]
}

// Background-image decision step (small constrained JSON task) → Haiku in both
// modes, mirroring the Path A rationale.
const BACKGROUND_MODELS: Record<PipelineMode, string> = {
  api: 'claude-haiku-4-5-20251001',
  cli: 'haiku',
}
export function modelForBackground(mode: PipelineMode = pipelineMode()): string {
  return BACKGROUND_MODELS[mode]
}

// The design path a brief runs on, derived from its designMode.
export function pathForDesignMode(designMode: string): DesignPath {
  return designMode === 'TEMPLATE' ? 'A' : 'B'
}
