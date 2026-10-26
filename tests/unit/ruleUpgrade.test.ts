// 031 T10 (FR-28): the shared runner. The kit host's behaviour is pinned by
// kitUpgradeRoute.test.ts; this file pins the parameters that make it shared.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ resolve: vi.fn(), run: vi.fn() }))
vi.mock('@/lib/agent/config', () => ({ pipelineMode: () => 'cli' }))
vi.mock('@/lib/campaign/briefingAssistant', () => ({
  resolveAssistantModel: h.resolve,
  runBriefingModel: h.run,
}))

const MODEL = { surface: 'X', key: 'SONNET', arg: 'sonnet', source: 'system', substitutedFrom: null }
const TEXT = 'Give the logo generous clear space around it.'
const reply = '```kitedits\n[]\n```'

let logs: string[]
beforeEach(() => {
  h.resolve.mockReset().mockResolvedValue(MODEL)
  h.run.mockReset().mockResolvedValue(reply)
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void logs.push(a.join(' ')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

async function load(mock = false) {
  vi.resetModules()
  vi.stubEnv('MOCK_AI', mock ? 'true' : 'false')
  return import('@/lib/kitUpgrade/upgrade')
}
const base = {
  roleKit: { colors: ['#112233'], fonts: [{ name: 'Poppins' }] },
  text: TEXT,
  teamId: 't1',
  userId: 'u1',
}

describe('runRuleUpgrade', () => {
  it.each([
    ['ASSISTANT_BRANDKIT', 'kit-upgrade'],
    ['ASSISTANT_BRIEFING', 'briefing-upgrade'],
  ] as const)('resolves the %s model and labels the call %s', async (surface, label) => {
    const { runRuleUpgrade } = await load()
    const r = await runRuleUpgrade({ ...base, surface, label })
    expect(r.status).toBe('none')
    expect(h.resolve).toHaveBeenCalledWith(surface, 't1', 'u1')
    expect(h.run.mock.calls[0][4]).toMatchObject({ label })
  })

  it('names the host in the log line only through logRef', async () => {
    const { runRuleUpgrade } = await load()
    await runRuleUpgrade({
      ...base,
      surface: 'ASSISTANT_BRIEFING',
      label: 'briefing-upgrade',
      logRef: { name: 'campaign', id: 'c9' },
    })
    expect(logs[0]).toMatch(/^\[briefing-upgrade\] team=t1 campaign=c9 candidates=1 /)
    await runRuleUpgrade({ ...base, surface: 'ASSISTANT_BRIEFING', label: 'briefing-upgrade' })
    expect(logs[1]).toMatch(/^\[briefing-upgrade\] team=t1 candidates=1 /)
  })

  it('returns none / no-candidates without a model call', async () => {
    const { runRuleUpgrade } = await load()
    const r = await runRuleUpgrade({
      ...base,
      text: 'Use the colours at 45% width.',
      surface: 'ASSISTANT_BRANDKIT',
      label: 'kit-upgrade',
    })
    expect(r).toMatchObject({ status: 'none', reason: 'no-candidates' })
    expect(h.resolve).not.toHaveBeenCalled()
  })

  it('under MOCK_AI the recorded label is the one passed', async () => {
    const { runRuleUpgrade } = await load(true)
    const rec = await import('@/lib/models/modelCalls')
    const seen: Array<{ label: string | null }> = []
    rec.setModelCallSink({ record: (x) => seen.push(x), read: () => [], clear: () => {} })
    await runRuleUpgrade({ ...base, surface: 'ASSISTANT_BRIEFING', label: 'briefing-upgrade' })
    expect(seen.map((s) => s.label)).toEqual(['briefing-upgrade'])
    expect(h.run).not.toHaveBeenCalled()
  })
})
