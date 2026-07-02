import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import { runClaudeCli } from "@/lib/agent/claudeCli"
import { buildCopyPrompt } from "@/lib/agent/prompts/copy"

// Copy provider backed by the local Claude Code CLI (`claude -p`). Activated in
// CLI mode (DESIGN_PROVIDER=cli) so copy can be generated without an API key.
export class ClaudeCliCopyProvider implements CopyProvider {
  async generateCopy(brief: BriefInput): Promise<string> {
    const prompt = buildCopyPrompt(brief)

    const text = await runClaudeCli(`${prompt.system}\n\n${prompt.user}`, {
      timeoutMs: 120_000,
      label: "copy",
    })
    if (!text) throw new Error("Claude CLI returned empty copy")
    return text
  }
}
