// 005 T4 — the one CLI spawn core (FR-08 text mode, FR-10, FR-17).
//
//   AC-13  every text-mode call site spawns with `--tools` + an empty value and
//          never `--allowedTools`; on win32 the empty value survives the
//          shell's argv join.
//   AC-14  the child env is exactly the FR-10 allowlist plus the constant
//          DISABLE_AUTOUPDATER=1 (T6) and the OAuth token —
//          no server secret ever reaches the child.
//   AC-25  the command + shell choice per platform and CLAUDE_CLI_PATH.
//   T6     settings isolation (flags + temp cwd), no session persistence, the
//          constant DISABLE_AUTOUPDATER, the model-name charset, the win32
//          not-found mapping, UTF-8 chunk decoding, and the stream-json size
//          guards (text-only 600k, 5 MB per image, a total stdin cap).
//
// Driven through the REAL runClaudeCli (and the real call wrappers where they
// are cheap to reach) with a scripted fake `spawn`, so the assertions are on
// the argv / env that would reach the `claude` binary.

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest'

const h = vi.hoisted(() => ({
  spawnCalls: [] as Array<{
    cmd: string
    args: string[]
    shell: boolean
    env: NodeJS.ProcessEnv
    cwd: string | undefined
    stdin: string
  }>,
  // Reply every fake child prints; tests that need a specific shape set it.
  stdout: 'ok' as string,
  // Optional overrides: raw stdout chunks (to split a UTF-8 sequence), stderr
  // and the exit code.
  chunks: null as Buffer[] | null,
  stderr: '',
  exitCode: 0 as number | null,
  // When set, the fake child emits a spawn 'error' with this code instead of
  // output (005 T6 fix round 1: ENOENT from a missing binary or a vanished cwd).
  spawnErrorCode: null as string | null,
  // Runs synchronously inside the fake spawn, before any event (e.g. to delete
  // the cwd the spawn was handed).
  onSpawn: null as ((cwd: string | undefined) => void) | null,
  // 008 T5: per-spawn overrides, consumed in order (e.g. an auth failure then a
  // success); a child that never exits (to drive the timeout); and a value
  // env.CLAUDE_CLI_MODEL reads as (undefined ⇒ the real, unset one). Since T10
  // the boundary never reads it: setting it proves that.
  queue: [] as Array<{ exitCode: number | null; stdout?: string; stderr?: string }>,
  hang: false,
  envCliModel: undefined as string | undefined,
}))

vi.mock('child_process', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    spawn: vi.fn((cmd: string, args: string[], opts: { shell: boolean; env: NodeJS.ProcessEnv; cwd?: string }) => {
      const call = { cmd, args, shell: opts.shell, env: opts.env, cwd: opts.cwd, stdin: '' }
      h.spawnCalls.push(call)
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn((s: string) => (call.stdin += s)), end: vi.fn(), on: vi.fn() },
        pid: 4242,
        kill: vi.fn(),
      })
      h.onSpawn?.(opts.cwd)
      const scripted = h.queue.shift()
      if (h.hang && !scripted) return child
      setImmediate(() => {
        if (scripted) {
          if (scripted.stderr) child.stderr.emit('data', Buffer.from(scripted.stderr))
          child.stdout.emit('data', Buffer.from(scripted.stdout ?? ''))
          child.emit('close', scripted.exitCode)
          return
        }
        if (h.spawnErrorCode) {
          child.emit('error', Object.assign(new Error(`spawn ${cmd} ${h.spawnErrorCode}`), { code: h.spawnErrorCode }))
          return
        }
        if (h.stderr) child.stderr.emit('data', Buffer.from(h.stderr))
        for (const c of h.chunks ?? [Buffer.from(h.stdout)]) child.stdout.emit('data', c)
        child.emit('close', h.exitCode)
      })
      return child
    }),
  }
})

// env.ts snapshots process.env at load; this lets a test set CLAUDE_CLI_MODEL
// (already validated to a ModelKey, 008 T3) without re-importing the graph.
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>()
  const env = new Proxy(mod.env, {
    get: (target, prop, receiver) =>
      prop === 'CLAUDE_CLI_MODEL' && h.envCliModel !== undefined ? h.envCliModel : Reflect.get(target, prop, receiver),
  })
  return { ...mod, env }
})

// CLI mode for the wrappers that branch on it (briefing, token-validate).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => true,
}))
// runDesignAgentCli renders + uploads after the CLI call — not under test here.
vi.mock('@/lib/renderer/puppeteer', () => ({
  renderHtmlToPng: vi.fn(async () => Buffer.from('png')),
  renderPost: vi.fn(async () => ({ png: Buffer.from('png'), headlineCheck: 'painted' })),
}))
vi.mock('@/lib/storage/minio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/minio')>()),
  uploadObject: vi.fn(async () => {}),
}))

// env.ts snapshots process.env at module load — settle it BEFORE importing.
process.env.CLAUDE_CLI_DEBUG = '0'
delete process.env.CLAUDE_CLI_MODEL
delete process.env.CLAUDE_CLI_PATH

