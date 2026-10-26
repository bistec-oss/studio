// 024 FR-02 / AC-02 / AC-03: the pure selector. The legacy table (setting null)
// is today's resolveCopyProvider / copyProviderIsClaude, transcribed; a chosen
// setting takes the shorter path that consults nothing else.

import { describe, it, expect } from 'vitest'
import {
  API_KEY_NOT_READY_MESSAGE,
  CLI_NOT_READY_MESSAGE,
  NO_PROVIDER_MESSAGE,
  selectRoute,
  type CopyRow,
  type RouteInput,
  type RouteSetting,
} from '@/lib/models/route'

let seq = 0
const row = (over: Partial<CopyRow> = {}): CopyRow => {
  seq += 1
  return {
    id: `r${seq}`,
    providerKey: `k${seq}`,
    providerName: 'anthropic',
    isDefault: false,
    createdAt: new Date(1000 * seq),
    ...over,
  }
}
const input = (over: Partial<RouteInput> = {}): RouteInput => ({
  setting: null,
  mode: 'api',
  rows: [],
  serverAnthropicKey: false,
  ...over,
})
const select = (over: Partial<RouteInput> = {}) => selectRoute('CAPTION', input(over))

describe("legacy (never chosen) — AC-02: today's outcomes", () => {
  it('an explicit enabled brief key beats the default row, whatever the provider', () => {
    const def = row({ isDefault: true, providerName: 'anthropic' })
    const picked = row({ providerKey: 'mine', providerName: 'openai' })
    const d = select({ rows: [def, picked], briefKey: 'mine' })
    expect(d).toMatchObject({ ok: true, route: 'OTHER', chosen: false, isClaude: false })
    expect(d.ok && d.row?.id).toBe(picked.id)
  })

  it('a disabled or foreign key (absent from the enabled rows) falls to the default row', () => {
    const def = row({ isDefault: true })
    const d = select({ rows: [def], briefKey: 'not-in-the-team' })
    expect(d.ok && d.row?.id).toBe(def.id)
  })

  it.each([
    ['anthropic', 'API_KEY', true],
    ['Anthropic', 'API_KEY', true],
    ['cli', 'CLI', true],
    ['openai', 'OTHER', false],
    ['some-placeholder', 'OTHER', true],
  ])('a default %s row → %s, isClaude %s', (providerName, route, isClaude) => {
    expect(select({ rows: [row({ isDefault: true, providerName })] })).toMatchObject({
      ok: true,
      route,
      chosen: false,
      isClaude,
    })
  })

  it('no row: CLI mode → CLI; API mode with a server key → SERVER_KEY', () => {
    expect(select({ mode: 'cli' })).toMatchObject({ ok: true, route: 'CLI', row: null, isClaude: true })
    expect(select({ mode: 'api', serverAnthropicKey: true })).toMatchObject({
      ok: true,
      route: 'SERVER_KEY',
      row: null,
      isClaude: true,
    })
  })

  it("no row, API mode, no server key → NO_PROVIDER with today's message", () => {
    expect(select()).toEqual({
      ok: false,
      route: null,
      chosen: false,
      code: 'NO_PROVIDER',
      message: NO_PROVIDER_MESSAGE,
    })
    expect(NO_PROVIDER_MESSAGE).toMatch(/^No caption provider is set up/)
  })

  it('a brief key of "cli" with no cli row falls to the default row', () => {
    const def = row({ isDefault: true, providerName: 'anthropic' })
    const d = select({ rows: [def], briefKey: 'cli' })
    expect(d.ok && d.row?.id).toBe(def.id)
    expect(d).toMatchObject({ route: 'API_KEY' })
  })

  it('a non-default row with no brief key is not used (today: only an explicit key or the default)', () => {
    expect(select({ rows: [row()], mode: 'cli' })).toMatchObject({ route: 'CLI', row: null })
  })
})

