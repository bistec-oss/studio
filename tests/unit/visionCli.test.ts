// 005 T5 — CLI-mode vision over stream-json, with no files (FR-09, NFR-07).
//
//   AC-15  CLI vision writes no file; sends ONE stream-json user message with
//          N base64 image blocks + one text block carrying
//          UNTRUSTED_CONTENT_GUARD; returns the terminal `result` event's text;
//          errors on an error-subtype result and on a stream with no result.
//   AC-13  (vision site) the argv carries the stream-json flags and
//          `--tools ""`, never `--allowedTools` — on POSIX and on win32.
//   Auth   a stream-json auth failure still classes as one, so the
//          personal → team retry keeps working — and (T6) model-written text
//          never drives that classification.
//
// Driven through the REAL runVisionModel → runClaudeCliStreamJson → spawnClaude
// with a scripted fake `spawn`, a stubbed `fetch`, and spied fs writes. The
// event shapes below are the ones the local CLI 2.1.287 actually emitted
// (see reports/T5.md).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({
  // Each entry scripts one spawned process, consumed FIFO. `chunks` are emitted
  // as separate stdout `data` events, so a test can split a line mid-JSON.
  scripts: [] as Array<{ exitCode: number | null; chunks?: string[]; stderr?: string }>,
  spawnCalls: [] as Array<{
    cmd: string
    args: string[]
    shell: boolean
    env: NodeJS.ProcessEnv
    stdinWrites: string[]
    ended: boolean
  }>,
}))

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn((cmd: string, args: string[], opts: { shell: boolean; env: NodeJS.ProcessEnv }) => {
      const call = { cmd, args, shell: opts.shell, env: opts.env, stdinWrites: [] as string[], ended: false }
      h.spawnCalls.push(call)
      const script = h.scripts.shift() ?? { exitCode: 0, chunks: [] }
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: {
          write: vi.fn((s: string) => call.stdinWrites.push(s)),
          end: vi.fn(() => (call.ended = true)),
          on: vi.fn(),
        },
        pid: 4242,
        kill: vi.fn(),
      })
      setImmediate(() => {
        if (script.stderr) child.stderr.emit('data', Buffer.from(script.stderr))
        for (const c of script.chunks ?? []) child.stdout.emit('data', Buffer.from(c))
        child.emit('close', script.exitCode)
      })
      return child
    }),
  }
})

// AC-15 "writes no file": spy every fs write/temp entry point, both specifiers.
const fsSpies = vi.hoisted(() => ({
  writeFile: vi.fn(),
  mkdtemp: vi.fn(),
  appendFile: vi.fn(),
  open: vi.fn(),
  writeFileSync: vi.fn(),
  mkdtempSync: vi.fn(),
}))
for (const spec of ['node:fs/promises', 'fs/promises']) {
  vi.doMock(spec, async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const real = await importOriginal()
    const wrap = (name: 'writeFile' | 'mkdtemp' | 'appendFile' | 'open') =>
      ((...a: unknown[]) => {
        fsSpies[name](...a)
        return (real[name] as (...x: unknown[]) => unknown)(...a)
      })
    return { ...real, default: real, writeFile: wrap('writeFile'), mkdtemp: wrap('mkdtemp'), appendFile: wrap('appendFile'), open: wrap('open') }
  })
}
for (const spec of ['node:fs', 'fs']) {
  vi.doMock(spec, async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const real = await importOriginal()
    return {
      ...real,
      default: real,
      writeFileSync: (...a: unknown[]) => {
        fsSpies.writeFileSync(...a)
        return (real.writeFileSync as (...x: unknown[]) => unknown)(...a)
      },
      mkdtempSync: (...a: unknown[]) => {
        fsSpies.mkdtempSync(...a)
        return (real.mkdtempSync as (...x: unknown[]) => unknown)(...a)
      },
    }
  })
}

