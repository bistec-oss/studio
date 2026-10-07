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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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
      setImmediate(() => {
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

// CLI mode for the wrappers that branch on it (briefing, token-validate).
vi.mock('@/lib/agent/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/agent/config')>()),
  isCliMode: () => true,
}))
// runDesignAgentCli renders + uploads after the CLI call — not under test here.
vi.mock('@/lib/renderer/puppeteer', () => ({ renderHtmlToPng: vi.fn(async () => Buffer.from('png')) }))
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
const { modelFor, modelForBackground } = await import('@/lib/agent/config')
const { VERIFIER_MODEL } = await import('@/lib/drafts/refineVerify')

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
    ['copy', { timeoutMs: 120_000, label: 'copy' }],
    ['design', { timeoutMs: 300_000, label: 'design', model: 'sonnet' }],
    ['refine', { timeoutMs: 300_000, label: 'refine', model: 'sonnet' }],
    ['verifier', { label: 'verify', model: VERIFIER_MODEL.cli, pinModel: true, timeoutMs: 60_000 }],
    ['background', { label: 'background', model: modelForBackground('cli'), timeoutMs: 90_000 }],
    ['briefing', { timeoutMs: 180_000, label: 'briefing', model: modelFor('B', 'cli') }],
    ['token-validate', { model: 'haiku', timeoutMs: 60_000, label: 'token-validate', authToken: TOKEN }],
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
    await inAuth(() => runClaudeCli('prompt', { allowedTools: ['Read'] }))
    expectNoTools(h.spawnCalls[0].args, '')
    expect(h.spawnCalls[0].args).not.toContain('Read')
  })

  describe('through the real call wrappers', () => {
    beforeEach(() => setPlatform('linux'))

    it('copy — ClaudeCliCopyProvider.generateCopy', async () => {
      await inAuth(() =>
        new ClaudeCliCopyProvider().generateCopy({
          topic: 't',
          description: 'd',
          goal: 'g',
          tone: 'friendly',
          channels: ['INSTAGRAM'],
        }),
      )
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('design — runDesignAgentCli', async () => {
      h.stdout = '<!doctype html><html><body>x</body></html>'
      await inAuth(() => runDesignAgentCli({ systemPrompt: 's', userMessage: 'u', briefId: 'b1', model: 'sonnet' }))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('refine — runDesignAgentCliRefine', async () => {
      await inAuth(() => runDesignAgentCliRefine({ systemPrompt: 's', userMessage: 'u', model: 'sonnet' }))
      expectNoTools(h.spawnCalls[0].args, '')
    })

    it('briefing — runBriefingModel', async () => {
      await inAuth(() => runBriefingModel('system', [{ role: 'user', content: 'hi' }], 'team-1'))
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
      await inAuth(() => runClaudeCli('prompt'))
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
    await inAuth(() => runClaudeCli('prompt'))
    expect(h.spawnCalls[0]).toMatchObject({ cmd: 'claude', shell: false })
    expectNoTools(h.spawnCalls[0].args, '')
  })
})

describe('the 600k guard measures the stdin payload', () => {
  it('the payload written to stdin is the prompt, and an oversized one never spawns', async () => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('hello prompt'))
    expect(h.spawnCalls[0].stdin).toBe('hello prompt')
    h.spawnCalls.length = 0
    await expect(inAuth(() => runClaudeCli('x'.repeat(600_001)))).rejects.toThrow('Prompt too large')
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
    ['text', () => runClaudeCli('prompt')],
    ['stream-json', () => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }])],
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
    await inAuth(() => runClaudeCli('one'))
    await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'two' }]))
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
    await inAuth(() => runClaudeCli('one'))
    const first = h.spawnCalls[0].cwd!
    rmSync(first, { recursive: true, force: true })
    let existedAtSpawn = false
    h.onSpawn = (cwd) => (existedAtSpawn = !!cwd && existsSync(cwd))
    await expect(inAuth(() => runClaudeCli('two'))).resolves.toBe('ok')
    const second = h.spawnCalls[1].cwd!
    expect(second).not.toBe(first)
    expect(existedAtSpawn).toBe(true)
    // …and the fresh dir is the one reused from then on.
    await inAuth(() => runClaudeCli('three'))
    expect(h.spawnCalls[2].cwd).toBe(second)
  })

  it('a spawn ENOENT because the cwd vanished mid-flight is NOT reported as "CLI not found", and the next call recovers', async () => {
    const { rmSync } = await import('node:fs')
    setPlatform('linux')
    // Delete the cwd at spawn time, after the re-validation, and fail the spawn
    // with the ENOENT a missing cwd produces.
    h.onSpawn = (cwd) => cwd && rmSync(cwd, { recursive: true, force: true })
    h.spawnErrorCode = 'ENOENT'
    const err = await inAuth(() => runClaudeCli('p')).catch((e: unknown) => e)
    expect((err as Error).message).not.toMatch(/not found on PATH/)
    expect((err as Error).message).toMatch(/working directory/i)
    expect(isClaudeAuthFailure(err)).toBe(false)
    const gone = h.spawnCalls[0].cwd
    h.onSpawn = null
    h.spawnErrorCode = null
    await expect(inAuth(() => runClaudeCli('p'))).resolves.toBe('ok')
    expect(h.spawnCalls[1].cwd).not.toBe(gone)
  })

  it('a spawn ENOENT with the cwd intact keeps the friendly not-found message (a genuinely missing binary)', async () => {
    setPlatform('linux')
    h.spawnErrorCode = 'ENOENT'
    await expect(inAuth(() => runClaudeCli('p'))).rejects.toThrow(
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

describe('T6: the model name is charset-checked before it can reach argv', () => {
  const bad = ['sonnet; rm -rf /', 'sonnet && calc', 'a b', '$(id)', 'x"y', 'm|n', '%PATH%', 'h^aiku', 'o>p', '`id`']
  it.each(bad)('refuses %j and never spawns', async (model) => {
    setPlatform('win32')
    await expect(inAuth(() => runClaudeCli('p', { model }))).rejects.toThrow(/Invalid Claude model name/)
    await expect(inAuth(() => runClaudeCli('p', { model, pinModel: true }))).rejects.toThrow(
      /Invalid Claude model name/,
    )
    expect(h.spawnCalls).toHaveLength(0)
  })

  it.each(['haiku', 'claude-sonnet-4-6', 'claude-sonnet-4-6[1m]', 'us.anthropic.claude-sonnet:1', 'claude_x.y'])(
    'accepts %j verbatim',
    async (model) => {
      setPlatform('linux')
      await inAuth(() => runClaudeCli('p', { model }))
      const args = h.spawnCalls[0].args
      expect(args[args.indexOf('--model') + 1]).toBe(model)
    },
  )

  it('"default" and an empty model still omit --model', async () => {
    setPlatform('linux')
    await inAuth(() => runClaudeCli('p', { model: 'default' }))
    await inAuth(() => runClaudeCli('p', { model: '' }))
    expect(h.spawnCalls).toHaveLength(2)
    for (const c of h.spawnCalls) expect(c.args).not.toContain('--model')
  })
})

describe('T6: a missing CLI on win32 (shell:true) gets the friendly not-found error', () => {
  it("maps cmd.exe's \"'claude' is not recognized\" exit to the ENOENT message — not an auth failure", async () => {
    setPlatform('win32')
    h.exitCode = 1
    h.stdout = ''
    h.stderr = "'claude' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n"
    const onAuthFailure = vi.fn(async () => {})
    const err = await runWithClaudeAuth({ ...auth, onAuthFailure }, () => runClaudeCli('p')).catch((e: unknown) => e)
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
    await expect(inAuth(() => runClaudeCli('p'))).resolves.toBe('සිංහල පෝස්ට්')
  })

  it('and in stream-json mode', async () => {
    setPlatform('linux')
    const bytes = Buffer.from(RESULT_OK('සිංහල'), 'utf8')
    const cut = bytes.indexOf(Buffer.from('සිං', 'utf8')) + 1 // inside the first codepoint
    h.chunks = [bytes.subarray(0, cut), bytes.subarray(cut)]
    await expect(inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'hi' }]))).resolves.toBe('සිංහල')
  })
})

