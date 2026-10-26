// 031 FR-01: the CLI spawn's temp cwd is removed when the process exits, by
// the exact path mkdtemp created, and a re-created dir replaces the old one.

import { describe, it, expect, vi, afterAll } from 'vitest'

const h = vi.hoisted(() => ({ rmCalls: [] as string[], exitHandlers: [] as Array<() => void>, cwds: [] as string[] }))

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn((_cmd: string, _args: string[], opts: { cwd?: string }) => {
      h.cwds.push(opts.cwd ?? '')
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
        pid: 4242,
        kill: vi.fn(),
      })
      setImmediate(() => {
        child.stdout.emit('data', Buffer.from(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'ok' }) + '\n'))
        child.emit('close', 0)
      })
      return child
    }),
  }
})
vi.mock('node:fs', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:fs')>()
  return {
    ...mod,
    rmSync: vi.fn((p: string, o?: Parameters<typeof mod.rmSync>[1]) => {
      h.rmCalls.push(String(p))
      return mod.rmSync(p, o)
    }),
  }
})

process.env.CLAUDE_CLI_DEBUG = '0'
delete process.env.CLAUDE_CLI_MODEL
delete process.env.CLAUDE_CLI_PATH

const onceSpy = vi.spyOn(process, 'once').mockImplementation(((ev: string, fn: () => void) => {
  if (ev === 'exit') h.exitHandlers.push(fn)
  return process
}) as never)

const { runClaudeCli, cleanupSpawnCwd } = await import('@/lib/agent/claudeCli')
const { runWithClaudeAuth } = await import('@/lib/agent/claudeAuth')
const { decideModel } = await import('@/lib/models/resolve')
const fs = await import('node:fs')

const r = decideModel('CAPTION', {
  policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
  credential: 'team',
  mode: 'cli',
})
if (!r.ok) throw new Error(r.message)
const model = r.resolved
const auth = { token: 'sk-ant-oat01-FAKE', userId: 'u', teamId: 't', onAuthFailure: async () => {} }
const run = () => runWithClaudeAuth(auth, () => runClaudeCli('p', { model }))

afterAll(() => {
  onceSpy.mockRestore()
  for (const d of h.cwds) fs.rmSync(d, { recursive: true, force: true })
})

describe('claudeCli temp dir cleanup', () => {
  it('registers one exit hook and removes exactly the created path', async () => {
    await run()
    await run()
    expect(h.exitHandlers).toHaveLength(1)
    const created = h.cwds[0]
    expect(created).toMatch(/bistec-cli-/)
    h.rmCalls.length = 0
    cleanupSpawnCwd()
    expect(h.rmCalls).toEqual([created])
    expect(fs.existsSync(created)).toBe(false)
  })

  it('a re-created dir replaces the old one, and the new one is removed', async () => {
    await run()
    const first = h.cwds[h.cwds.length - 1]
    fs.rmSync(first, { recursive: true, force: true })
    await run()
    const second = h.cwds[h.cwds.length - 1]
    expect(second).not.toBe(first)
    h.rmCalls.length = 0
    cleanupSpawnCwd()
    expect(h.rmCalls).toEqual([second])
    expect(h.exitHandlers).toHaveLength(1)
  })

  it('does nothing and never throws when there is no dir', () => {
    h.rmCalls.length = 0
    expect(() => cleanupSpawnCwd()).not.toThrow()
    expect(h.rmCalls).toEqual([])
  })
})
