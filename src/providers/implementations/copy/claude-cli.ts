import type { BriefInput, CopyProvider } from "../../interfaces/CopyProvider"
import { runClaudeCli } from "@/lib/agent/claudeCli"

// Copy provider backed by the local Claude Code CLI (`claude -p`). Activated in
// CLI mode (DESIGN_PROVIDER=cli) so copy can be generated without an API key.
export class ClaudeCliCopyProvider implements CopyProvider {
  async generateCopy(brief: BriefInput): Promise<string> {
    const channelList = brief.channels.join(", ")

    const prompt = `You are an expert social media copywriter for Bistec, a tech company. Write compelling, on-brand copy for ${channelList} post(s).

Topic: ${brief.topic}
Description: ${brief.description}
Goal: ${brief.goal}
Tone: ${brief.tone}
Channels: ${channelList}

Write engaging copy for the above brief. Return ONLY the post copy text — no preamble, no explanation, no markdown headings.`

    const text = await runClaudeCli(prompt, { timeoutMs: 120_000, label: "copy" })
    if (!text) throw new Error("Claude CLI returned empty copy")
    return text
  }
}
