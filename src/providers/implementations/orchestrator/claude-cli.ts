import type { DesignOrchestrator } from "@/providers/interfaces/DesignOrchestrator"
import type { BriefInput } from "@/providers/interfaces/CopyProvider"
import { runClaudeCli, stripCodeFences } from "@/lib/agent/claudeCli"

// Dev-mode only — routes DesignOrchestrator calls through the local Claude Code CLI
// session. Set DESIGN_PROVIDER=cli to activate. Never use in production.
export class ClaudeCliOrchestrator implements DesignOrchestrator {
  async orchestrate(
    brief: BriefInput,
    brandKitId: string
  ): Promise<{ htmlContent: string; exportUrl: string }> {
    const prompt = [
      "You are a social media design expert.",
      "Generate a complete, self-contained HTML/CSS design for a social media post.",
      "Return ONLY the raw HTML — no markdown, no code fences, no explanation.",
      "Start directly with <!DOCTYPE html>.",
      "",
      "Brief:",
      `- Topic: ${brief.topic}`,
      `- Description: ${brief.description ?? ""}`,
      `- Goal: ${brief.goal}`,
      `- Tone: ${brief.tone}`,
      `- Channels: ${brief.channels.join(", ")}`,
      `- Brand kit ID: ${brandKitId}`,
    ].join("\n")

    // Pipe via stdin (shared helper) — argv would truncate at the Windows
    // command-line length limit for large prompts.
    const stdout = await runClaudeCli(prompt, { timeoutMs: 120_000 })

    return { htmlContent: stripCodeFences(stdout), exportUrl: "" }
  }
}