// API-mode key resolution only — CLI vision never touches the registry. Mocked
// so prisma (which loads `.env`, CLAUDE_CLI_PATH included) never initializes.
vi.mock('@/providers/registry', () => ({ resolveAnthropicApiKey: vi.fn(async () => null) }))
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => true,
}))

// env.ts snapshots process.env at module load — settle it BEFORE importing.
process.env.CLAUDE_CLI_DEBUG = '0'
delete process.env.CLAUDE_CLI_MODEL
delete process.env.CLAUDE_CLI_PATH

const { runVisionModel } = await import('@/lib/agent/vision')
const { ClaudeCliError } = await import('@/lib/agent/claudeCli')
const { runWithClaudeAuth } = await import('@/lib/agent/claudeAuth')
const { UNTRUSTED_CONTENT_GUARD } = await import('@/lib/agent/untrusted')
const { modelFor } = await import('@/lib/agent/config')
type ClaudeCliAuth = import('@/lib/agent/claudeAuth').ClaudeCliAuth

// Fake values — never real credentials.
const USER_TOKEN = 'sk-ant-oat01-FAKE-user-token'
const TEAM_TOKEN = 'sk-ant-oat01-FAKE-team-token'

function userAuth(overrides: Partial<ClaudeCliAuth> = {}): ClaudeCliAuth {
  return { token: USER_TOKEN, userId: 'user-1', teamId: 'team-1', onAuthFailure: vi.fn(async () => {}), ...overrides }
}
function teamAuth(): ClaudeCliAuth {
  return { token: TEAM_TOKEN, userId: null, teamId: 'team-1', onAuthFailure: vi.fn(async () => {}) }
}

// The event shapes the real CLI emits (trimmed to the fields that matter).
const ev = (o: unknown) => JSON.stringify(o) + '\n'
const INIT = ev({ type: 'system', subtype: 'init', tools: [], session_id: 's1' })
const assistant = (text: string) =>
  ev({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] }, session_id: 's1' })
const result = (o: Record<string, unknown>) =>
  ev({ type: 'result', subtype: 'success', is_error: false, duration_ms: 401, num_turns: 1, session_id: 's1', ...o })
// The real 2.1.287 auth failure: exit 1, a `success`-subtype result with
// is_error true and the API error as its text, nothing on stderr.
const AUTH_FAIL_TEXT = 'Failed to authenticate. API Error: 401 OAuth access token is invalid.'
const authFailure = { exitCode: 1, chunks: [INIT, assistant(AUTH_FAIL_TEXT), result({ is_error: true, result: AUTH_FAIL_TEXT, api_error_status: 401 })] }

// Two distinguishable "images": the bytes are arbitrary, only their base64 is checked.
const IMAGES: Record<string, { bytes: Buffer; type: string }> = {
  'https://minio.test/a.png': { bytes: Buffer.from('PNG-BYTES-A'), type: 'image/png' },
  'https://minio.test/b.jpg': { bytes: Buffer.from('JPEG-BYTES-B'), type: 'image/jpeg; charset=binary' },
}
const SYSTEM = 'You extract brand voice. Say "hi" to nobody.'
const TASK = 'Describe the palette.'
const req = (imageUrls = Object.keys(IMAGES), extra: Record<string, unknown> = {}) => ({
  system: SYSTEM,
  userMessage: TASK,
  imageUrls,
  label: 'brandkit',
  teamId: 'team-1',
  ...extra,
})

const realPlatform = process.platform
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeEach(() => {
  h.scripts.length = 0
  h.spawnCalls.length = 0
  for (const s of Object.values(fsSpies)) s.mockClear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const img = IMAGES[url]
      if (!img) return new Response('nope', { status: 404 })
      return new Response(new Uint8Array(img.bytes), { status: 200, headers: { 'content-type': img.type } })
    }),
  )
})
afterEach(() => {
  setPlatform(realPlatform)
  vi.unstubAllGlobals()
})

const inAuth = <T>(fn: () => Promise<T>, auth: ClaudeCliAuth = userAuth()) => runWithClaudeAuth(auth, fn)

