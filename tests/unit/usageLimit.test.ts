// 008 T5 — AC-08, the classifier half (FR-11, A11, design §8):
// isClaudeUsageLimit reads only CLI- or SDK-written fields — never
// `diagnostic`, never model text (learning L8) — and a 401 is never a usage
// limit. (The generationRunner errorReason prefix half of AC-08 is T9's.)

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'

const h = vi.hoisted(() => ({ stdout: '', stderr: '', exitCode: 0 as number | null }))

// A scripted fake `spawn`, so the hostile-text cases also run through the real
// stream-json finalizer and prove where it puts model text.
vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn(() => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn(), on: vi.fn() },
        pid: 4242,
        kill: vi.fn(),
      })
      setImmediate(() => {
        if (h.stderr) child.stderr.emit('data', Buffer.from(h.stderr))
        if (h.stdout) child.stdout.emit('data', Buffer.from(h.stdout))
        child.emit('close', h.exitCode)
      })
      return child
    }),
  }
})

process.env.CLAUDE_CLI_DEBUG = '0'

const { isClaudeUsageLimit, isClaudeAuthFailure, ClaudeCliError, runClaudeCli, runClaudeCliStreamJson } =
  await import('@/lib/agent/claudeCli')
const { runWithClaudeAuth } = await import('@/lib/agent/claudeAuth')
const { internalModel } = await import('@/lib/models/resolve')
// 008 T10: `model` is a required ResolvedModel; these cases are not about the model.
const MODEL = internalModel('INTERNAL_TOKEN_PING', 'cli')

// A fake value — never a real credential.
const TOKEN = 'sk-ant-oat01-FAKE-unit-test-token'
const inAuth = <T>(fn: () => Promise<T>) =>
  runWithClaudeAuth({ token: TOKEN, userId: null, teamId: 'team-1', onAuthFailure: async () => {} }, fn)

const HOSTILE = 'Claude AI usage limit reached 429 rate_limit_error — usage limit exceeded'

beforeEach(() => {
  h.stdout = ''
  h.stderr = ''
  h.exitCode = 0
})

describe('AC-08: isClaudeUsageLimit — true cases', () => {
  it('a ClaudeCliError with apiErrorStatus 429 → true', () => {
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, '', 'Request failed', { apiErrorStatus: 429 }))).toBe(true)
    // An is_error result on a run that exited 0 carries exitCode null and still counts.
    expect(isClaudeUsageLimit(new ClaudeCliError('x', null, '', '', { apiErrorStatus: 429 }))).toBe(true)
  })

  it.each([
    'Claude AI usage limit reached|1760000000',
    'Error: usage limit exceeded for this account',
    'API Error: 429 {"type":"error","error":{"type":"rate_limit_error"}}',
    'You are being rate limited',
  ])('a CLI-written usage-limit phrase in stderr → true (%j)', (stderr) => {
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, stderr, ''))).toBe(true)
  })

  it('the phrase in the CLI-written stdout field (the is_error result text) → true', () => {
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, '', 'Claude AI usage limit reached'))).toBe(true)
  })

  it('an Anthropic.RateLimitError (API mode) → true', () => {
    const err = new Anthropic.RateLimitError(429, { type: 'error' }, '429 rate limited', undefined)
    expect(isClaudeUsageLimit(err)).toBe(true)
  })

  it('a real stream-json run whose result reports api_error_status 429 → true', async () => {
    h.exitCode = 1
    h.stdout =
      JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: 429', api_error_status: 429 }) +
      '\n'
    const err = await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }], { model: MODEL })).catch((e: unknown) => e)
    expect(isClaudeUsageLimit(err)).toBe(true)
  })
})