const {
  runClaudeCli,
  runClaudeCliStreamJson,
  buildChildEnv,
  claudeCommand,
  isClaudeAuthFailure,
  ClaudeCliError,
  CHILD_ENV_ALWAYS,
  CHILD_ENV_WIN32,
} = await import('@/lib/agent/claudeCli')
const { runWithClaudeAuth } = await import('@/lib/agent/claudeAuth')
const { ClaudeCliCopyProvider } = await import('@/providers/implementations/copy/claude-cli')
const { runDesignAgentCli, runDesignAgentCliRefine } = await import('@/lib/agent/designAgentCli')
const { runBriefingModel } = await import('@/lib/campaign/briefingAssistant')
const { validateClaudeToken } = await import('@/lib/agent/userToken')
const { decideModel, internalModel } = await import('@/lib/models/resolve')
const { SYSTEM_DEFAULTS, entryFor } = await import('@/lib/models/catalogue')
const { setModelCallSink } = await import('@/lib/models/modelCalls')

// 008: every call site passes a ResolvedModel (the system default here: no
// policy row, CLI mode, team credential). T10 made it required.
function siteModel(surface: 'CAPTION' | 'DESIGN_FREEFORM' | 'REFINE' | 'ASSISTANT_BRIEFING' | 'ASSISTANT_BRANDKIT') {
  const r = decideModel(surface, {
    policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
    credential: 'team',
    mode: 'cli',
  })
  if (!r.ok) throw new Error(r.message)
  return r.resolved
}

// The model for the cases that are not about the model (isolation, env, size
// guards, decoding): any resolved model will do.
const ANY = siteModel('CAPTION')

type ClaudeCliOptions = import('@/lib/agent/claudeCli').ClaudeCliOptions
type ClaudeCliAuth = import('@/lib/agent/claudeAuth').ClaudeCliAuth

// A fake value — never a real credential.
const TOKEN = 'sk-ant-oat01-FAKE-unit-test-token'
const auth: ClaudeCliAuth = { token: TOKEN, userId: 'user-1', teamId: 'team-1', onAuthFailure: async () => {} }
const inAuth = <T>(fn: () => Promise<T>) => runWithClaudeAuth(auth, fn)

const realPlatform = process.platform
function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeEach(() => {
  h.spawnCalls.length = 0
  h.stdout = 'ok'
  h.chunks = null
  h.stderr = ''
  h.exitCode = 0
  h.spawnErrorCode = null
  h.onSpawn = null
  h.queue.length = 0
  h.hang = false
  h.envCliModel = undefined
})
afterEach(() => setPlatform(realPlatform))

// The spawned argv must open `-p --strict-mcp-config --tools <EMPTY>` and
// carry no --allowedTools anywhere.
function expectNoTools(args: string[], empty: string) {
  expect(args.slice(0, 4)).toEqual(['-p', '--strict-mcp-config', '--tools', empty])
  expect(args).not.toContain('--allowedTools')
  expect(args).not.toContain('--allowed-tools')
}