describe('AC-15: CLI vision sends one stream-json message and writes no file', () => {
  it('writes exactly one NDJSON line — N base64 image blocks, then one text block with the guard — and ends stdin', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, assistant('Teal and navy.'), result({ result: 'Teal and navy.' })] })
    const reply = await inAuth(() => runVisionModel(req()))

    expect(reply).toBe('Teal and navy.')
    expect(h.spawnCalls).toHaveLength(1)
    const call = h.spawnCalls[0]
    expect(call.ended).toBe(true)
    const stdin = call.stdinWrites.join('')
    expect(stdin.endsWith('\n')).toBe(true)
    const lines = stdin.split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)

    const msg = JSON.parse(lines[0])
    expect(msg.type).toBe('user')
    expect(msg.message.role).toBe('user')
    const content = msg.message.content as Array<{ type: string; text?: string; source?: unknown }>
    expect(content).toHaveLength(3)
    expect(content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: Buffer.from('PNG-BYTES-A').toString('base64') },
    })
    expect(content[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from('JPEG-BYTES-B').toString('base64') },
    })
    expect(content[2].type).toBe('text')
    const text = content[2].text ?? ''
    expect(text).toContain(SYSTEM)
    expect(text).toContain(UNTRUSTED_CONTENT_GUARD)
    expect(text).toContain('--- Task ---')
    expect(text).toContain(TASK)
    expect(text).toMatch(/attached images/i)
    expect(text).not.toMatch(/Read tool|current directory|ref-\d|bistec-vision-/i)
  })

  it('writes no file and creates no temp dir of its own', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'ok' })] })
    await inAuth(() => runVisionModel(req()))
    for (const name of ['writeFile', 'appendFile', 'open', 'writeFileSync'] as const) {
      expect(fsSpies[name], name).not.toHaveBeenCalled()
    }
    // The one directory any spawn may create is the shared, empty spawn cwd
    // (T6: `bistec-cli-*`, once per process) — never a file holding image data.
    for (const name of ['mkdtemp', 'mkdtempSync'] as const) {
      for (const [prefix] of fsSpies[name].mock.calls) expect(String(prefix), name).toMatch(/bistec-cli-$/)
    }
  })

  it('returns only the terminal result event text — several assistant messages, lines split across chunks', async () => {
    const out = INIT + assistant('thinking out loud') + assistant('First draft.') + result({ result: 'Final answer.' })
    // Split mid-line (and mid-UTF-8-free JSON) at awkward offsets.
    const chunks = [out.slice(0, 7), out.slice(7, 60), out.slice(60, out.length - 9), out.slice(out.length - 9)]
    h.scripts.push({ exitCode: 0, chunks })
    await expect(inAuth(() => runVisionModel(req()))).resolves.toBe('Final answer.')
  })

  it('tolerates a final result line with no trailing newline', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'no newline' }).trimEnd()] })
    await expect(inAuth(() => runVisionModel(req()))).resolves.toBe('no newline')
  })

  it('throws ClaudeCliError on an error-subtype result', async () => {
    h.scripts.push({
      exitCode: 1,
      chunks: [INIT, result({ subtype: 'error_during_execution', is_error: true, errors: ['boom'] })],
    })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect((err as Error).message).toMatch(/error_during_execution/)
  })

  it('throws ClaudeCliError on an is_error result even when the process exits 0', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ is_error: true, result: 'Something went wrong' })] })
    await expect(inAuth(() => runVisionModel(req()))).rejects.toBeInstanceOf(ClaudeCliError)
  })

  it('throws ClaudeCliError when the stream closes with no result event', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, assistant('half an answer')] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect((err as Error).message).toMatch(/no result/i)
  })

  it('throws ClaudeCliError on a non-zero exit with no result, keeping stderr', async () => {
    h.scripts.push({ exitCode: 1, stderr: 'error: unknown option', chunks: [] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect((err as InstanceType<typeof ClaudeCliError>).stderr).toContain('unknown option')
  })

  it('an empty image list still sends one message: just the text block', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'text only' })] })
    await expect(inAuth(() => runVisionModel(req([])))).resolves.toBe('text only')
    const msg = JSON.parse(h.spawnCalls[0].stdinWrites.join('').trim())
    expect(msg.message.content).toHaveLength(1)
    expect(msg.message.content[0].type).toBe('text')
  })

  it('the 600k guard measures the text only: a ~2 MB reference image is sent (T6, superseding T5)', async () => {
    // ~2 MB raw → ~2.8M base64 chars. Before T6 this tripped the 600k guard.
    IMAGES['https://minio.test/big.png'] = { bytes: Buffer.alloc(2 * 1024 * 1024, 1), type: 'image/png' }
    try {
      h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'ok' })] })
      await expect(inAuth(() => runVisionModel(req(['https://minio.test/big.png'])))).resolves.toBe('ok')
      expect(h.spawnCalls).toHaveLength(1)
    } finally {
      delete IMAGES['https://minio.test/big.png']
    }
  })

  it('a reference image over 5 MB is refused by index and size, and never spawns', async () => {
    IMAGES['https://minio.test/huge.png'] = { bytes: Buffer.alloc(6 * 1024 * 1024, 1), type: 'image/png' }
    try {
      await expect(
        inAuth(() => runVisionModel(req(['https://minio.test/a.png', 'https://minio.test/huge.png']))),
      ).rejects.toThrow(/image 2 of 2 is 6\.0 MB/i)
      expect(h.spawnCalls).toHaveLength(0)
    } finally {
      delete IMAGES['https://minio.test/huge.png']
    }
  })
})

