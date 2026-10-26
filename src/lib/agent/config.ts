// Central pipeline configuration: CLI-mode detection and the design-path
// helper. Model choice is not here: every model call resolves a catalogue
// entry through src/lib/models (008 FR-03), the only place a model is named.

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

// The design path a brief runs on, derived from its designMode.
export function pathForDesignMode(designMode: string): DesignPath {
  return designMode === 'TEMPLATE' ? 'A' : 'B'
}