describe('AC-13: every text-mode call site spawns with --tools "" and never --allowedTools', () => {
  // The option objects each call site passes today (copied from the source,
  // so a new option on a site shows up here as a diff). Vision is not listed:
  // it runs in stream-json mode, and its site is covered by visionCli.test.ts.
  const sites: Array<[string, ClaudeCliOptions]> = [
    ['copy', { model: siteModel('CAPTION'), label: 'copy' }],
    ['design', { label: 'design', model: siteModel('DESIGN_FREEFORM') }],
    // 008 T7/T10: refine runs the REFINE model on its own surface timeout.
    ['refine', { label: 'refine', model: siteModel('REFINE') }],
    // 008 T7: the verifier runs its internal model (FR-15); no pin, the timeout is the model's.
    ['verifier', { label: 'verify', model: internalModel('INTERNAL_VERIFIER', 'cli') }],
    // 008 T6: the background decision runs its internal model (FR-15).
    ['background', { label: 'background', model: internalModel('INTERNAL_BACKGROUND', 'cli') }],
    // 008 T8: the assistant text call and the token ping run a ResolvedModel; the timeout is the model's.
    ['briefing', { label: 'briefing', model: siteModel('ASSISTANT_BRIEFING') }],
    ['token-validate', { model: internalModel('INTERNAL_TOKEN_PING', 'cli'), label: 'token-validate', authToken: TOKEN }],
  ]

  it.each(sites)('%s (option table, POSIX)', async (_site, opts) => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('prompt', opts))
    expect(h.spawnCalls).toHaveLength(1)
    expectNoTools(h.spawnCalls[0].args, '')
  })

  it.each(sites)('%s (option table, win32 — the empty value survives the shell join)', async (_site, opts) => {
    setPlatform('win32')
    await inAuth(() => runClaudeCli('prompt', opts))
    const call = h.spawnCalls[0]
    expect(call.shell).toBe(true)
    expectNoTools(call.args, '""')
    // Node joins argv with spaces under shell:true and does no quoting, so
    // this is the command line cmd.exe actually parses.
    expect([call.cmd, ...call.args].join(' ')).toContain(' --tools "" ')
  })

  it('an allowedTools smuggled past the type is ignored — the option no longer exists', async () => {
    setPlatform('linux')
    // @ts-expect-error allowedTools was removed from ClaudeCliOptions (FR-08)
    await inAuth(() => runClaudeCli('prompt', { model: ANY, allowedTools: ['Read'] }))
    expectNoTools(h.spawnCalls[0].args, '')
    expect(h.spawnCalls[0].args).not.toContain('Read')
  })

  describe('through the real call wrappers', () => {
    beforeEach(() => setPlatform('linux'))

    it('copy — ClaudeCliCopyProvider.generateCaptions', async () => {
      await inAuth(() =>
        new ClaudeCliCopyProvider().generateCaptions({
          topic: 't',
          description: 'd',
          goal: 'g',
          tone: 'friendly',
          channels: ['INSTAGRAM'],
        }, ['INSTAGRAM'], siteModel('CAPTION')),
      )
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('design — runDesignAgentCli', async () => {
      h.stdout = '<!doctype html><html><body>x</body></html>'
      await inAuth(() =>
        runDesignAgentCli({ systemPrompt: 's', userMessage: 'u', briefId: 'b1', model: siteModel('DESIGN_FREEFORM'), headline: 'h' }),
      )
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('refine — runDesignAgentCliRefine', async () => {
      await inAuth(() => runDesignAgentCliRefine({ systemPrompt: 's', userMessage: 'u', model: siteModel('REFINE') }))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('briefing — runBriefingModel', async () => {
      await inAuth(() => runBriefingModel('system', [{ role: 'user', content: 'hi' }], 'team-1', siteModel('ASSISTANT_BRIEFING')))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('token-validate — validateClaudeToken', async () => {
      await expect(validateClaudeToken(TOKEN)).resolves.toEqual({ ok: true })
      expectNoTools(h.spawnCalls[0].args, '')
    })
  })
})

describe('AC-14: buildChildEnv is exactly the FR-10 allowlist plus the token', () => {
  const SECRETS = {
    DATABASE_URL: 'postgres://u:p@db/x',
    TOKEN_ENCRYPTION_KEY: 'k',
    MINIO_SECRET_KEY: 'm',
    MINIO_ACCESS_KEY: 'a',
    BETTER_AUTH_SECRET: 'b',
    ANTHROPIC_API_KEY: 'sk-ant-api-x',
    ANTHROPIC_AUTH_TOKEN: 'sk-ant-x',
    FOO_SECRET: 'f',
    OPENAI_API_KEY: 'o',
    // A stale parent token must be replaced, never inherited.
    CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat01-STALE-parent',
  }
  const ALWAYS = {
    PATH: '/usr/bin',
    HOME: '/home/nextjs',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'C.UTF-8',
    TZ: 'UTC',
    TMPDIR: '/tmp',
    NODE_EXTRA_CA_CERTS: '/certs/ca.pem',
    HTTP_PROXY: 'http://proxy:3128',
    HTTPS_PROXY: 'http://proxy:3128',
    NO_PROXY: 'localhost',
    http_proxy: 'http://proxy:3128',
    https_proxy: 'http://proxy:3128',
    no_proxy: 'localhost',
  }
  const WIN32_ONLY = {
    USERPROFILE: 'C:\\Users\\dev',
    APPDATA: 'C:\\Users\\dev\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\dev\\AppData\\Local',
    SystemRoot: 'C:\\WINDOWS',
    ComSpec: 'C:\\WINDOWS\\system32\\cmd.exe',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    TEMP: 'C:\\Temp',
    TMP: 'C:\\Temp',
  }

  it('POSIX: the always-list plus the token; win32-only names and every secret are absent', () => {
    const child = buildChildEnv({ ...ALWAYS, ...WIN32_ONLY, ...SECRETS, NODE_ENV: 'production' }, 'linux', TOKEN)
    expect(child).toEqual({ ...ALWAYS, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_OAUTH_TOKEN: TOKEN })
  })

  it('POSIX: names are matched case-sensitively (Path is not PATH)', () => {
    const child = buildChildEnv({ Path: '/x', path: '/y', Home: '/h' }, 'linux', TOKEN)
    expect(child).toEqual({ DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_OAUTH_TOKEN: TOKEN })
  })

  it('win32: the always-list plus the win32 list plus the token; every secret is absent', () => {
    const child = buildChildEnv({ ...ALWAYS, ...WIN32_ONLY, ...SECRETS, windir: 'C:\\WINDOWS' }, 'win32', TOKEN)
    expect(child).toEqual({ ...ALWAYS, ...WIN32_ONLY, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_OAUTH_TOKEN: TOKEN })
  })

  it('win32: keys match case-insensitively and keep their original casing', () => {
    const parent = {
      Path: 'C:\\Windows',
      SYSTEMROOT: 'C:\\WINDOWS',
      comspec: 'C:\\WINDOWS\\system32\\cmd.exe',
      PathExt: '.EXE',
      Temp: 'C:\\Temp',
      UserProfile: 'C:\\Users\\dev',
      database_url: 'postgres://x',
      Anthropic_Api_Key: 'sk-ant-api-x',
      claude_code_oauth_token: 'sk-ant-oat01-STALE-parent',
    }
    const child = buildChildEnv(parent, 'win32', TOKEN)
    expect(child).toEqual({
      Path: 'C:\\Windows',
      SYSTEMROOT: 'C:\\WINDOWS',
      comspec: 'C:\\WINDOWS\\system32\\cmd.exe',
      PathExt: '.EXE',
      Temp: 'C:\\Temp',
      UserProfile: 'C:\\Users\\dev',
      DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    })
  })

  it('skips undefined parent values', () => {
    expect(buildChildEnv({ PATH: undefined, HOME: '/h' }, 'linux', TOKEN)).toEqual({
      HOME: '/h',
      DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    })
  })

  it.each(['linux', 'win32'] as const)('the real spawn (%s) gets the allowlisted env, not process.env', async (platform) => {
    const saved = { ...process.env }
    Object.assign(process.env, SECRETS)
    try {
      setPlatform(platform)
      await inAuth(() => runClaudeCli('prompt', { model: ANY }))
      const childEnv = h.spawnCalls[0].env
      expect(childEnv).toEqual(buildChildEnv(process.env, platform, TOKEN))
      expect(childEnv.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN)
      for (const k of Object.keys(SECRETS)) {
        if (k === 'CLAUDE_CODE_OAUTH_TOKEN') continue
        expect(Object.keys(childEnv).map((x) => x.toUpperCase())).not.toContain(k)
      }
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]
      Object.assign(process.env, saved)
    }
  })
})

describe('AC-25: claudeCommand per platform and CLAUDE_CLI_PATH', () => {
  it('win32 with no CLAUDE_CLI_PATH → `claude` through the shell (PATHEXT finds .exe or .cmd)', () => {
    expect(claudeCommand('win32', undefined)).toEqual({ cmd: 'claude', shell: true })
  })

  it('POSIX with no CLAUDE_CLI_PATH → `claude`, no shell', () => {
    expect(claudeCommand('linux', undefined)).toEqual({ cmd: 'claude', shell: false })
    expect(claudeCommand('darwin', undefined)).toEqual({ cmd: 'claude', shell: false })
  })

  it('CLAUDE_CLI_PATH set → that path, no shell, on every platform', () => {
    expect(claudeCommand('win32', 'C:\\tools\\claude.exe')).toEqual({ cmd: 'C:\\tools\\claude.exe', shell: false })
    expect(claudeCommand('linux', '/opt/claude')).toEqual({ cmd: '/opt/claude', shell: false })
  })

  it('a POSIX spawn passes the bare empty argument (no shell, so no quotes)', async () => {
    // claudeCommand is the single source the spawn uses; with shell:false the
    // empty argv element reaches the binary intact.
    setPlatform('linux')
    await inAuth(() => runClaudeCli('prompt', { model: ANY }))
    expect(h.spawnCalls[0]).toMatchObject({ cmd: 'claude', shell: false })
    expectNoTools(h.spawnCalls[0].args, '')
  })
})

describe('the 600k guard measures the stdin payload', () => {
  it('the payload written to stdin is the prompt, and an oversized one never spawns', async () => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('hello prompt', { model: ANY }))
    expect(h.spawnCalls[0].stdin).toBe('hello prompt')
    h.spawnCalls.length = 0
    await expect(inAuth(() => runClaudeCli('x'.repeat(600_001), { model: ANY }))).rejects.toThrow('Prompt too large')
    expect(h.spawnCalls).toHaveLength(0)
  })
})

// ─── 005 T6: hardening ────────────────────────────────────────────────────────

const RESULT_OK = (text: string) =>
  JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: text }) + '\n'
const img = (bytes: number) => ({
  type: 'image' as const,
  source: { type: 'base64' as const, media_type: 'image/png', data: Buffer.alloc(bytes, 7).toString('base64') },
})
const MB = 1024 * 1024

describe('T6: every spawn is isolated from settings, hooks, plugins and project context', () => {
  // The flags every spawn carries after `-p --strict-mcp-config --tools <EMPTY>`.
  const isolation = (empty: string) => ['--no-session-persistence', '--safe-mode', '--setting-sources', empty]
  const modes = [
    ['text', () => runClaudeCli('prompt', { model: ANY })],
    ['stream-json', () => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }], { model: ANY })],
  ] as const

  it.each(modes)('%s mode, POSIX: --no-session-persistence --safe-mode --setting-sources ""', async (_m, run) => {
    setPlatform('linux')
    h.stdout = RESULT_OK('ok')
    await inAuth(run)
    expect(h.spawnCalls[0].args.slice(4, 8)).toEqual(isolation(''))
  })

  it.each(modes)('%s mode, win32: the empty --setting-sources value survives the shell join', async (_m, run) => {
    setPlatform('win32')
    h.stdout = RESULT_OK('ok')
    await inAuth(run)
    const call = h.spawnCalls[0]
    expect(call.args.slice(4, 8)).toEqual(isolation('""'))
    expect([call.cmd, ...call.args].join(' ')).toContain(' --setting-sources "" ')
  })

  it('runs in one dedicated, empty temp dir (bistec-cli-*) reused across calls and modes', async () => {
    const { tmpdir } = await import('node:os')
    const { basename, dirname } = await import('node:path')
    const { statSync, readdirSync, realpathSync } = await import('node:fs')
    setPlatform('linux')
    h.stdout = RESULT_OK('ok')
    await inAuth(() => runClaudeCli('one', { model: ANY }))
    await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'two' }], { model: ANY }))
    const [a, b] = h.spawnCalls.map((c) => c.cwd)
    expect(a).toBeTruthy()
    expect(b).toBe(a)
    expect(realpathSync(dirname(a!))).toBe(realpathSync(tmpdir()))
    expect(basename(a!)).toMatch(/^bistec-cli-/)
    expect(statSync(a!).isDirectory()).toBe(true)
    expect(readdirSync(a!)).toEqual([])
  })

  // T6 fix round 1: a tmp cleaner can delete the cached `bistec-cli-*` dir
  // under a long-running server. Spawning into a missing cwd fails with ENOENT,
  // which used to surface as "CLI not found".
  it('re-creates the cached temp cwd when it has vanished (tmp cleaner) instead of spawning into it', async () => {
    const { rmSync, existsSync } = await import('node:fs')
    setPlatform('linux')
    await inAuth(() => runClaudeCli('one', { model: ANY }))
    const first = h.spawnCalls[0].cwd!
    rmSync(first, { recursive: true, force: true })
    let existedAtSpawn = false
    h.onSpawn = (cwd) => (existedAtSpawn = !!cwd && existsSync(cwd))
    await expect(inAuth(() => runClaudeCli('two', { model: ANY }))).resolves.toBe('ok')
    const second = h.spawnCalls[1].cwd!
    expect(second).not.toBe(first)
    expect(existedAtSpawn).toBe(true)
    // …and the fresh dir is the one reused from then on.
    await inAuth(() => runClaudeCli('three', { model: ANY }))
    expect(h.spawnCalls[2].cwd).toBe(second)
  })

  it('a spawn ENOENT because the cwd vanished mid-flight is NOT reported as "CLI not found", and the next call recovers', async () => {
    const { rmSync } = await import('node:fs')
    setPlatform('linux')
    // Delete the cwd at spawn time, after the re-validation, and fail the spawn
    // with the ENOENT a missing cwd produces.
    h.onSpawn = (cwd) => cwd && rmSync(cwd, { recursive: true, force: true })
    h.spawnErrorCode = 'ENOENT'
    const err = await inAuth(() => runClaudeCli('p', { model: ANY })).catch((e: unknown) => e)
    expect((err as Error).message).not.toMatch(/not found on PATH/)
    expect((err as Error).message).toMatch(/working directory/i)
    expect(isClaudeAuthFailure(err)).toBe(false)
    const gone = h.spawnCalls[0].cwd
    h.onSpawn = null
    h.spawnErrorCode = null
    await expect(inAuth(() => runClaudeCli('p', { model: ANY }))).resolves.toBe('ok')
    expect(h.spawnCalls[1].cwd).not.toBe(gone)
  })

  it('a spawn ENOENT with the cwd intact keeps the friendly not-found message (a genuinely missing binary)', async () => {
    setPlatform('linux')
    h.spawnErrorCode = 'ENOENT'
    await expect(inAuth(() => runClaudeCli('p', { model: ANY }))).rejects.toThrow(
      'Claude CLI not found on PATH. Install Claude Code or set CLAUDE_CLI_PATH.',
    )
  })

  it('DISABLE_AUTOUPDATER is the constant "1", never taken from the parent', () => {
    expect(buildChildEnv({ DISABLE_AUTOUPDATER: '0', PATH: '/bin' }, 'linux', TOKEN).DISABLE_AUTOUPDATER).toBe('1')
    expect(buildChildEnv({ disable_autoupdater: '0' }, 'win32', TOKEN)).toEqual({
      DISABLE_AUTOUPDATER: '1',
      CLAUDE_CODE_OAUTH_TOKEN: TOKEN,
    })
  })
})

