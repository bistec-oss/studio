import { spawn } from "child_process"
import { existsSync } from "node:fs"
import { mkdtemp, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StringDecoder } from "node:string_decoder"
import { env } from "@/lib/env"
import { currentClaudeAuth } from "@/lib/agent/claudeAuth"

// Resolve the Claude Code CLI binary (005 FR-17). An explicit CLAUDE_CLI_PATH
// runs directly. On Windows a bare `claude` goes through the shell, so cmd.exe
// resolves it via PATHEXT to either the npm shim (`claude.cmd`) or the winget /
// native installer's `claude.exe` — the old hard-coded `claude.cmd` missed the
// latter. Elsewhere `claude` runs directly. Pure + exported for AC-25.
export function claudeCommand(
  platform: NodeJS.Platform = process.platform,
  cliPath: string | undefined = env.CLAUDE_CLI_PATH,
): { cmd: string; shell: boolean } {
  if (cliPath) return { cmd: cliPath, shell: false }
  if (platform === "win32") return { cmd: "claude", shell: true }
  return { cmd: "claude", shell: false }
}

// The child env is an ALLOWLIST (005 FR-10, NFR-01), never a copy of
// process.env: a denylist misses the next secret someone adds to `.env`, an
// allowlist fails safe. Nothing else reaches the CLI — no DATABASE_URL,
// TOKEN_ENCRYPTION_KEY, MINIO_*, BETTER_AUTH_*, *_SECRET / *_KEY, and never
// ANTHROPIC_* (the CLI prefers ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN over
// CLAUDE_CODE_OAUTH_TOKEN, so a stray one would exit 1 or bill the API).
// HOME matters: the CLI writes config/cache under ~/.claude* (Dockerfile sets a
// writable HOME for the runner user).
// Exported for the drift test that pins scripts/cli-sandbox-check.mjs to it.
export const CHILD_ENV_ALWAYS: readonly string[] = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TZ",
  "TMPDIR",
  "NODE_EXTRA_CA_CERTS",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
]
export const CHILD_ENV_WIN32: readonly string[] = ["USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "ComSpec", "PATHEXT", "TEMP", "TMP"]

type EnvMap = Record<string, string | undefined>

// Pure + exported for AC-14. Win32 env names are case-insensitive (`Path` is
// `PATH`), so there names match case-insensitively and keep the parent's
// original casing; on POSIX they match exactly. The OAuth token is set last,
// so a stale parent value can never win.
//
// On win32, libuv copies a fixed set of system variables from the parent into
// any child env that lacks them (its `required_vars`: SYSTEMROOT, SYSTEMDRIVE,
// TEMP, PATH, USERPROFILE, WINDIR, HOMEDRIVE/HOMEPATH, USERNAME/USERDOMAIN,
// LOGONSERVER). So the child's real env there can hold slightly more than this
// function returns — never a secret, only those fixed, non-secret names.
export function buildChildEnv(
  parentEnv: EnvMap,
  platform: NodeJS.Platform,
  token: string,
): EnvMap {
  const win32 = platform === "win32"
  const allowed = win32 ? [...CHILD_ENV_ALWAYS, ...CHILD_ENV_WIN32] : CHILD_ENV_ALWAYS
  const wanted = new Set(win32 ? allowed.map((k) => k.toUpperCase()) : allowed)
  const child: EnvMap = {}
  for (const [key, value] of Object.entries(parentEnv)) {
    if (value === undefined) continue
    if (wanted.has(win32 ? key.toUpperCase() : key)) child[key] = value
  }
  // A constant, never read from the parent: the pinned container CLI (FR-11)
  // must not replace itself mid-flight.
  child.DISABLE_AUTOUPDATER = "1"
  child.CLAUDE_CODE_OAUTH_TOKEN = token
  return child
}

// `--tools ""` (005 FR-08): an empty built-in tool list, so no CLI child can
// call a tool whatever a prompt injection asks for. With shell:false the empty
// string is its own argv element. With shell:true (win32) Node joins argv with
// spaces and does NO quoting, so a bare "" would vanish from the command line —
// pass the literal two characters `""` so cmd.exe hands claude an empty arg.
function emptyArg(shell: boolean): string {
  return shell ? '""' : ""
}

// The argv every spawn opens with, in both input modes (005 T6), so none of it
// can drift between them:
//   --strict-mcp-config + no --mcp-config   ZERO MCP servers. Without it the
//       child inherits the developer's connectors (Canva, Drive, Atlassian, …):
//       startup latency, dozens of unused tool definitions, higher cost.
//   --tools ""                    no built-in tool (FR-08): pure text in, text out.
//   --no-session-persistence      no transcript under $HOME/.claude/projects/ —
//       without it every -p run writes its whole prompt there, growing without
//       limit in the container.
//   --safe-mode                   no CLAUDE.md, skills, installed plugins, hooks,
//       custom commands/agents or output styles. Auth, model selection and
//       built-in tools (none, here) work normally.
//   --setting-sources ""          no user, project or local settings files —
//       and so no hooks or enabled plugins they declare. Admin-managed policy
//       settings still apply.
// Both settings flags were verified against CLI 2.1.287 (005 reports/T6.md):
// with them a stream-json run emits no hook events and loads no user plugin,
// and auth still works. The spawn also runs in an empty temp cwd (spawnCwd), so
// no project CLAUDE.md or .claude/settings*.json is in reach either way.
function baseArgs(shell: boolean): string[] {
  return [
    "-p",
    "--strict-mcp-config",
    "--tools",
    emptyArg(shell),
    "--no-session-persistence",
    "--safe-mode",
    "--setting-sources",
    emptyArg(shell),
  ]
}

// The spawn's working directory: one dedicated, empty temp dir per process
// (`<os.tmpdir()>/bistec-cli-*`), created on first use and reused. Running in
// the app's own cwd would put the repo's CLAUDE.md and .claude/settings*.json
// in the CLI's reach. A failed creation is not cached, so the next call retries.
//
// The cached dir is re-checked before every reuse (005 T6 fix round 1): a tmp
// cleaner (systemd-tmpfiles, a Windows disk cleanup) can delete it under a
// long-running server, and a spawn into a missing cwd fails with ENOENT —
// which would otherwise read as "Claude CLI not found". A vanished dir is
// simply re-created.
let spawnCwdPromise: Promise<string> | undefined
function freshSpawnCwd(): Promise<string> {
  const created: Promise<string> = mkdtemp(join(tmpdir(), "bistec-cli-")).catch((err: unknown) => {
    if (spawnCwdPromise === created) spawnCwdPromise = undefined
    throw err
  })
  spawnCwdPromise = created
  return created
}
async function spawnCwd(): Promise<string> {
  const cached = spawnCwdPromise
  if (!cached) return freshSpawnCwd()
  const dir = await cached
  const present = await stat(dir).then(
    (s) => s.isDirectory(),
    () => false,
  )
  if (present) return dir
  // Another call may already have replaced it; only reset what we observed.
  return spawnCwdPromise === cached ? freshSpawnCwd() : spawnCwd()
}

// Model the spawned `claude -p` runs under. Precedence:
//   1. CLAUDE_CLI_MODEL env — a GLOBAL override across every `claude -p` call
//      (handy for testing all stages on one model).
//   2. the per-call `model` passed by the caller — this is where the per-path
//      split lives (Path A design → "haiku", Path B design → "sonnet"; see the
//      design call sites), matching the API path (runDesignAgent).
//   3. fallback "haiku" for calls that pass no model (e.g. copy).
// Accepts a CLI alias ("sonnet"/"opus"/"haiku") or a full model id. A value of
// "default" (from either source) omits --model and uses the account default
// (the costly Opus tier) — the reason we never want that implicitly.
//
// Any other value must match MODEL_NAME_RE or the call throws before spawning
// (005 T6): on win32 argv is joined into a cmd.exe command line with no quoting,
// so a model string is the one argv value a user may one day choose (008) that
// could carry shell syntax. Aliases, full ids, `[1m]` suffixes and
// provider-prefixed ids (`us.anthropic.…:1`) all pass.
const MODEL_NAME_RE = /^[A-Za-z0-9._:\-[\]]+$/
function claudeModelArgs(explicitModel?: string, pinned = false): string[] {
  // A pinned call (the refine add-verifier, change 004 FR-14b) runs on exactly
  // the model it names: the global override must not route it elsewhere.
  const pinnedModel = pinned ? explicitModel?.trim() : undefined
  const override = (env.CLAUDE_CLI_MODEL ?? "").trim()
  const model = pinnedModel || override || (explicitModel ?? "haiku").trim()
  if (!model || (!pinnedModel && model.toLowerCase() === "default")) return []
  if (!MODEL_NAME_RE.test(model)) {
    throw new Error(
      `Invalid Claude model name ${JSON.stringify(model.slice(0, 80))}: only letters, digits and . _ : - [ ] are allowed.`,
    )
  }
  return ["--model", model]
}

export interface ClaudeCliOptions {
  timeoutMs?: number
  maxBuffer?: number
  // Short tag for log lines so concurrent/sequential CLI calls are distinguishable
  // (e.g. "copy", "design:pathB"). Purely diagnostic.
  label?: string
  // Per-call model (CLI alias or full id). Path A design passes "haiku", Path B
  // "sonnet". Overridden by CLAUDE_CLI_MODEL when that env var is set.
  model?: string
  // When true, `model` is used verbatim and CLAUDE_CLI_MODEL does NOT override
  // it. Only for calls whose model is a fixed policy rather than a preference —
  // the refine add-verifier is pinned to Haiku (change 004 FR-14b).
  pinModel?: boolean
  // There is deliberately NO tools option (005 FR-08): every spawn passes
  // `--tools ""`, so no caller can opt a headless run — which executes with the
  // server's privileges — back into a tool without a reviewed code change.
  // Explicit OAuth token override: bypasses the per-user ALS auth context AND
  // the retry-once-with-shared behaviour. Used only by validateClaudeToken()
  // (userToken.ts) to test a candidate token — normal call sites never set it.
  authToken?: string
}

// A CLI run that failed, with what the auth classifier may read attached.
// Timeout/ENOENT/buffer-limit/size-guard failures stay plain Errors — they say
// nothing about the token's validity.
//
// The contract (isClaudeAuthFailure reads ONLY these):
//   exitCode        the process exit code; null for a stream-json run that
//                   reported is_error but exited 0 (so it is still classified).
//   stderr          the CLI's own stderr.
//   stdout          text-mode: the raw stdout of the failed run. stream-json:
//                   ONLY the `result` text of an is_error result event — never
//                   assistant (model-written) text and never non-JSON lines.
//   apiErrorStatus  stream-json: the result event's `api_error_status`.
// `diagnostic` is for humans and logs only and is never classified: it may
// hold model text, which could say "401" or "invalid API key" because an
// attacker-influenced reference image did.
export class ClaudeCliError extends Error {
  public apiErrorStatus: number | null
  public diagnostic: string
  constructor(
    message: string,
    public exitCode: number | null,
    public stderr: string,
    public stdout: string,
    extra: { apiErrorStatus?: number | null; diagnostic?: string } = {},
  ) {
    super(message)
    this.name = "ClaudeCliError"
    this.apiErrorStatus = extra.apiErrorStatus ?? null
    this.diagnostic = extra.diagnostic ?? ""
  }
}

// Does this error mean the OAuth token was rejected (expired/revoked/garbage)?
// Pure + exported for unit tests. Deliberately conservative — a false positive
// marks a good personal token INVALID — so:
//   - only a ClaudeCliError with a non-zero (or null) exit code;
//   - a structured API status decides: 401 is an auth failure; 403 is one
//     ONLY when the is_error result text says the OAuth token was revoked
//     (the pinned CLI 2.1.287 reports a revoked token as 403 — its own check
//     is `status===403 && text includes "OAuth token has been revoked"`, and
//     it renders "OAuth token revoked · Please run /login"); any other 403 is
//     a permission or plan error, and any other status is never one, whatever
//     the text says. The 403 test reads `stdout` only, which for a
//     stream-json run is the CLI-written text of an is_error result and never
//     model text (the field contract on ClaudeCliError); apiErrorStatus is
//     only ever set by a stream-json run;
//   - with no status, a known auth phrasing in stderr / stdout (see the field
//     contract on ClaudeCliError — never model text) decides.
// Timeouts, the size guards, buffer limits and generic exits never qualify.
const AUTH_FAILURE_RE =
  /oauth token (is )?(invalid|expired|revoked)|invalid api key|please run \/login|authentication[_ ]?error|not (logged in|authenticated)|\b401\b/i
const REVOKED_TOKEN_RE = /oauth (access )?token (has been )?revoked/i
export function isClaudeAuthFailure(err: unknown): boolean {
  if (!(err instanceof ClaudeCliError)) return false
  if (err.exitCode === 0) return false
  if (err.apiErrorStatus !== null) {
    return err.apiErrorStatus === 401 || (err.apiErrorStatus === 403 && REVOKED_TOKEN_RE.test(err.stdout))
  }
  return AUTH_FAILURE_RE.test(`${err.stderr}\n${err.stdout}`)
}

// Dev-mode diagnostics. CLI mode is a local dev convenience, so log by default;
// set CLAUDE_CLI_DEBUG=0 to silence. Logs spawn details, a liveness heartbeat,
// streamed stderr, and the final outcome with elapsed time — so a timeout is
// debuggable instead of opaque.
const CLI_DEBUG = env.CLAUDE_CLI_DEBUG !== "0"
function cliLog(label: string, msg: string) {
  if (CLI_DEBUG) console.log(`[claudeCli${label ? ":" + label : ""}] ${msg}`)
}

// Kill the entire spawned process TREE. On Windows the CLI runs via a `cmd.exe`
// shell (`claude` resolved via PATHEXT), so child.kill() only signals the shell — the underlying
// `claude` (node) process keeps running to completion and KEEPS BURNING CREDITS
// after we've already timed out. taskkill /T tears down the whole tree; on POSIX
// a SIGKILL to the child suffices.
function killTree(child: ReturnType<typeof spawn>, label: string) {
  if (!child.pid) {
    child.kill("SIGKILL")
    return
  }
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true })
    } catch (e) {
      cliLog(label, `taskkill failed, falling back to child.kill(): ${(e as Error).message}`)
      child.kill("SIGKILL")
    }
  } else {
    child.kill("SIGKILL")
  }
}

