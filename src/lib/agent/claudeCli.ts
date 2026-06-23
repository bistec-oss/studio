import { spawn } from "child_process"

// Resolve the Claude Code CLI binary. On Windows the npm shim is `claude.cmd`,
// which needs a shell to launch; elsewhere `claude` runs directly.
function claudeCommand(): { cmd: string; shell: boolean } {
  if (process.env.CLAUDE_CLI_PATH) return { cmd: process.env.CLAUDE_CLI_PATH, shell: false }
  if (process.platform === "win32") return { cmd: "claude.cmd", shell: true }
  return { cmd: "claude", shell: false }
}

export interface ClaudeCliOptions {
  timeoutMs?: number
  maxBuffer?: number
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
  const { timeoutMs = 180_000, maxBuffer = 16 * 1024 * 1024 } = opts

  if (prompt.length > MAX_PROMPT_CHARS) {
    throw new Error(
      `Prompt too large for CLI mode (${prompt.length} chars > ${MAX_PROMPT_CHARS}). ` +
        `This usually means the brand template is too big — use a smaller template or Path B.`,
    )
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, ["-p"], { shell, windowsHide: true })

    let stdout = ""
    let stderr = ""
    let settled = false

    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(() => reject(new Error(`Claude CLI timed out after ${timeoutMs}ms`)))
    }, timeoutMs)

    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > maxBuffer) {
        child.kill()
        finish(() => reject(new Error("Claude CLI output exceeded buffer limit")))
      }
    })
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString()
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
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr.trim().slice(0, 500)}`))
        } else {
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