// 008 T10: the checked value is the ResolvedModel's `arg` (FR-07). A catalogue
// arg always passes; the check is defence in depth for the win32 shell join.
describe('T6: the model name is charset-checked before it can reach argv', () => {
  const bad = ['sonnet; rm -rf /', 'sonnet && calc', 'a b', '$(id)', 'x"y', 'm|n', '%PATH%', 'h^aiku', 'o>p', '`id`']
  it.each(bad)('refuses %j and never spawns', async (arg) => {
    setPlatform('win32')
    await expect(inAuth(() => runClaudeCli('p', { model: { ...ANY, arg } }))).rejects.toThrow(/Invalid Claude model name/)
    expect(h.spawnCalls).toHaveLength(0)
  })

  it.each(['haiku', 'claude-sonnet-4-6', 'claude-sonnet-4-6[1m]', 'us.anthropic.claude-sonnet:1', 'claude_x.y'])(
    'accepts %j verbatim',
    async (arg) => {
      setPlatform('linux')
      await inAuth(() => runClaudeCli('p', { model: { ...ANY, arg } }))
      const args = h.spawnCalls[0].args
      expect(args[args.indexOf('--model') + 1]).toBe(arg)
    },
  )

  it('--model is never omitted: "default" is not special any more, and an empty arg throws', async () => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('p', { model: { ...ANY, arg: 'default' } }))
    expect(h.spawnCalls[0].args.slice(-2)).toEqual(['--model', 'default'])
    await expect(inAuth(() => runClaudeCli('p', { model: { ...ANY, arg: '' } }))).rejects.toThrow(
      /Invalid Claude model name/,
    )
    expect(h.spawnCalls).toHaveLength(1)
  })
})