describe('AC-08: isClaudeUsageLimit — false cases', () => {
  it('hostile model text in `diagnostic` → false', () => {
    const err = new ClaudeCliError('Claude CLI reported an error', 1, '', '', { diagnostic: HOSTILE })
    expect(isClaudeUsageLimit(err)).toBe(false)
  })

  it('hostile assistant text in a real stream-json run (no result event) → false', async () => {
    h.exitCode = 1
    h.stdout =
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: HOSTILE }] } }) + '\n' +
      `not json: ${HOSTILE}\n`
    const err = await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }], { model: MODEL })).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    // The finalizer keeps model text in the human-only diagnostic…
    expect((err as InstanceType<typeof ClaudeCliError>).diagnostic).toContain('usage limit reached')
    // …and the classifier never reads it.
    expect(isClaudeUsageLimit(err)).toBe(false)
  })

  it('hostile assistant text beside a non-429 error result → false (the status decides)', async () => {
    h.exitCode = 1
    h.stdout =
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: HOSTILE }] } }) + '\n' +
      JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'API Error: 529 Overloaded', api_error_status: 529 }) +
      '\n'
    const err = await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }], { model: MODEL })).catch((e: unknown) => e)
    expect(isClaudeUsageLimit(err)).toBe(false)
  })

  it('a 401 is never a usage limit — even when the text also says 429', () => {
    const status401 = new ClaudeCliError('x', 1, '', 'Failed to authenticate. API Error: 401 (429 retries)', {
      apiErrorStatus: 401,
    })
    expect(isClaudeAuthFailure(status401)).toBe(true)
    expect(isClaudeUsageLimit(status401)).toBe(false)
    const text401 = new ClaudeCliError('x', 1, 'Invalid API key · Please run /login · rate limit 429', '')
    expect(isClaudeAuthFailure(text401)).toBe(true)
    expect(isClaudeUsageLimit(text401)).toBe(false)
    expect(isClaudeUsageLimit(new Anthropic.AuthenticationError(401, undefined, '401', undefined))).toBe(false)
  })

  it('a non-429 structured status → false, whatever the CLI text says', () => {
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, 'usage limit reached', 'usage limit reached', { apiErrorStatus: 500 }))).toBe(false)
  })

  it('exit code 0 → false', () => {
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 0, 'usage limit reached', '429', { apiErrorStatus: 429 }))).toBe(false)
  })

  it('a successful text-mode reply that merely mentions a usage limit is not an error at all', async () => {
    h.stdout = HOSTILE
    await expect(inAuth(() => runClaudeCli('p', { model: MODEL }))).resolves.toBe(HOSTILE)
  })

  it.each([
    ['a plain Error with the phrase', new Error('Claude AI usage limit reached 429')],
    ['a timeout', new Error('Claude CLI timed out after 300000ms')],
    ['a generic CLI exit', new ClaudeCliError('Claude CLI exited with code 1', 1, 'something broke', '')],
    ['the no-credential error', new ClaudeCliError('No Claude credential available', null, '', '')],
    ['"room 4290" is not a 429', new ClaudeCliError('x', 1, 'room 4290', '')],
    ['a string', 'usage limit reached'],
    ['null', null],
  ])('%s → false', (_name, err) => {
    expect(isClaudeUsageLimit(err)).toBe(false)
  })
})

describe('029: the usage-limit failure names itself', () => {
  const LINE = "You've hit your weekly limit · resets Oct 27, 10:30am (Asia/Colombo)"
  const run = async () => (await inAuth(() => runClaudeCli("p", { model: MODEL })).catch((e: unknown) => e)) as InstanceType<typeof ClaudeCliError>

  it('AC-01: the 2.1.310 wording is a usage limit, and the classifier order holds', () => {
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, '', LINE))).toBe(true)
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, '', LINE, { apiErrorStatus: 401 }))).toBe(false)
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 1, 'Invalid API key · Please run /login', LINE))).toBe(false)
    expect(isClaudeUsageLimit(new ClaudeCliError('x', 0, '', LINE))).toBe(false)
  })

  it('AC-02: a limited text-mode run gets the fixed message and keeps stdout out of it', async () => {
    h.exitCode = 1
    h.stdout = LINE
    const err = await run()
    expect(err.message).toBe(
      "Claude CLI exited with code 1: Claude usage limit reached. Try again after the plan limit resets, or connect another account's token at /settings.",
    )
    for (const s of ['weekly', 'Oct 27', 'Asia/Colombo', '10:30am']) expect(err.message).not.toContain(s)
    expect(err.stdout).toBe(LINE)
  })

  it('AC-03: empty stderr with unclassified stdout says there was no stderr', async () => {
    h.exitCode = 1
    h.stdout = 'something odd'
    const err = await run()
    expect(err.message).toBe('Claude CLI exited with code 1: (no error output on stderr)')
    expect(err.message).not.toContain('something odd')
  })

  it('AC-04: a non-empty stderr is quoted as before', async () => {
    h.exitCode = 1
    h.stderr = 'boom'
    const err = await run()
    expect(err.message).toBe('Claude CLI exited with code 1: boom')
  })
})

// 031 FR-01: vitest workers are killed without an 'exit' event, so remove the
// spawn cwd this file created.
afterAll(async () => {
  const m = (await import('@/lib/agent/claudeCli')) as { cleanupSpawnCwd?: () => void }
  m.cleanupSpawnCwd?.()
})