// Runs the local Claude Code CLI headlessly and returns stdout. Used in CLI mode
// (DESIGN_PROVIDER=cli) to drive copy + design generation through the local
// Claude session instead of the Anthropic API — no API key required.
//
// The prompt is piped via STDIN (not argv): design prompts routinely exceed the
// Windows command-line length limit (~8191 chars under cmd.exe), which would
// silently truncate an argv-passed prompt. STDIN also avoids all shell quoting.
// Conservative input ceiling. The model's context is ~200k tokens; past roughly
// this many characters a single-shot CLI prompt fails opaquely (exit 1). Guard so
// callers get an actionable message instead — e.g. an oversized brand template.
// It measures TEXT only: the text-mode prompt, or the sum of a stream-json
// message's text blocks. Image base64 never counts (005 T6) — image tokens are
// priced by pixels, not by base64 length; images have their own caps below.
const MAX_PROMPT_CHARS = 600_000

function assertPromptSize(chars: number, hint: string): void {
  if (chars > MAX_PROMPT_CHARS) {
    throw new Error(`Prompt too large for CLI mode (${chars} chars > ${MAX_PROMPT_CHARS}). ` + hint)
  }
}

export async function runClaudeCli(prompt: string, opts: ClaudeCliOptions = {}): Promise<string> {
  return withAuthRetry(opts, (token) => runClaudeCliOnce(prompt, opts, token))
}

