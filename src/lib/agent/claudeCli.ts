import { spawn } from "child_process"
import { env } from "@/lib/env"

// Resolve the Claude Code CLI binary. On Windows the npm shim is `claude.cmd`,
// which needs a shell to launch; elsewhere `claude` runs directly.
function claudeCommand(): { cmd: string; shell: boolean } {
  if (env.CLAUDE_CLI_PATH) return { cmd: env.CLAUDE_CLI_PATH, shell: false }
  if (process.platform === "win32") return { cmd: "claude.cmd", shell: true }
  return { cmd: "claude", shell: false }
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
function claudeModelArgs(explicitModel?: string): string[] {
  const override = (env.CLAUDE_CLI_MODEL ?? "").trim()
  const model = override || (explicitModel ?? "haiku").trim()
  if (!model || model.toLowerCase() === "default") return []
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
// shell (`claude.cmd`), so child.kill() only signals the shell — the underlying
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
const MAX_PROMPT_CHARS = 600_000

export async function runClaudeCli(prompt: string, opts: ClaudeCliOptions = {}): Promise<string> {
  const { cmd, shell } = claudeCommand()
  const { timeoutMs = 180_000, maxBuffer = 16 * 1024 * 1024, label = "", model } = opts

  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Prompt too large for CLI mode (${prompt.length} chars > ${MAX_PROMPT_CHARS}). ` +
        `This usually means the brand template is too big — use a smaller template or Path B.`,
    )
  }

  // CLI mode authenticates via the developer's local Claude Code (claude.ai)
  // login — the whole point is keyless operation. If ANTHROPIC_API_KEY (or an
  // auth token) is present in the server env, the spawned `claude` CLI prefers
  // it as the auth source; an invalid/placeholder key then makes `claude -p`
  // exit 1. Strip those vars from the child env so it uses the logged-in session.
  const childEnv = { ...process.env }
  delete childEnv.ANTHROPIC_API_KEY
  delete childEnv.ANTHROPIC_AUTH_TOKEN

  // --strict-mcp-config + no --mcp-config => load ZERO MCP servers. Without it the
  // spawned CLI inherits the developer's full Claude Code config (Canva, Google
  // Drive, Atlassian, … connectors), adding startup latency, bloating the prompt
  // context with dozens of unused tool definitions, and raising token cost — none
  // of which a single-shot HTML/copy generation needs.
  const modelArgs = claudeModelArgs(model)
  const args = ["-p", "--strict-mcp-config", ...modelArgs]
  const resolvedModel = modelArgs.length ? modelArgs[1] : "(account default)"
  const startedAt = Date.now()
  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`

  cliLog(
    label,
    `spawn ${cmd} ${args.join(" ")} · model=${resolvedModel} · prompt=${prompt.length} chars · timeout=${timeoutMs}ms`,
  )

  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { shell, windowsHide: true, env: childEnv })

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
      stdout += d.toString()
      if (stdout.length > maxBuffer) {
        cliLog(label, `output exceeded buffer (${maxBuffer}B) at ${elapsed()} — killing process tree`)
        killTree(child, label)
        finish(() => reject(new Error("Claude CLI output exceeded buffer limit")))
      }
    })
    child.stderr.on("data", (d: Buffer) => {
      const chunk = d.toString()
      stderr += chunk
      // Surface CLI diagnostics live (auth prompts, trust dialogs, errors) — these
      // are the usual cause of an otherwise-silent hang/timeout.
      cliLog(label, `stderr: ${chunk.trim().slice(0, 300)}`)
    })

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish(() =>
        reject(
          err.code === "ENOENT"
            ? new Error("Claude CLI not found on PATH. Install Claude Code or set CLAUDE_CLI_PATH.")
            : new Error(`Claude CLI failed: ${err.message}`),
        ),
      )
    })

    child.on("close", (code: number | null) => {
      finish(() => {
        if (code !== 0) {
          cliLog(label, `exited code=${code} at ${elapsed()}`)
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim().slice(0, 500)}`))
        } else {
          cliLog(label, `done at ${elapsed()} · ${stdout.length} chars`)
          resolve(stdout.trim())
        }
      })
    })

    child.stdin.on("error", () => {
      /* ignore EPIPE if the child exits before stdin is fully written */
    })
    child.stdin.write(prompt)
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
