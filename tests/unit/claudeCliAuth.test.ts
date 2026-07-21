// Per-user/team CLI auth: the ClaudeCliError classifier, the no-credential
// guard, and runClaudeCli's retry-once-on-auth-failure orchestration
// (personal → team, no tier below team), driven through a scripted fake
// `spawn` so no real `claude` process (or credit) is involved.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  // Each entry scripts one spawned process, consumed FIFO.
  scripts: [] as Array<{ exitCode: number; stdout?: string; stderr?: string }>,
  // What each spawn saw (args + child env), in call order.
  spawnCalls: [] as Array<{ cmd: string; args: string[]; env: NodeJS.ProcessEnv }>,
}))

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn((cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => {
      h.spawnCalls.push({ cmd, args, env: opts.env })
      const script = h.scripts.shift() ?? { exitCode: 0, stdout: 'ok' }
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
        pid: 4242,
        kill: vi.fn(),
      })
      // Emit on the next tick so runClaudeCli's listeners are attached first.
      setImmediate(() => {
        if (script.stderr) child.stderr.emit('data', Buffer.from(script.stderr))
        if (script.stdout) child.stdout.emit('data', Buffer.from(script.stdout))
        child.emit('close', script.exitCode)
      })
      return child
    }),
  }
})

// env.ts snapshots process.env at module load — silence CLI debug logging
// BEFORE importing claudeCli. There is no shared/env OAuth token anymore, so
// nothing else needs presetting here.
process.env.CLAUDE_CLI_DEBUG = '0'
delete process.env.CLAUDE_CLI_MODEL
delete process.env.CLAUDE_CODE_OAUTH_TOKEN

const { runClaudeCli, runClaudeCliOnce, ClaudeCliError, isClaudeAuthFailure } = await import(
  '@/lib/agent/claudeCli'
)
const { runWithClaudeAuth, currentClaudeAuth } = await import('@/lib/agent/claudeAuth')
type ClaudeCliAuth = import('@/lib/agent/claudeAuth').ClaudeCliAuth

const AUTH_STDERR = 'API Error: 401 OAuth token is invalid'
const NO_CREDENTIAL_MESSAGE =
  'No Claude credential available — connect a personal token in Settings or set the team token in Team Settings'

function userAuth(overrides: Partial<ClaudeCliAuth> = {}): ClaudeCliAuth {
  return {
    token: 'sk-ant-oat01-USER-personal-token',
    userId: 'user-1',
    teamId: 'team-1',
    onAuthFailure: vi.fn(async () => {}),
    ...overrides,
  }
}

function teamAuth(overrides: Partial<ClaudeCliAuth> = {}): ClaudeCliAuth {
  return {
    token: 'sk-ant-oat01-TEAM-shared-token',
    userId: null,
    teamId: 'team-1',
    onAuthFailure: vi.fn(async () => {}),
    ...overrides,
  }
}

beforeEach(() => {
  h.scripts.length = 0
  h.spawnCalls.length = 0
})

describe('isClaudeAuthFailure', () => {
  const authy = [
    'OAuth token is invalid',
    'OAuth token expired',
    'oauth token revoked',
    'Invalid API key · Please run /login',
    'authentication_error: request not authorized',
    'authentication error',
    'You are not logged in',
    'not authenticated',
    'API Error: 401 unauthorized',
  ]
  it.each(authy)('classifies "%s" as an auth failure', (stderr) => {
    expect(isClaudeAuthFailure(new ClaudeCliError('exit 1', 1, stderr, ''))).toBe(true)
  })

  it('matches auth phrasing in stdout too', () => {
    expect(isClaudeAuthFailure(new ClaudeCliError('exit 1', 1, '', 'Please run /login'))).toBe(true)
  })

  it('rejects generic non-zero exits', () => {
    expect(isClaudeAuthFailure(new ClaudeCliError('exit 1', 1, 'some tool blew up', ''))).toBe(false)
  })

  it('rejects exit code 0', () => {
    expect(isClaudeAuthFailure(new ClaudeCliError('odd', 0, AUTH_STDERR, ''))).toBe(false)
  })

  it('rejects plain Errors (timeout / ENOENT / buffer-limit)', () => {
    expect(isClaudeAuthFailure(new Error('Claude CLI timed out after 300000ms'))).toBe(false)
    expect(isClaudeAuthFailure(new Error('Claude CLI not found on PATH.'))).toBe(false)
    expect(isClaudeAuthFailure(new Error('Claude CLI output exceeded buffer limit'))).toBe(false)
    expect(isClaudeAuthFailure('a string')).toBe(false)
  })
})

describe('no-credential guard (env + dev-session tiers are deleted)', () => {
  it('runClaudeCliOnce throws the no-credential ClaudeCliError when ALS is empty and no override is passed', async () => {
    await expect(runClaudeCliOnce('prompt', {}, undefined)).rejects.toThrow(NO_CREDENTIAL_MESSAGE)
    expect(h.spawnCalls).toHaveLength(0)
  })

  it('the thrown error is a ClaudeCliError (not classified as an auth failure — nothing to retry)', async () => {
    await expect(runClaudeCliOnce('prompt', {}, undefined)).rejects.toBeInstanceOf(ClaudeCliError)
    try {
      await runClaudeCliOnce('prompt', {}, undefined)
    } catch (err) {
      expect(isClaudeAuthFailure(err)).toBe(false)
    }
  })

  it('runClaudeCli surfaces the same guard end-to-end with no auth context and no spawn', async () => {
    await expect(runClaudeCli('prompt')).rejects.toThrow(NO_CREDENTIAL_MESSAGE)
    expect(h.spawnCalls).toHaveLength(0)
  })
})