// The personal → team auth-retry wrapper, shared by both entry points (text
// mode and stream-json mode). `attempt` runs one spawn under the
// token it is handed (undefined ⇒ spawnClaude reads the ALS context, and with
// none throws the no-credential error).
async function withAuthRetry<T>(
  opts: Pick<ClaudeCliOptions, "authToken" | "label">,
  attempt: (token: string | undefined) => Promise<T>,
): Promise<T> {
  // Token-validation path: run once with the candidate token, never retry.
  if (opts.authToken) return attempt(opts.authToken)

  // Per-user/team auth (set at the route entry via withClaudeAuth — see
  // claudeAuth.ts for the ALS design note). Absent context ⇒ the spawn core
  // itself throws the no-credential error below — there is no further tier.
  const auth = currentClaudeAuth()
  if (!auth) return attempt(undefined)

  try {
    return await attempt(auth.token)
  } catch (err) {
    if (!isClaudeAuthFailure(err)) throw err
    // The primary token was rejected (expired/revoked). Mark it invalid so the
    // owner is prompted to reconnect, then fall back ONE tier (personal → team)
    // so this call can still complete. One retry only; a second failure surfaces.
    cliLog(
      opts.label ?? "",
      `auth failure for ${auth.userId ? `user ${auth.userId}` : `team ${auth.teamId}`} — marking credential invalid, trying the next tier`,
    )
    await auth.onAuthFailure().catch((e: unknown) => {
      cliLog(opts.label ?? "", `failed to mark credential invalid: ${(e as Error).message}`)
    })
    const fallback = auth.resolveFallback ? await auth.resolveFallback() : null
    if (!fallback) throw err
    try {
      return await attempt(fallback.token)
    } catch (err2) {
      if (isClaudeAuthFailure(err2)) {
        await fallback.onAuthFailure().catch((e: unknown) => {
          cliLog(opts.label ?? "", `failed to mark team credential invalid: ${(e as Error).message}`)
        })
      }
      throw err2
    }
  }
}