describe('AC-13 (vision site): the argv', () => {
  function expectStreamJsonArgs(args: string[], empty: string) {
    expect(args.slice(0, 4)).toEqual(['-p', '--strict-mcp-config', '--tools', empty])
    const at = (flag: string) => args[args.indexOf(flag) + 1]
    expect(at('--input-format')).toBe('stream-json')
    expect(at('--output-format')).toBe('stream-json')
    expect(args).toContain('--verbose')
    expect(at('--model')).toBe(modelFor('B', 'cli'))
    expect(args).not.toContain('--allowedTools')
    expect(args).not.toContain('--allowed-tools')
    // maxTokens stays ignored in CLI mode — it never reaches argv.
    expect(args.join(' ')).not.toMatch(/max-tokens|4096/)
  }

  it('POSIX: stream-json flags, --tools "" as its own argv element, no --allowedTools', async () => {
    setPlatform('linux')
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'ok' })] })
    await inAuth(() => runVisionModel(req(undefined, { maxTokens: 4096 })))
    expect(h.spawnCalls[0].shell).toBe(false)
    expectStreamJsonArgs(h.spawnCalls[0].args, '')
  })

  it('win32: the empty --tools value survives the shell join', async () => {
    setPlatform('win32')
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'ok' })] })
    await inAuth(() => runVisionModel(req(undefined, { maxTokens: 4096 })))
    const call = h.spawnCalls[0]
    expect(call.shell).toBe(true)
    expectStreamJsonArgs(call.args, '""')
    expect([call.cmd, ...call.args].join(' ')).toContain(' --tools "" ')
    // The system text (which has quotes) travels in stdin, never argv.
    expect(call.args.join(' ')).not.toContain('brand voice')
  })

  it('the OAuth token travels in env, never argv or stdin', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ result: 'ok' })] })
    await inAuth(() => runVisionModel(req()))
    const call = h.spawnCalls[0]
    expect(call.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(USER_TOKEN)
    expect(call.args.join(' ')).not.toContain(USER_TOKEN)
    expect(call.stdinWrites.join('')).not.toContain(USER_TOKEN)
  })
})