describe('T6: a missing CLI on win32 (shell:true) gets the friendly not-found error', () => {
  it("maps cmd.exe's \"'claude' is not recognized\" exit to the ENOENT message — not an auth failure", async () => {
    setPlatform('win32')
    h.exitCode = 1
    h.stdout = ''
    h.stderr = "'claude' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n"
    const onAuthFailure = vi.fn(async () => {})
    const err = await runWithClaudeAuth({ ...auth, onAuthFailure }, () => runClaudeCli('p', { model: ANY })).catch((e: unknown) => e)
    expect((err as Error).message).toBe('Claude CLI not found on PATH. Install Claude Code or set CLAUDE_CLI_PATH.')
    expect(err).not.toBeInstanceOf(ClaudeCliError)
    expect(isClaudeAuthFailure(err)).toBe(false)
    expect(onAuthFailure).not.toHaveBeenCalled()
    expect(h.spawnCalls).toHaveLength(1)
  })
})

describe('T6: stdout is decoded as UTF-8 across chunk boundaries', () => {
  it('a Sinhala reply split mid-codepoint arrives intact (text mode)', async () => {
    setPlatform('linux')
    const bytes = Buffer.from('සිංහල පෝස්ට්', 'utf8')
    h.chunks = [bytes.subarray(0, 4), bytes.subarray(4, 11), bytes.subarray(11)]
    await expect(inAuth(() => runClaudeCli('p', { model: ANY }))).resolves.toBe('සිංහල පෝස්ට්')
  })

  it('and in stream-json mode', async () => {
    setPlatform('linux')
    const bytes = Buffer.from(RESULT_OK('සිංහල'), 'utf8')
    const cut = bytes.indexOf(Buffer.from('සිං', 'utf8')) + 1 // inside the first codepoint
    h.chunks = [bytes.subarray(0, cut), bytes.subarray(cut)]
    await expect(inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }], { model: ANY }))).resolves.toBe('සිංහල')
  })
})

