import { execFile } from "child_process"
import { promisify } from "util"
import type { DesignOrchestrator } from "@/providers/interfaces/DesignOrchestrator"
import type { BriefInput } from "@/providers/interfaces/CopyProvider"

const execFileAsync = promisify(execFile)

// Dev-mode only — routes DesignOrchestrator calls through the local Claude Code CLI session.
// Set DESIGN_PROVIDER=cli in .env to activate. Never use in production.
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

    const { stdout } = await execFileAsync("claude", ["-p", prompt], {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    })

    return { htmlContent: stdout.trim(), exportUrl: "" }
  }
}