describe('auth: a stream-json auth failure triggers the personal → team retry', () => {
  it('the real 2.1.287 auth-failure result marks the personal token invalid and retries once on the team token', async () => {
    h.scripts.push(authFailure, { exitCode: 0, chunks: [INIT, result({ result: 'from the team token' })] })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })

    await expect(inAuth(() => runVisionModel(req()), auth)).resolves.toBe('from the team token')
    expect(auth.onAuthFailure).toHaveBeenCalledTimes(1)
    expect(h.spawnCalls).toHaveLength(2)
    expect(h.spawnCalls[0].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(USER_TOKEN)
    expect(h.spawnCalls[1].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TEAM_TOKEN)
    // The retry re-sends the same single message.
    expect(h.spawnCalls[1].stdinWrites.join('')).toBe(h.spawnCalls[0].stdinWrites.join(''))
  })

  it('the auth-failure error is a ClaudeCliError that isClaudeAuthFailure accepts', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push(authFailure)
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect(isClaudeAuthFailure(err)).toBe(true)
  })

  it('a non-auth error result does NOT retry or mark the token invalid — even with 401 elsewhere in the NDJSON', async () => {
    // duration_ms is 401 in every scripted result: the classifier must read the
    // error text, not the raw event stream.
    h.scripts.push({
      exitCode: 1,
      chunks: [INIT, result({ subtype: 'error_max_turns', is_error: true, errors: ['Reached max turns'] })],
    })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })
    await expect(inAuth(() => runVisionModel(req()), auth)).rejects.toBeInstanceOf(ClaudeCliError)
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
    expect(h.spawnCalls).toHaveLength(1)
  })
})