describe('T6: stream-json size guards — text only for 600k, 5 MB per image, a total stdin cap', () => {
  beforeEach(() => {
    setPlatform('linux')
    h.stdout = RESULT_OK('ok')
  })

  it('a 2 MB image passes (the 600k guard no longer counts base64)', async () => {
    await expect(
      inAuth(() => runClaudeCliStreamJson([img(2 * MB), { type: 'text', text: 'colour?' }], { model: ANY })),
    ).resolves.toBe('ok')
    expect(h.spawnCalls).toHaveLength(1)
  })

  it('an image of exactly 5 MB passes', async () => {
    await expect(inAuth(() => runClaudeCliStreamJson([img(5 * MB), { type: 'text', text: 'x' }], { model: ANY }))).resolves.toBe('ok')
  })

  it('a 6 MB image is refused, naming its index and size, and never spawns', async () => {
    const err = await inAuth(() =>
      runClaudeCliStreamJson([img(1 * MB), img(6 * MB), { type: 'text', text: 'x' }], { model: ANY }),
    ).catch((e: unknown) => e)
    expect((err as Error).message).toMatch(/image 2 of 2 is 6\.0 MB/i)
    expect((err as Error).message).toMatch(/5 MB/)
    expect(isClaudeAuthFailure(err)).toBe(false)
    expect(h.spawnCalls).toHaveLength(0)
  })

  it('a 700k-char text block is refused and never spawns', async () => {
    await expect(
      inAuth(() => runClaudeCliStreamJson([img(1000), { type: 'text', text: 'x'.repeat(700_000) }], { model: ANY })),
    ).rejects.toThrow(/Prompt too large for CLI mode \(700000 chars > 600000\)/)
    expect(h.spawnCalls).toHaveLength(0)
  })

  it('the text guard sums every text block', async () => {
    await expect(
      inAuth(() =>
        runClaudeCliStreamJson([
          { type: 'text', text: 'x'.repeat(300_000) },
          { type: 'text', text: 'y'.repeat(300_001) },
        ], { model: ANY }),
      ),
    ).rejects.toThrow(/600001 chars/)
  })

  it('the serialized stdin line is capped in total (7 × 4.5 MB images) and never spawns', async () => {
    const content = [...Array.from({ length: 7 }, () => img(4.5 * MB)), { type: 'text' as const, text: 'x' }]
    await expect(inAuth(() => runClaudeCliStreamJson(content, { model: ANY }))).rejects.toThrow(/too large for CLI mode .* MB > 32 MB/)
    expect(h.spawnCalls).toHaveLength(0)
  })
})

describe('T6: scripts/cli-sandbox-check.mjs (AC-16) mirrors the real stream-json spawn', () => {
  // The in-image check cannot import claudeCli.ts (the runner image has only
  // Next's bundled chunks), so it restates the spawn. Pin the two together.
  // 008 T10 (FR-15): VISION_MODEL is the ASSISTANT_BRANDKIT system default's
  // cliArg — the model the brand-kit assistant's vision call runs on with no
  // team default — so a catalogue change shows up here as a drift.
  it('the same argv as a POSIX vision spawn, and the same child env', async () => {
    const { sandboxArgs, VISION_MODEL } = await import('../../scripts/cli-sandbox-check.mjs')
    const vision = siteModel('ASSISTANT_BRANDKIT')
    expect(VISION_MODEL).toBe(entryFor(SYSTEM_DEFAULTS.ASSISTANT_BRANDKIT)!.cliArg)
    expect(VISION_MODEL).toBe(vision.arg)
    setPlatform('linux')
    h.stdout = RESULT_OK('ok')
    await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'x' }], { model: vision }))
    expect(sandboxArgs()).toEqual(h.spawnCalls[0].args)
  })

  // T6 fix round 1: the sample parent env holds EVERY allowlisted name (both
  // platforms' lists) plus secrets, so the script dropping — or adding — any
  // single name fails here, not just the three a small sample happened to use.
  it('the same child env for a parent holding every allowlisted name (both platforms) plus secrets', async () => {
    const { sandboxChildEnv } = await import('../../scripts/cli-sandbox-check.mjs')
    const allowlisted = [...CHILD_ENV_ALWAYS, ...CHILD_ENV_WIN32]
    expect(allowlisted.length).toBeGreaterThan(20)
    const parent: Record<string, string> = Object.fromEntries(allowlisted.map((k) => [k, `value-of-${k}`]))
    Object.assign(parent, {
      DATABASE_URL: 'postgres://x',
      BISTEC_CANARY: 'c',
      TOKEN_ENCRYPTION_KEY: 'k',
      ANTHROPIC_API_KEY: 'sk-ant-api03-FAKE',
      CLAUDE_CODE_OAUTH_TOKEN: 'stale-parent-value',
      DISABLE_AUTOUPDATER: '0',
    })
    const expected = buildChildEnv(parent, 'linux', TOKEN)
    // The real POSIX child carries every POSIX name, so the sample is effective.
    for (const k of CHILD_ENV_ALWAYS) expect(expected[k], k).toBe(`value-of-${k}`)
    expect(sandboxChildEnv(parent, TOKEN)).toEqual(expected)
  })
})