describe('runClaudeCli auth orchestration', () => {
  it('personal auth context → single attempt runs under the personal token', async () => {
    h.scripts.push({ exitCode: 0, stdout: 'hello' })
    const auth = userAuth()
    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).resolves.toBe('hello')
    expect(h.spawnCalls).toHaveLength(1)
    expect(h.spawnCalls[0].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(auth.token)
    // Stray API keys are always stripped from the child env.
    expect(h.spawnCalls[0].env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(h.spawnCalls[0].env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
  })

  it('team-only auth context (no personal token) → single attempt runs under the team token', async () => {
    h.scripts.push({ exitCode: 0, stdout: 'hello' })
    const auth = teamAuth()
    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).resolves.toBe('hello')
    expect(h.spawnCalls).toHaveLength(1)
    expect(h.spawnCalls[0].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(auth.token)
  })

  it('personal-token auth failure → marks it invalid, retries ONCE against the team token', async () => {
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    h.scripts.push({ exitCode: 0, stdout: 'recovered' })
    const fallback = teamAuth()
    const auth = userAuth({ resolveFallback: vi.fn(async () => fallback) })

    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).resolves.toBe('recovered')

    expect(h.spawnCalls).toHaveLength(2)
    expect(h.spawnCalls[0].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(auth.token)
    expect(h.spawnCalls[1].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(fallback.token)
    expect(auth.onAuthFailure).toHaveBeenCalledTimes(1)
    expect(auth.resolveFallback).toHaveBeenCalledTimes(1)
    expect(fallback.onAuthFailure).not.toHaveBeenCalled()
  })

  it('personal-token auth failure with no team token to fall back to → propagates (no retry)', async () => {
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    const auth = userAuth({ resolveFallback: vi.fn(async () => null) })

    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).rejects.toThrow(
      'Claude CLI exited with code 1'
    )
    expect(h.spawnCalls).toHaveLength(1)
    expect(auth.onAuthFailure).toHaveBeenCalledTimes(1)
  })

  it('personal-token auth failure with NO resolveFallback at all → propagates (no retry)', async () => {
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    const auth = userAuth() // resolveFallback undefined

    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).rejects.toThrow(
      'Claude CLI exited with code 1'
    )
    expect(h.spawnCalls).toHaveLength(1)
    expect(auth.onAuthFailure).toHaveBeenCalledTimes(1)
  })

  it('a second (team-tier) auth failure propagates and marks the team credential invalid too', async () => {
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    const fallback = teamAuth()
    const auth = userAuth({ resolveFallback: vi.fn(async () => fallback) })

    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).rejects.toThrow(
      'Claude CLI exited with code 1'
    )
    expect(h.spawnCalls).toHaveLength(2)
    expect(auth.onAuthFailure).toHaveBeenCalledTimes(1)
    expect(fallback.onAuthFailure).toHaveBeenCalledTimes(1)
  })

  it('non-auth failure under a user token → NO retry, no credential marked invalid', async () => {
    h.scripts.push({ exitCode: 1, stderr: 'renderer crashed' })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })

    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).rejects.toThrow(
      'Claude CLI exited with code 1'
    )
    expect(h.spawnCalls).toHaveLength(1)
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
    expect(auth.resolveFallback).not.toHaveBeenCalled()
  })

  it('a failing onAuthFailure does not block the team-tier retry', async () => {
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    h.scripts.push({ exitCode: 0, stdout: 'recovered' })
    const fallback = teamAuth()
    const auth = userAuth({
      onAuthFailure: vi.fn(async () => {
        throw new Error('db down')
      }),
      resolveFallback: vi.fn(async () => fallback),
    })

    await expect(runWithClaudeAuth(auth, () => runClaudeCli('prompt'))).resolves.toBe('recovered')
    expect(h.spawnCalls).toHaveLength(2)
  })

  it('opts.authToken (validation path) → bypasses the context AND never retries', async () => {
    h.scripts.push({ exitCode: 1, stderr: AUTH_STDERR })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })

    await expect(
      runWithClaudeAuth(auth, () => runClaudeCli('ping', { authToken: 'sk-ant-oat01-CANDIDATE' }))
    ).rejects.toThrow('Claude CLI exited with code 1')

    expect(h.spawnCalls).toHaveLength(1)
    expect(h.spawnCalls[0].env.CLAUDE_CODE_OAUTH_TOKEN).toBe('sk-ant-oat01-CANDIDATE')
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
    expect(auth.resolveFallback).not.toHaveBeenCalled()
  })

  it('prompt-size guard throws before any spawn', async () => {
    await expect(runClaudeCli('x'.repeat(600_001))).rejects.toThrow('Prompt too large')
    expect(h.spawnCalls).toHaveLength(0)
  })
})

describe('claudeAuth ALS context', () => {
  it('survives await boundaries and is absent outside runWithClaudeAuth', async () => {
    const auth = userAuth()
    const seen = await runWithClaudeAuth(auth, async () => {
      await new Promise((r) => setTimeout(r, 1))
      return currentClaudeAuth()
    })
    expect(seen).toBe(auth)
    expect(currentClaudeAuth()).toBeUndefined()
  })

  it('null auth is a plain passthrough', async () => {
    const seen = await runWithClaudeAuth(null, async () => currentClaudeAuth())
    expect(seen).toBeUndefined()
  })
})