// T6 (T5 review, Important): text the MODEL wrote must never drive auth
// classification. A reply that reads "401" off an attacker-influenced image (a
// phone number, a room number) or says "invalid API key" must not mark a good
// personal token INVALID when a run ends without a result event — a crash, a
// kill, or stream-json schema drift.
describe('auth: model-written text never classifies as an auth failure', () => {
  const MODEL_TEXT = ['Call 401-555-0100 to enrol.', 'The sign says INVALID API KEY.', 'Room 401, Floor 4.']
  const cases = MODEL_TEXT.flatMap((text) => [0, null, 1].map((exitCode) => [text, exitCode] as const))

  it.each(cases)('no result event, assistant text %j, exit %s → not an auth failure, no retry', async (text, exitCode) => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({ exitCode, chunks: [INIT, assistant(text)] })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })
    const err = await inAuth(() => runVisionModel(req()), auth).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect(isClaudeAuthFailure(err)).toBe(false)
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
    expect(auth.resolveFallback).not.toHaveBeenCalled()
    expect(h.spawnCalls).toHaveLength(1)
    // The model text is kept for humans (diagnostic), out of the classified fields.
    const e = err as InstanceType<typeof ClaudeCliError>
    expect(e.stdout).not.toContain(text)
    expect(e.diagnostic).toContain(text)
  })

  it('no result event keeps the real exit code (no 0 → null coercion)', async () => {
    h.scripts.push({ exitCode: 0, chunks: [INIT, assistant('half an answer')] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect((err as InstanceType<typeof ClaudeCliError>).exitCode).toBe(0)
  })

  it('CLI non-JSON stdout lines are not classified either', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({ exitCode: 1, chunks: [INIT, 'Room 401 — not logged in\n'] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(isClaudeAuthFailure(err)).toBe(false)
  })

  it('a result-bearing failure is classified on api_error_status first: 401 → auth failure whatever the text', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({ exitCode: 1, chunks: [INIT, result({ is_error: true, result: 'Request failed.', api_error_status: 401 })] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(isClaudeAuthFailure(err)).toBe(true)
  })

  it('a result-bearing failure with another api_error_status is NOT an auth failure, even if its text says 401', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({
      exitCode: 1,
      chunks: [INIT, result({ is_error: true, result: 'API Error: 529 overloaded (retry 401 ms)', api_error_status: 529 })],
    })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(isClaudeAuthFailure(err)).toBe(false)
  })

  it('an is_error result with no status falls back to the regex over the result text only', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({ exitCode: 1, chunks: [INIT, assistant('Room 401'), result({ is_error: true, result: 'Not logged in · Please run /login' })] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(isClaudeAuthFailure(err)).toBe(true)
  })

  it('a non-success subtype WITHOUT is_error is never an auth failure (its result may be model text)', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({ exitCode: 0, chunks: [INIT, result({ subtype: 'error_max_turns', is_error: false, result: 'Room 401' })] })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect(isClaudeAuthFailure(err)).toBe(false)
  })

  // T6 fix round 1: the pinned CLI reports a REVOKED token as a 403 whose
  // is_error result text says "OAuth token has been revoked". That must mark
  // the personal token invalid and retry on the team token, like a 401.
  const REVOKED_TEXT =
    'Failed to authenticate. API Error: 403 {"type":"error","error":{"type":"permission_error","message":"OAuth token has been revoked. Please obtain a new token or refresh your existing token."}}'

  it('403 + "OAuth token has been revoked" → auth failure: the personal token is marked invalid and the team retry fires', async () => {
    h.scripts.push(
      { exitCode: 1, chunks: [INIT, assistant(REVOKED_TEXT), result({ is_error: true, result: REVOKED_TEXT, api_error_status: 403 })] },
      { exitCode: 0, chunks: [INIT, result({ result: 'from the team token' })] },
    )
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })
    await expect(inAuth(() => runVisionModel(req()), auth)).resolves.toBe('from the team token')
    expect(auth.onAuthFailure).toHaveBeenCalledTimes(1)
    expect(h.spawnCalls).toHaveLength(2)
    expect(h.spawnCalls[1].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TEAM_TOKEN)
  })

  it('403 permission_error with other text → not an auth failure, no retry', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    const text =
      'API Error: 403 {"type":"error","error":{"type":"permission_error","message":"Your organization does not allow this model. Please run /login"}}'
    h.scripts.push({ exitCode: 1, chunks: [INIT, result({ is_error: true, result: text, api_error_status: 403 })] })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })
    const err = await inAuth(() => runVisionModel(req()), auth).catch((e: unknown) => e)
    expect(isClaudeAuthFailure(err)).toBe(false)
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
    expect(h.spawnCalls).toHaveLength(1)
  })

  it('403 whose result is NOT is_error → not an auth failure, even with revoked text (it may be model text)', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({
      exitCode: 1,
      chunks: [INIT, result({ subtype: 'error_during_execution', is_error: false, result: 'OAuth token has been revoked', api_error_status: 403 })],
    })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ClaudeCliError)
    expect(isClaudeAuthFailure(err)).toBe(false)
  })

  it('403 with an empty is_error result and the revoked text only in ASSISTANT text → not an auth failure', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({
      exitCode: 1,
      chunks: [INIT, assistant('OAuth token has been revoked'), result({ is_error: true, result: '', api_error_status: 403 })],
    })
    const auth = userAuth({ resolveFallback: vi.fn(async () => teamAuth()) })
    const err = await inAuth(() => runVisionModel(req()), auth).catch((e: unknown) => e)
    expect(isClaudeAuthFailure(err)).toBe(false)
    expect(auth.onAuthFailure).not.toHaveBeenCalled()
  })

  it('the real 2.1.287 auth-failure shape at exit 0 still classifies (is_error → exit code null)', async () => {
    const { isClaudeAuthFailure } = await import('@/lib/agent/claudeCli')
    h.scripts.push({ ...authFailure, exitCode: 0 })
    const err = await inAuth(() => runVisionModel(req())).catch((e: unknown) => e)
    expect((err as InstanceType<typeof ClaudeCliError>).exitCode).toBeNull()
    expect(isClaudeAuthFailure(err)).toBe(true)
  })
})