// T6 fix round 1: the in-image check FAILs on any echo of the OAuth token —
// the full value, its recognisable `sk-ant-oat01-…` prefix, or any OAuth
// token-shaped string — as well as on the canaries, anywhere in the output.
describe('T6: scripts/cli-sandbox-check.mjs leakProblems', () => {
  // A fake value — never a real credential.
  const FAKE = 'sk-ant-oat01-FAKEabcdefghijklmnopqrstuvwxyz0123456789'
  const secrets = { token: FAKE, canaries: ['canary-aaaa', 'canary-bbbb'] }

  it('clean output → no problems', async () => {
    const { leakProblems } = await import('../../scripts/cli-sandbox-check.mjs')
    expect(leakProblems('{"type":"result","result":"I cannot read files."}', secrets)).toEqual([])
  })

  it.each([
    ['the full token', `env: CLAUDE_CODE_OAUTH_TOKEN=${FAKE}`],
    ['the token with a few chars cut off the end', FAKE.slice(0, 30)],
    ['the sk-ant-oat01- prefix followed by its chars', `token starts ${FAKE.slice(0, 21)}…`],
    ['another OAuth-token-shaped string', 'sk-ant-oat01-ZZZZZZZZZZZZ'],
  ])('%s → FAIL', async (_name, output) => {
    const { leakProblems } = await import('../../scripts/cli-sandbox-check.mjs')
    expect(leakProblems(output, secrets).join(' ')).toMatch(/token/i)
  })

  it('a canary anywhere → FAIL', async () => {
    const { leakProblems } = await import('../../scripts/cli-sandbox-check.mjs')
    expect(leakProblems('… canary-bbbb …', secrets).join(' ')).toMatch(/canary/i)
  })

  it('the bare prefix alone (no token chars) is not a leak', async () => {
    const { leakProblems } = await import('../../scripts/cli-sandbox-check.mjs')
    expect(leakProblems('tokens look like sk-ant-oat01-…', secrets)).toEqual([])
  })
})

// ─── 008 T5/T10: the ResolvedModel boundary (FR-04, FR-07) ─────────────────────

