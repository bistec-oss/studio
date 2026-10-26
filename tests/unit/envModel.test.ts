import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCliModelEnv } from '@/lib/env'

// For the boot-line cases at the end: policy.ts's I/O, mocked (no team row, no
// token). env.ts stays real.
const boot = vi.hoisted(() => ({ mode: vi.fn((): 'api' | 'cli' => 'cli') }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teamModelPolicy: { findUnique: async () => null },
    userClaudeToken: { findFirst: async () => null },
    team: { findUnique: async () => null },
  },
}))
vi.mock('@/lib/agent/config', () => ({
  pipelineMode: boot.mode,
  isCliMode: () => boot.mode() === 'cli',
}))

// 008 FR-04 / AC-04: the parse half, and (at the end) the once-per-process boot line.
// CLAUDE_CLI_MODEL accepts a catalogue key in any case or a current apiId, and
// is now the system default — not a global override. Anything else fails the
// load with one message naming every accepted value.

const message = (got: string) =>
  `CLAUDE_CLI_MODEL must be one of haiku, sonnet, opus, claude-haiku-4-5, claude-sonnet-5-5, claude-opus-5-5 (got "${got}"). It is now the system default, not a global override.`

describe('parseCliModelEnv', () => {
  it.each([
    ['sonnet', 'SONNET'],
    ['OPUS', 'OPUS'],
    ['Haiku', 'HAIKU'],
    ['claude-haiku-4-5', 'HAIKU'],
    ['claude-sonnet-5-5', 'SONNET'],
    ['CLAUDE-OPUS-5-5', 'OPUS'],
    ['  sonnet  ', 'SONNET'],
  ])('%j parses to %s', (raw, key) => {
    expect(parseCliModelEnv(raw)).toBe(key)
  })

  it.each([undefined, '', '   '])('%j (unset or blank) is undefined', (raw) => {
    expect(parseCliModelEnv(raw)).toBeUndefined()
  })

  it.each([
    'default', // used to omit --model and run the account default
    'claude-sonnet-4-6', // a retired ID (previousApiIds) is not accepted
    'claude-haiku-4-5-20251001',
    'gpt-4o',
    'sonnet; rm -rf /',
    'fable',
  ])('%j throws with the FR-04 message', (raw) => {
    expect(() => parseCliModelEnv(raw)).toThrow(new Error(message(raw)))
  })
})

describe('env.ts load', () => {
  const saved = { model: process.env.CLAUDE_CLI_MODEL, phase: process.env.NEXT_PHASE }

  afterEach(() => {
    for (const [name, value] of [
      ['CLAUDE_CLI_MODEL', saved.model],
      ['NEXT_PHASE', saved.phase],
    ] as const) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    vi.resetModules()
  })

  it('exposes a valid value as its ModelKey', async () => {
    process.env.CLAUDE_CLI_MODEL = 'claude-opus-5-5'
    vi.resetModules()
    const { env } = await import('@/lib/env')
    expect(env.CLAUDE_CLI_MODEL).toBe('OPUS')
  })

  it('an invalid value fails the load, outside `next build`', async () => {
    process.env.CLAUDE_CLI_MODEL = 'default'
    delete process.env.NEXT_PHASE
    vi.resetModules()
    await expect(import('@/lib/env')).rejects.toThrow(message('default'))
  })

  it('`next build` does not fail on it (the value reads as unset)', async () => {
    process.env.CLAUDE_CLI_MODEL = 'default'
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.resetModules()
    const { env } = await import('@/lib/env')
    expect(env.CLAUDE_CLI_MODEL).toBeUndefined()
  })
})

// AC-04, the boot-line half (FR-04): said once per process, at the first
// resolveModel call, with different text in API mode. policy.ts reads the real
// env.ts; Prisma and the pipeline mode are mocked.
describe('the CLAUDE_CLI_MODEL boot line', () => {
  const saved = process.env.CLAUDE_CLI_MODEL
  let info: ReturnType<typeof vi.spyOn>
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    boot.mode.mockReset().mockReturnValue('cli')
    info = vi.spyOn(console, 'info').mockImplementation(() => {})
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    if (saved === undefined) delete process.env.CLAUDE_CLI_MODEL
    else process.env.CLAUDE_CLI_MODEL = saved
    info.mockRestore()
    warn.mockRestore()
    vi.resetModules()
  })

  // A fresh process: a fresh env.ts parse and a fresh once-flag.
  async function freshPolicy(value: string | undefined) {
    if (value === undefined) delete process.env.CLAUDE_CLI_MODEL
    else process.env.CLAUDE_CLI_MODEL = value
    vi.resetModules()
    return import('@/lib/models/policy')
  }
  const lines = (spy: ReturnType<typeof vi.spyOn>) =>
    spy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .filter((l: string) => l.includes('CLAUDE_CLI_MODEL'))

  it('CLI mode: logged once across two resolveModel calls', async () => {
    const { resolveModel } = await freshPolicy('opus')
    await resolveModel('DESIGN_FREEFORM', { userId: null, teamId: 't1' })
    await resolveModel('CAPTION', { userId: null, teamId: 't1' })
    expect(lines(info)).toEqual([
      '[models] CLAUDE_CLI_MODEL=OPUS is the system default (below team defaults and explicit picks); it no longer overrides them',
    ])
    expect(lines(warn)).toEqual([])
  })

  it('API mode: a different line, at warn, also once', async () => {
    boot.mode.mockReturnValue('api')
    const { resolveModel } = await freshPolicy('sonnet')
    await resolveModel('DESIGN_FREEFORM', { userId: 'u1', teamId: 't1' })
    await resolveModel('CAPTION', { userId: 'u1', teamId: 't1' })
    expect(lines(warn)).toEqual(['[models] CLAUDE_CLI_MODEL is set but ignored in API mode'])
    expect(lines(info)).toEqual([])
  })

  it('unset: no boot line', async () => {
    const { resolveModel } = await freshPolicy(undefined)
    await resolveModel('CAPTION', { userId: null, teamId: 't1' })
    expect([...lines(info), ...lines(warn)]).toEqual([])
  })
})