// One text-mode attempt: the prompt is the whole stdin payload.
export async function runClaudeCliOnce(
  prompt: string,
  opts: ClaudeCliOptions,
  tokenOverride: string | undefined,
): Promise<string> {
  assertPromptSize(prompt.length, "This usually means the brand template is too big — use a smaller template or Path B.")
  const command = claudeCommand()
  const args = [...baseArgs(command.shell), ...claudeModelArgs(opts.model, opts.pinModel)]
  return spawnClaude(args, prompt, { ...opts, command, tokenOverride })
}

// ─── stream-json mode (005 FR-09) ────────────────────────────────────────────
//
// The only way to hand a headless `claude -p` an image with no tool and no
// file: one stream-json user message on stdin whose content holds base64 image
// blocks beside the text. Contract, per Anthropic's docs and verified locally
// against CLI 2.1.287 (see .specclaw/changes/005-…/reports/T5.md):
//   https://code.claude.com/docs/en/cli-reference   (--input-format / --output-format
//                                                    stream-json; stream-json output
//                                                    needs --verbose under -p)
//   https://code.claude.com/docs/en/headless        ("The last line of the stream is a
//                                                    `result` message"; a failure inside
//                                                    the run, e.g. missing auth, is
//                                                    printed as the result on stdout)
//   https://code.claude.com/docs/en/agent-sdk/typescript  (SDKUserMessage, SDKResultMessage)
// Input: one line `{"type":"user","message":{"role":"user","content":[...]}}`.
// Output: NDJSON — system/init, hook and retry events, one or more `assistant`
// messages, then a terminal `{"type":"result","subtype":"success",
// "is_error":false,"result":"<text>",…}`. A rejected token arrives as exit 1
// with a `result` event of subtype "success" but is_error true, its text
// "Failed to authenticate. API Error: 401 …", and `api_error_status: 401` —
// nothing on stderr. The schema can drift between CLI versions, which is why
// the container pins one (FR-11).

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }

// Image caps for stream-json mode (005 T6). Each image's decoded size is capped
// at 5 MB, so a reference image too big for CLI mode is refused up front by
// index and size rather than failing opaquely. The whole serialized stdin line
// is capped at 32 MB: CLI 2.1.287 accepted a 67 MB line in a local test (no
// stdin limit was found — reports/T6.md), so this is headroom against memory
// and against the Messages API's own 32 MB request limit, not a CLI limit.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_STREAM_JSON_BYTES = 32 * 1024 * 1024

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

// Decoded size of a base64 string, without decoding it.
function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0
  return Math.floor((data.length * 3) / 4) - padding
}

// Validates a stream-json message's size and returns its one stdin line.
// Throws a plain Error (never classified as an auth failure) before any spawn.
function streamJsonLine(content: ContentBlock[]): string {
  const textChars = content.reduce((n, b) => n + (b.type === "text" ? b.text.length : 0), 0)
  assertPromptSize(textChars, "Shorten the prompt text.")
  const images = content.filter((b) => b.type === "image")
  images.forEach((b, i) => {
    const bytes = base64Bytes(b.source.data)
    if (bytes > MAX_IMAGE_BYTES) {
      throw new Error(
        `Reference image ${i + 1} of ${images.length} is ${mb(bytes)} — the limit is 5 MB per image in CLI mode. Use a smaller image.`,
      )
    }
  })
  // Exactly one user message, then stdin ends — the CLI answers it and exits.
  const line = JSON.stringify({ type: "user", message: { role: "user", content } }) + "\n"
  const lineBytes = Buffer.byteLength(line, "utf8")
  if (lineBytes > MAX_STREAM_JSON_BYTES) {
    throw new Error(
      `Message too large for CLI mode (${mb(lineBytes)} > ${MAX_STREAM_JSON_BYTES / (1024 * 1024)} MB). ` +
        "The reference images are too big together — use fewer or smaller images.",
    )
  }
  return line
}

