// The caption credential route (024 FR-02): which credential a team's captions
// run on, and which COPY row serves them. One pure decision that every reader
// calls through the loader (src/providers/captionRoute.ts): resolveCopyProvider,
// copyProviderIsClaude, GET /api/team/caption-route, the brief wizard, POST
// /api/briefs and the Opus gate's credential tier.
//
// Pure and client-safe: no prisma, no next, no env, no clock. The setting, the
// team's enabled COPY rows, the server mode and the brief's key are inputs.
//
// A team that has never chosen (setting null) gets today's resolution, a
// transcription of the old resolveCopyProvider / copyProviderIsClaude. A team
// that has chosen gets a shorter path that consults nothing else, so a chosen
// route can only run or fail closed (NFR-02).

/** Only CAPTION is live; 008's surface enum keys it so later surfaces extend it. */
export type RouteSurface = 'CAPTION'
/** Team.captionRoute; null = never chosen. */
export type RouteSetting = 'CLI' | 'API_KEY'
/** The route that runs, and the stamp written beside a caption. */
export type CaptionRoute = 'CLI' | 'API_KEY' | 'SERVER_KEY' | 'OTHER'

export interface CopyRow {
  id: string
  providerKey: string
  providerName: string
  isDefault: boolean
  createdAt: Date
}

export interface RouteInput {
  setting: RouteSetting | null
  mode: 'cli' | 'api'
  /** The team's ENABLED COPY rows. */
  rows: CopyRow[]
  briefKey?: string
  serverAnthropicKey: boolean
}

export type RouteDecision =
  | { ok: true; route: CaptionRoute; chosen: boolean; row: CopyRow | null; isClaude: boolean }
  | {
      ok: false
      route: RouteSetting | null
      chosen: boolean
      code: 'ROUTE_NOT_READY' | 'NO_PROVIDER'
      message: string
    }

export type NotReadyDecision = Extract<RouteDecision, { ok: false }>

export const API_KEY_NOT_READY_MESSAGE =
  'Captions are set to the API key route, but this team has no enabled Anthropic key for captions. Add one under Team settings > AI providers, or choose another route.'
export const CLI_NOT_READY_MESSAGE =
  'Captions are set to the CLI route, but this server is not in CLI mode. Choose the API key route under Team settings, or ask the person who runs the server to switch it to CLI mode.'
export const NO_PROVIDER_MESSAGE =
  'No caption provider is set up for this team. Ask a team admin to add one under Team settings > AI providers, or connect a Claude token.'

/** A chosen route that cannot run: thrown by resolveCopyProvider, never swallowed. */
export class RouteNotReadyError extends Error {
  constructor(public decision: NotReadyDecision) {
    super(decision.message)
    this.name = 'RouteNotReadyError'
  }
}

// Which model family each COPY provider name runs — keep in step with
// instantiateCopyProvider. A name outside it can't run at all (that switch
// throws "Unsupported provider"); the E2E registers placeholder names under
// MOCK_AI, so an unknown name is not treated as "not Claude".
export const COPY_PROVIDER_FAMILY: Readonly<Record<string, 'claude' | 'other'>> = {
  cli: 'claude',
  anthropic: 'claude',
  openai: 'other',
}

// The same tie-break resolveImageProvider uses: the default row, else the oldest.
function oldestFirst(a: CopyRow, b: CopyRow): number {
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function legacyRoute(providerName: string): CaptionRoute {
  switch (providerName.toLowerCase()) {
    case 'cli':
      return 'CLI'
    case 'anthropic':
      return 'API_KEY'
    default:
      return 'OTHER'
  }
}

export function selectRoute(_surface: RouteSurface, input: RouteInput): RouteDecision {
  const { setting, mode, rows, briefKey } = input

  if (setting === 'API_KEY') {
    const candidates = rows.filter((r) => r.providerName.toLowerCase() === 'anthropic')
    const row = candidates.find((r) => r.isDefault) ?? [...candidates].sort(oldestFirst)[0]
    if (row) return { ok: true, route: 'API_KEY', chosen: true, row, isClaude: true }
    return {
      ok: false,
      route: 'API_KEY',
      chosen: true,
      code: 'ROUTE_NOT_READY',
      message: API_KEY_NOT_READY_MESSAGE,
    }
  }

  if (setting === 'CLI') {
    // withClaudeAuth is a pass-through outside CLI mode, so a spawn there has
    // no credential in scope.
    if (mode === 'cli') return { ok: true, route: 'CLI', chosen: true, row: null, isClaude: true }
    return {
      ok: false,
      route: 'CLI',
      chosen: true,
      code: 'ROUTE_NOT_READY',
      message: CLI_NOT_READY_MESSAGE,
    }
  }

  // Never chosen: today's resolution.
  const row =
    (briefKey ? rows.find((r) => r.providerKey === briefKey) : undefined) ??
    rows.find((r) => r.isDefault)
  if (row) {
    return {
      ok: true,
      route: legacyRoute(row.providerName),
      chosen: false,
      row,
      isClaude: COPY_PROVIDER_FAMILY[row.providerName.toLowerCase()] !== 'other',
    }
  }
  if (mode === 'cli') return { ok: true, route: 'CLI', chosen: false, row: null, isClaude: true }
  if (input.serverAnthropicKey) {
    return { ok: true, route: 'SERVER_KEY', chosen: false, row: null, isClaude: true }
  }
  return {
    ok: false,
    route: null,
    chosen: false,
    code: 'NO_PROVIDER',
    message: NO_PROVIDER_MESSAGE,
  }
}