describe('chosen — AC-03: the routes and fail-closed', () => {
  it.each(['cli', 'api'] as const)(
    'API_KEY + an anthropic row → API_KEY, in %s mode, whatever the brief key and other rows',
    (mode) => {
      const anthropic = row({ providerName: 'anthropic' })
      const others = [
        row({ providerName: 'openai', isDefault: true }),
        row({ providerName: 'cli', providerKey: 'cli' }),
      ]
      const d = select({ setting: 'API_KEY', mode, rows: [...others, anthropic], briefKey: 'cli' })
      expect(d).toMatchObject({ ok: true, route: 'API_KEY', chosen: true, isClaude: true })
      expect(d.ok && d.row?.id).toBe(anthropic.id)
    },
  )

  it('picks the default anthropic row, else the oldest; an openai default never wins', () => {
    const oldest = row({ providerName: 'anthropic', createdAt: new Date(1) })
    const newer = row({ providerName: 'anthropic', createdAt: new Date(2) })
    const def = row({ providerName: 'anthropic', isDefault: true, createdAt: new Date(3) })
    const openai = row({ providerName: 'openai', isDefault: true, createdAt: new Date(0) })
    const pick = (rows: CopyRow[]) => {
      const d = select({ setting: 'API_KEY', rows })
      return d.ok ? d.row?.id : null
    }
    expect(pick([newer, oldest, def, openai])).toBe(def.id)
    expect(pick([newer, oldest, openai])).toBe(oldest.id)
  })

  it.each([
    ['no rows', []],
    ['only an openai row', [row({ providerName: 'openai', isDefault: true })]],
    ['only a cli row', [row({ providerName: 'cli', isDefault: true })]],
  ])(
    'API_KEY with %s → ROUTE_NOT_READY naming the API key route, in both modes, even with a server key',
    (_l, rows) => {
      for (const mode of ['cli', 'api'] as const) {
        expect(select({ setting: 'API_KEY', mode, rows, serverAnthropicKey: true })).toEqual({
          ok: false,
          route: 'API_KEY',
          chosen: true,
          code: 'ROUTE_NOT_READY',
          message: API_KEY_NOT_READY_MESSAGE,
        })
      }
    },
  )

  it('CLI + CLI mode → CLI with no row consulted (an anthropic row is ignored)', () => {
    const d = select({ setting: 'CLI', mode: 'cli', rows: [row({ isDefault: true })] })
    expect(d).toEqual({ ok: true, route: 'CLI', chosen: true, row: null, isClaude: true })
  })

  it('CLI + API mode → ROUTE_NOT_READY naming the CLI route', () => {
    expect(select({ setting: 'CLI', mode: 'api' })).toEqual({
      ok: false,
      route: 'CLI',
      chosen: true,
      code: 'ROUTE_NOT_READY',
      message: CLI_NOT_READY_MESSAGE,
    })
  })

  it('the messages are route-named', () => {
    expect(API_KEY_NOT_READY_MESSAGE).toMatch(/API key route/)
    expect(CLI_NOT_READY_MESSAGE).toMatch(/CLI route/)
  })

  // The property check over the whole input space.
  it('a chosen decision is never SERVER_KEY or OTHER, and never NO_PROVIDER', () => {
    const rowSets: CopyRow[][] = [
      [],
      [row({ providerName: 'anthropic' })],
      [row({ providerName: 'anthropic', isDefault: true }), row({ providerName: 'openai' })],
      [row({ providerName: 'openai', isDefault: true })],
      [row({ providerName: 'cli', isDefault: true })],
      [row({ providerName: 'weird', isDefault: true })],
    ]
    for (const setting of ['CLI', 'API_KEY'] as RouteSetting[]) {
      for (const mode of ['cli', 'api'] as const) {
        for (const serverAnthropicKey of [true, false]) {
          for (const rows of rowSets) {
            for (const briefKey of [undefined, 'cli', 'env-default', ...rows.map((r) => r.providerKey)]) {
              const d = select({ setting, mode, rows, serverAnthropicKey, briefKey })
              expect(d.chosen).toBe(true)
              if (d.ok) expect(['CLI', 'API_KEY']).toContain(d.route)
              else expect(d.code).toBe('ROUTE_NOT_READY')
            }
          }
        }
      }
    }
  })
})