export async function runClaudeCliStreamJson(content: ContentBlock[], opts: ClaudeCliOptions = {}): Promise<string> {
  const line = streamJsonLine(content)
  return withAuthRetry(opts, (token) => runClaudeCliStreamJsonOnce(line, opts, token))
}

async function runClaudeCliStreamJsonOnce(
  line: string,
  opts: ClaudeCliOptions,
  tokenOverride: string | undefined,
): Promise<string> {
  const command = claudeCommand()
  const args = [
    ...baseArgs(command.shell),
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    ...claudeModelArgs(opts.model, opts.pinModel),
  ]
  return spawnClaude(args, line, { ...opts, command, tokenOverride, finalize: finalizeStreamJson })
}

interface StreamJsonResultEvent {
  type: "result"
  subtype?: string
  is_error?: boolean
  result?: unknown
  errors?: unknown
  api_error_status?: number | null
}

export interface ParsedStreamJson {
  // The LAST `result` event — the terminal one. Assistant messages before it
  // never count, however many there are.
  result: StreamJsonResultEvent | null
  // Text blocks of the assistant messages and any non-JSON lines: kept only
  // to explain a failure, never returned as an answer.
  assistantText: string[]
  nonJson: string[]
}

// Pure + exported. Parses the whole buffered stdout at close, so a line split
// across `data` chunks is reassembled before it is parsed; a final line with
// no trailing newline still parses.
export function parseStreamJson(stdout: string): ParsedStreamJson {
  const parsed: ParsedStreamJson = { result: null, assistantText: [], nonJson: [] }
  for (const raw of stdout.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    let ev: unknown
    try {
      ev = JSON.parse(line)
    } catch {
      parsed.nonJson.push(line)
      continue
    }
    if (!ev || typeof ev !== "object") continue
    const e = ev as { type?: unknown; message?: { content?: unknown } }
    if (e.type === "result") parsed.result = ev as StreamJsonResultEvent
    else if (e.type === "assistant" && Array.isArray(e.message?.content)) {
      for (const b of e.message.content as Array<{ type?: unknown; text?: unknown }>) {
        if (b?.type === "text" && typeof b.text === "string") parsed.assistantText.push(b.text)
      }
    }
  }
  return parsed
}

// Turns a finished stream-json run into its answer or a ClaudeCliError.
//
// What the auth classifier may read is narrow (see ClaudeCliError): never the
// raw NDJSON — it is full of numbers (durations, token counts) and base64
// signatures, any of which could contain `401` — and never assistant text or
// non-JSON lines, which are model-written or unknown: a reply that read "Room
// 401" off a reference image must not mark a good token invalid when the run
// then ends without a result (a crash, a kill, a schema drift). Those go to the
// human-only `diagnostic`. Classification rests on the result event alone:
// its `api_error_status`, else its text — and only when it says is_error.
//
// Exit code: kept as-is, except that an is_error result on a run that exited 0
// gets null, so the classifier still reads it (it treats exit 0 as "not an
// auth failure"). The real 2.1.287 auth failure is exactly that shape's
// sibling: exit 1, is_error true, api_error_status 401.
function finalizeStreamJson({ code, stdout, stderr }: SpawnResult): string {
  const { result, assistantText, nonJson } = parseStreamJson(stdout)
  const diagnostic = (parts: unknown[]) =>
    parts
      .flat()
      .filter((p) => p !== undefined && p !== null && p !== "")
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join("\n")

  if (!result) {
    throw new ClaudeCliError(
      `Claude CLI stream-json run ended with no result event (exit code ${code}): ${stderr.trim().slice(0, 500)}`,
      code,
      stderr,
      "",
      { diagnostic: diagnostic([assistantText, nonJson]) },
    )
  }
  const text = typeof result.result === "string" ? result.result : ""
  if (result.is_error || result.subtype !== "success") {
    const isError = result.is_error === true
    throw new ClaudeCliError(
      `Claude CLI reported an error (subtype=${result.subtype ?? "none"}, exit code ${code}): ${(text || diagnostic([result.errors])).slice(0, 500)}`,
      isError && code === 0 ? null : code,
      stderr,
      isError ? text : "",
      {
        apiErrorStatus: typeof result.api_error_status === "number" ? result.api_error_status : null,
        diagnostic: diagnostic([
          text,
          result.errors,
          result.api_error_status != null ? `api_error_status: ${result.api_error_status}` : undefined,
          assistantText,
          nonJson,
        ]),
      },
    )
  }
  return text.trim()
}

interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

// Text mode: a non-zero exit is a ClaudeCliError carrying the raw output;
// otherwise stdout IS the answer.
function finalizeText({ code, stdout, stderr }: SpawnResult): string {
  if (code !== 0) {
    throw new ClaudeCliError(`Claude CLI exited with code ${code}: ${stderr.trim().slice(0, 500)}`, code, stderr, stdout)
  }
  return stdout.trim()
}

interface SpawnClaudeOptions extends Pick<ClaudeCliOptions, "timeoutMs" | "maxBuffer" | "label"> {
  command: { cmd: string; shell: boolean }
  tokenOverride: string | undefined
  // How a finished run (any exit code) becomes the answer or an error. The
  // input mode owns this; everything before it is shared.
  finalize?: (r: SpawnResult) => string
}

const NOT_FOUND_MESSAGE = "Claude CLI not found on PATH. Install Claude Code or set CLAUDE_CLI_PATH."
// With shell:true (win32) a missing binary is not ENOENT: cmd.exe starts fine,
// prints this and exits 1.
const CMD_NOT_RECOGNIZED_RE = /is not recognized as an internal or external command/i

// The one spawn core: the credential, the allowlisted child env, the isolated
// cwd, the timeout / kill-tree / buffer limit, UTF-8 decoding, logging and the
// error mapping. Every input mode goes through here, so none of it can drift
// between modes. Each mode checks its own input size before calling in.
async function spawnClaude(args: string[], stdinPayload: string, opts: SpawnClaudeOptions): Promise<string> {
  const {
    command,
    tokenOverride,
    timeoutMs = 180_000,
    maxBuffer = 16 * 1024 * 1024,
    label = "",
    finalize = finalizeText,
  } = opts
  const { cmd, shell } = command

  // CLI-mode auth is REQUIRED — there is no env/dev-session fallback tier.
  // Order of preference:
  //   1. tokenOverride — the acting user's personal token, or the team token
  //      passed in by withAuthRetry after a personal-token auth failure, or a
  //      candidate token under validation (opts.authToken).
  //   2. currentClaudeAuth()?.token — the ALS auth context set by
  //      withClaudeAuth (userToken.ts), read directly when no override was
  //      passed in (the no-auth-context path in withAuthRetry above).
  // Neither present ⇒ no credential exists for this call (no personal token
  // and no team token) — throw rather than spawn silently unauthenticated.
  // The token travels via env, never argv (argv would leak through `shell: true`
  // on win32 and process listings).
  const oauthToken = tokenOverride ?? currentClaudeAuth()?.token
  if (!oauthToken) {
    throw new ClaudeCliError(
      "No Claude credential available — connect a personal token in Settings or set the team token in Team Settings",
      null,
      "",
      "",
    )
  }
  const childEnv = buildChildEnv(process.env, process.platform, oauthToken)
  const cwd = await spawnCwd()

  const modelIdx = args.indexOf("--model")
  const resolvedModel = modelIdx >= 0 ? args[modelIdx + 1] : "(account default)"
  const startedAt = Date.now()
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`

  cliLog(
    label,
    `spawn ${cmd} ${args.join(" ")} · model=${resolvedModel} · stdin=${stdinPayload.length} chars · timeout=${timeoutMs}ms`,
  )

  return new Promise<string>((resolve, reject) => {
    // The cast only drops Next's required NODE_ENV: the child deliberately has none.
    const child = spawn(cmd, args, { shell, windowsHide: true, cwd, env: childEnv as NodeJS.ProcessEnv })
    // Decode as UTF-8 across chunk boundaries: a multibyte character (Sinhala,
    // emoji) split between two `data` events would otherwise become U+FFFD.
    const stdoutDecoder = new StringDecoder("utf8")
    const stderrDecoder = new StringDecoder("utf8")

    let stdout = ""
    let stderr = ""
    let settled = false
    let sawOutput = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(heartbeat)
      fn()
    }

    const timer = setTimeout(() => {
      // Tear down the whole process tree, not just the shell — otherwise `claude`
      // keeps running (and billing) after we've returned a timeout error.
      cliLog(label, `TIMEOUT after ${elapsed()} (limit ${timeoutMs}ms) — killing process tree (pid ${child.pid}). stderr so far: ${stderr.trim().slice(-300) || "(none)"}`)
      killTree(child, label)
      finish(() => reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`)))
    }, timeoutMs)

    // Periodic liveness ping so a long/stuck run is visible instead of silent.
    const heartbeat = setInterval(() => {
      cliLog(label, `still running ${elapsed()} · stdout=${stdout.length}B stderr=${stderr.length}B${sawOutput ? "" : " (no output yet)"}`)
    }, 20_000)

    child.stdout.on("data", (d: Buffer) => {
      if (!sawOutput) {
        sawOutput = true
        cliLog(label, `first stdout byte at ${elapsed()}`)
      }
      stdout += stdoutDecoder.write(d)
      if (stdout.length > maxBuffer) {
        cliLog(label, `output exceeded buffer (${maxBuffer}B) at ${elapsed()} — killing process tree`)
        killTree(child, label)
        finish(() => reject(new Error("Claude CLI output exceeded buffer limit")))
      }
    })
    child.stderr.on("data", (d: Buffer) => {
      const chunk = stderrDecoder.write(d)
      stderr += chunk
      // Surface CLI diagnostics live (auth prompts, trust dialogs, errors) — these
      // are the usual cause of an otherwise-silent hang/timeout.
      cliLog(label, `stderr: ${chunk.trim().slice(0, 300)}`)
    })

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() => {
        if (err.code !== "ENOENT") return reject(new Error(`Claude CLI failed: ${err.message}`))
        // A spawn into a missing cwd is ENOENT too. spawnCwd() re-checked it
        // just before, so this is a dir deleted in between: say so (the next
        // call's re-check re-creates it), and keep the not-found message for a
        // genuinely missing binary.
        if (!existsSync(cwd)) {
          return reject(
            new Error(`Claude CLI working directory ${cwd} disappeared before the spawn (a temp cleaner?). Retry the request.`),
          )
        }
        reject(new Error(NOT_FOUND_MESSAGE))
      })
    })

    child.on("close", (code: number | null) => {
      finish(() => {
        stdout += stdoutDecoder.end()
        stderr += stderrDecoder.end()
        if (code !== 0) cliLog(label, `exited code=${code} at ${elapsed()}`)
        if (code !== 0 && shell && CMD_NOT_RECOGNIZED_RE.test(stderr)) {
          reject(new Error(NOT_FOUND_MESSAGE))
          return
        }
        try {
          const answer = finalize({ code, stdout, stderr })
          cliLog(label, `done at ${elapsed()} · ${answer.length} chars`)
          resolve(answer)
        } catch (err) {
          if (code === 0) cliLog(label, `exited 0 but failed at ${elapsed()}: ${(err as Error).message.slice(0, 300)}`)
          reject(err)
        }
      })
    })

    child.stdin.on("error", () => {
      /* ignore EPIPE if the child exits before stdin is fully written */
    })
    child.stdin.write(stdinPayload)
    child.stdin.end()
  })
}

// Claude sometimes wraps output in markdown fences despite instructions.
// Strip a single enclosing ``` ... ``` block (optionally language-tagged).
export function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const m = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/)
  return m ? m[1].trim() : trimmed
}
