import type { BriefInput, CaptionReply, CopyProvider } from "../../interfaces/CopyProvider"
import { runClaudeCli } from "@/lib/agent/claudeCli"
import type { CaptionTarget } from "@/lib/channels"
import type { ResolvedModel } from "@/lib/models/resolve"
import { buildCaptionPrompt } from "@/lib/agent/prompts/caption"

// Copy provider backed by the local Claude Code CLI (`claude -p`). Activated in
// CLI mode (DESIGN_PROVIDER=cli) so captions can be generated without an API key.
export class ClaudeCliCopyProvider implements CopyProvider {
  async generateCaptions(
    brief: BriefInput,
    targets: readonly CaptionTarget[],
    model: ResolvedModel,
  ): Promise<CaptionReply> {
    const prompt = buildCaptionPrompt(brief, targets)

    // 008 FR-07: the resolved CAPTION model; the timeout is its surface timeout.
    const text = await runClaudeCli(`${prompt.system}\n\n${prompt.user}`, {
      model,
      label: "copy",
    })
    if (!text) throw new Error("Claude CLI returned an empty caption reply")
    return { raw: text, modelId: model.arg, route: 'CLI' }
  }
}
