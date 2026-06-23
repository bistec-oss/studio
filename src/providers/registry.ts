import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { CopyProvider } from "./interfaces/CopyProvider"
import type { ImageProvider } from "./interfaces/ImageProvider"
import type { DesignOrchestrator } from "./interfaces/DesignOrchestrator"
import { OpenAICopyProvider } from "./implementations/copy/openai"
import { OpenAIImageProvider } from "./implementations/image/openai"
import { AnthropicCopyProvider } from "./implementations/copy/anthropic"
import { ClaudeCliCopyProvider } from "./implementations/copy/claude-cli"
import { ClaudeCliOrchestrator } from "./implementations/orchestrator/claude-cli"
import { ClaudeHtmlOrchestrator } from "./implementations/orchestrator/claude-html"

function instantiateCopyProvider(providerName: string, apiKey: string): CopyProvider {
  switch (providerName.toLowerCase()) {
    case "cli":
      // Local Claude Code CLI — no API key needed.
      return new ClaudeCliCopyProvider()
    case "openai":
      return new OpenAICopyProvider(apiKey)
    case "anthropic":
      return new AnthropicCopyProvider(apiKey)
    default:
      throw new Error(`Unsupported provider: ${providerName}`)
  }
}

// The "cli" provider carries no real API key, so its encryptedApiKey is a
// placeholder that must not be run through decrypt().
function providerApiKey(record: { providerName: string; encryptedApiKey: string }): string {
  return record.providerName.toLowerCase() === "cli" ? "" : decrypt(record.encryptedApiKey)
}

function instantiateImageProvider(providerName: string, apiKey: string): ImageProvider {
  switch (providerName.toLowerCase()) {
    case "openai":
      return new OpenAIImageProvider(apiKey)
    default:
      throw new Error(`Unsupported provider: ${providerName}`)
  }
}

export async function resolveCopyProvider(providerKey?: string): Promise<CopyProvider> {
  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "COPY", providerKey, isEnabled: true },
    })
    if (record) {
      return instantiateCopyProvider(record.providerName, providerApiKey(record))
    }
  }

  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "COPY", isDefault: true, isEnabled: true },
  })
  if (defaultRecord) {
    return instantiateCopyProvider(defaultRecord.providerName, providerApiKey(defaultRecord))
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (anthropicKey) return new AnthropicCopyProvider(anthropicKey)

  const openaiKey = process.env.OPENAI_API_KEY
  if (openaiKey) return new OpenAICopyProvider(openaiKey)

  throw new Error("No COPY provider configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY")
}

export async function resolveImageProvider(providerKey?: string): Promise<ImageProvider> {
  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "IMAGE", providerKey, isEnabled: true },
    })
    if (record) {
      return instantiateImageProvider(record.providerName, decrypt(record.encryptedApiKey))
    }
  }

  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "IMAGE", isDefault: true, isEnabled: true },
  })
  if (defaultRecord) {
    return instantiateImageProvider(
      defaultRecord.providerName,
      decrypt(defaultRecord.encryptedApiKey)
    )
  }

  const envKey = process.env.OPENAI_API_KEY
  if (!envKey) {
    throw new Error("No IMAGE provider found and OPENAI_API_KEY env var is not set")
  }
  return new OpenAIImageProvider(envKey)
}

// Orchestrator is not user-selectable — resolved from DESIGN_PROVIDER env var only.
// "cli"         → ClaudeCliOrchestrator (dev mode, no API key, no Puppeteer)
// "claude-html" → ClaudeHtmlOrchestrator (production, implemented in T14 / Wave 4)
export function resolveDesignOrchestrator(): DesignOrchestrator {
  const provider = process.env.DESIGN_PROVIDER ?? "claude-html"
  if (provider === "cli") return new ClaudeCliOrchestrator()
  return new ClaudeHtmlOrchestrator()
}