describe('008 T5/T10: a ResolvedModel at the CLI boundary', () => {
  function resolved(surface: 'CAPTION' | 'DESIGN_FREEFORM', key: 'HAIKU' | 'SONNET' | 'OPUS') {
    const r = decideModel(surface, {
      requested: key,
      policy: { allowed: ['HAIKU', 'SONNET', 'OPUS'], defaults: {}, gateOn: false },
      credential: 'personal',
      mode: 'cli',
    })
    if (!r.ok) throw new Error(r.message)
    return r.resolved
  }
  const SONNET = resolved('DESIGN_FREEFORM', 'SONNET')
  const modelArg = (args: string[]) => args.slice(args.indexOf('--model'), args.indexOf('--model') + 2)

  let records: Array<{ surface: string; arg: string; mode: string; label: string | null }>
  beforeEach(() => {
    setPlatform('linux')
    records = []
    setModelCallSink({ record: (r) => records.push(r), read: () => records as never, clear: () => (records = []) })
  })
  afterEach(() => setModelCallSink(null))

  const modes = [
    ['text', (opts: ClaudeCliOptions) => runClaudeCli('p', opts)],
    ['stream-json', (opts: ClaudeCliOptions) => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }], opts)],
  ] as const

  it.each(modes)('%s mode: --model <arg>, with CLAUDE_CLI_MODEL unset and set', async (_m, run) => {
    h.stdout = RESULT_OK('ok')
    await inAuth(() => run({ model: SONNET }))
    h.envCliModel = 'OPUS'
    await inAuth(() => run({ model: SONNET }))
    expect(h.spawnCalls).toHaveLength(2)
    for (const c of h.spawnCalls) {
      expect(modelArg(c.args)).toEqual(['--model', SONNET.arg])
      expect(c.args.filter((a) => a === '--model')).toHaveLength(1)
    }
  })

  // T10 rewrite of "the string path is unchanged: CLAUDE_CLI_MODEL still
  // overrides it": there is no string path and no override (FR-04).
  it('CLAUDE_CLI_MODEL never reaches the boundary: claudeCli.ts does not read it, and Haiku stays Haiku under OPUS', async () => {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/lib/agent/claudeCli.ts', 'utf8')
    expect(src).not.toMatch(/env.CLAUDE_CLI_MODEL|process.env.CLAUDE_CLI_MODEL/)
    const haiku = internalModel('INTERNAL_VERIFIER', 'cli')
    h.envCliModel = 'OPUS'
    await inAuth(() => runClaudeCli('p', { model: haiku }))
    expect(modelArg(h.spawnCalls[0].args)).toEqual(['--model', haiku.arg])
  })

  // T10 rewrite of "a ResolvedModel with a pinModel flag still runs its own
  // arg": the option is gone, so a stray flag is a type error and inert.
  it('pinModel no longer exists: a flag smuggled past the type changes nothing', async () => {
    const haiku = internalModel('INTERNAL_VERIFIER', 'cli')
    h.envCliModel = 'OPUS'
    // @ts-expect-error pinModel was removed from ClaudeCliOptions (008 T10)
    await inAuth(() => runClaudeCli('p', { model: haiku, pinModel: true }))
    // @ts-expect-error pinModel was removed from ClaudeCliOptions (008 T10)
    await inAuth(() => runClaudeCli('p', { model: SONNET, pinModel: false }))
    expect(modelArg(h.spawnCalls[0].args)).toEqual(['--model', haiku.arg])
    expect(modelArg(h.spawnCalls[1].args)).toEqual(['--model', SONNET.arg])
  })

  it.each(['sonnet; rm -rf /', '$(id)', 'a b', '', '%PATH%'])(
    'a MODEL_NAME_RE violation in a ResolvedModel arg (%j) still throws, never spawns and never records',
    async (arg) => {
      setPlatform('win32')
      for (const [, run] of modes) {
        await expect(inAuth(() => run({ model: { ...SONNET, arg } }))).rejects.toThrow(/Invalid Claude model name/)
      }
      expect(h.spawnCalls).toHaveLength(0)
      expect(records).toHaveLength(0)
    },
  )

  it('timeoutMs defaults to the ResolvedModel timeout; an explicit timeoutMs still wins', async () => {
    h.hang = true
    await expect(inAuth(() => runClaudeCli('p', { model: { ...SONNET, timeoutMs: 30 } }))).rejects.toThrow(
      'Claude CLI timed out after 30ms',
    )
    await expect(
      inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'x' }], { model: { ...SONNET, timeoutMs: 30 } })),
    ).rejects.toThrow('Claude CLI timed out after 30ms')
    await expect(
      inAuth(() => runClaudeCli('p', { model: { ...SONNET, timeoutMs: 60_000 }, timeoutMs: 20 })),
    ).rejects.toThrow('Claude CLI timed out after 20ms')
  })

  it('the catalogue timeout is what reaches the spawn when nothing else is given', async () => {
    // Real catalogue value: the timer is armed with it (seen through a spy, no wait).
    const spy = vi.spyOn(globalThis, 'setTimeout')
    try {
      await inAuth(() => runClaudeCli('p', { model: SONNET }))
      expect(spy.mock.calls.map((c) => c[1])).toContain(SONNET.timeoutMs)
    } finally {
      spy.mockRestore()
    }
  })

  it.each(modes)('%s mode: the recorder sees one record per spawn', async (_m, run) => {
    h.stdout = RESULT_OK('ok')
    await inAuth(() => run({ model: SONNET, label: 'design' }))
    expect(records).toEqual([
      expect.objectContaining({ surface: 'DESIGN_FREEFORM', key: 'SONNET', arg: SONNET.arg, mode: 'cli', source: 'request', label: 'design' }),
    ])
  })

  it('an auth retry (personal → team) records twice — two spawns happened', async () => {
    const teamToken = 'sk-ant-oat01-FAKE-team-token'
    const personal: ClaudeCliAuth = {
      ...auth,
      onAuthFailure: async () => {},
      resolveFallback: async () => ({ token: teamToken, userId: null, teamId: 'team-1', onAuthFailure: async () => {} }),
    }
    h.queue.push({ exitCode: 1, stderr: 'Invalid API key · Please run /login' }, { exitCode: 0, stdout: 'ok' })
    await expect(runWithClaudeAuth(personal, () => runClaudeCli('p', { model: SONNET }))).resolves.toBe('ok')
    expect(h.spawnCalls).toHaveLength(2)
    expect(h.spawnCalls[1].env.CLAUDE_CODE_OAUTH_TOKEN).toBe(teamToken)
    expect(records).toHaveLength(2)
    for (const c of h.spawnCalls) expect(modelArg(c.args)).toEqual(['--model', SONNET.arg])
  })

  // T10 rewrite of "a string or absent model records nothing (the pre-008
  // path)": `model` is a required ResolvedModel, and anything else smuggled
  // past the type is refused before a spawn or a record.
  it.each(modes)('%s mode: a plain string or a missing model is refused — no spawn, no record', async (_m, run) => {
    // @ts-expect-error a plain string is no longer a model (008 T10)
    await expect(inAuth(() => run({ model: 'sonnet' }))).rejects.toThrow(/Invalid Claude model name/)
    // @ts-expect-error model is required (008 T10)
    await expect(inAuth(() => run({}))).rejects.toThrow(/Invalid Claude model name/)
    expect(h.spawnCalls).toHaveLength(0)
    expect(records).toHaveLength(0)
  })
})

// 031 FR-01: vitest workers are killed without an 'exit' event, so remove the
// spawn cwd this file created.
afterAll(async () => {
  const m = (await import('@/lib/agent/claudeCli')) as { cleanupSpawnCwd?: () => void }
  m.cleanupSpawnCwd?.()
})