describe('T6: stream-json size guards — text only for 600k, 5 MB per image, a total stdin cap', () => {
  beforeEach(() => {
    setPlatform('linux')
    h.stdout = RESULT_OK('ok')
  })

  it('a 2 MB image passes (the 600k guard no longer counts base64)', async () => {
    await expect(
      inAuth(() => runClaudeCliStreamJson([img(2 * MB), { type: 'text', text: 'colour?' }])),
    ).resolves.toBe('ok')
    expect(h.spawnCalls).toHaveLength(1)
  })

  it('an image of exactly 5 MB passes', async () => {
    await expect(inAuth(() => runClaudeCliStreamJson([img(5 * MB), { type: 'text', text: 'x' }]))).resolves.toBe('ok')
  })

  it('a 6 MB image is refused, naming its index and size, and never spawns', async () => {
    const err = await inAuth(() =>
      runClaudeCliStreamJson([img(1 * MB), img(6 * MB), { type: 'text', text: 'x' }]),
    ).catch((e: unknown) => e)
    expect((err as Error).message).toMatch(/image 2 of 2 is 6\.0 MB/i)
    expect((err as Error).message).toMatch(/5 MB/)
    expect(isClaudeAuthFailure(err)).toBe(false)
    expect(h.spawnCalls).toHaveLength(0)
  })

  it('a 700k-char text block is refused and never spawns', async () => {
    await expect(
      inAuth(() => runClaudeCliStreamJson([img(1000), { type: 'text', text: 'x'.repeat(700_000) }])),
    ).rejects.toThrow(/Prompt too large for CLI mode \(700000 chars > 600000\)/)
    expect(h.spawnCalls).toHaveLength(0)
  })

  it('the text guard sums every text block', async () => {
    await expect(
      inAuth(() =>
        runClaudeCliStreamJson([
          { type: 'text', text: 'x'.repeat(300_000) },
          { type: 'text', text: 'y'.repeat(300_001) },
        ]),
      ),
    ).rejects.toThrow(/600001 chars/)
  })

  it('the serialized stdin line is capped in total (7 × 4.5 MB images) and never spawns', async () => {
    const content = [...Array.from({ length: 7 }, () => img(4.5 * MB)), { type: 'text' as const, text: 'x' }]
    await expect(inAuth(() => runClaudeCliStreamJson(content))).rejects.toThrow(/too large for CLI mode .* MB > 32 MB/)
    expect(h.spawnCalls).toHaveLength(0)
  })
})

describe('T6: scripts/cli-sandbox-check.mjs (AC-16) mirrors the real stream-json spawn', () => {
  // The in-image check cannot import claudeCli.ts (the runner image has only
  // Next's bundled chunks), so it restates the spawn. Pin the two together.
  it('the same argv as a POSIX vision spawn, and the same child env', async () => {
    const { sandboxArgs, VISION_MODEL } = await import('../../scripts/cli-sandbox-check.mjs')
    expect(VISION_MODEL).toBe(modelFor('B', 'cli'))
    setPlatform('linux')
    h.stdout = RESULT_OK('ok')
    await inAuth(() => runClaudeCliStreamJson([{ type: 'text', text: 'x' }], { model: modelFor('B', 'cli') }))
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
