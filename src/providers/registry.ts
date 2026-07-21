import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { CopyProvider } from "./interfaces/CopyProvider"
import type { ImageProvider } from "./interfaces/ImageProvider"
import { OpenAICopyProvider } from "./implementations/copy/openai"
import { OpenAIImageProvider } from "./implementations/image/openai"
import { AnthropicCopyProvider } from "./implementations/copy/anthropic"
import { ClaudeCliCopyProvider } from "./implementations/copy/claude-cli"
import { MOCK_AI, buildMockCopy } from "@/lib/testHooks"
import { env } from "@/lib/env"

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

// teamId is required (team-tenancy fix): both lookups below used to run with
// no teamId filter at all, so a brief could resolve — via an explicit
// providerKey OR the unfiltered "the" default lookup — to a DIFFERENT team's
// registered COPY provider row, including that team's decrypted API key.
// Every caller runs inside an already team-scoped request/generation context,
// so the real team id is always available (mirrors resolveImageProvider).
export async function resolveCopyProvider(teamId: string, providerKey?: string): Promise<CopyProvider> {
  // Test seam: deterministic copy with no provider API call. The brief's
  // copyProviderKey must still reference a real enabled COPY provider (validated
  // at brief creation) — only the generation call is stubbed here.
  if (MOCK_AI) {
    return { generateCopy: async (brief) => buildMockCopy(brief?.topic ?? '') }
  }

  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "COPY", providerKey, teamId, isEnabled: true },
    })
    if (record) {
      return instantiateCopyProvider(record.providerName, providerApiKey(record))
    }
  }

  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "COPY", teamId, isDefault: true, isEnabled: true },
  })
  if (defaultRecord) {
    return instantiateCopyProvider(defaultRecord.providerName, providerApiKey(defaultRecord))
  }

  // The env.OPENAI_API_KEY fallback tier was removed (team-tenancy Task 11) —
  // COPY provider config lives entirely in AvailableProvider rows now. The
  // ANTHROPIC_API_KEY fallback stays: it's the shared server credential, not a
  // per-team secret, and the CLI-mode fallback chain still expects it.
  const anthropicKey = env.ANTHROPIC_API_KEY
  if (anthropicKey) return new AnthropicCopyProvider(anthropicKey)

  throw new Error("No COPY provider configured — set ANTHROPIC_API_KEY or add a default COPY AvailableProvider")
}

// Resolve a raw Anthropic API key for direct SDK calls that bypass the
// CopyProvider abstraction (e.g. the brand-voice prompt drafting helper).
// Mirrors resolveCopyProvider's resolution order: the default enabled COPY
// provider (when it is an anthropic registration, its decrypted key) → the
// ANTHROPIC_API_KEY env fallback. Returns null when neither is configured —
// callers decide how to fail.
export async function resolveAnthropicApiKey(): Promise<string | null> {
  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "COPY", isDefault: true, isEnabled: true },
  })
  if (defaultRecord && defaultRecord.providerName.toLowerCase() === "anthropic") {
    return decrypt(defaultRecord.encryptedApiKey)
  }
  return env.ANTHROPIC_API_KEY ?? null
}

// Resolution order: personal UserOpenAiKey (ACTIVE, only when userId is
// given) → an explicit providerKey row scoped to ctx.teamId → the team's
// default IMAGE row → null. No throw, no env fallback — callers (background.ts,
// the generate/image route) treat null as "skip, no image provider configured".
// Personal wins even over an explicit providerKey: a user who connected their
// own OpenAI key wants THEIR key used for every image call, team config or not.
export async function resolveImageProvider(
  ctx: { teamId: string; userId?: string | null },
  providerKey?: string
): Promise<ImageProvider | null> {
  if (ctx.userId) {
    const personal = await prisma.userOpenAiKey.findUnique({ where: { userId: ctx.userId } })
    if (personal && personal.status === "ACTIVE") {
      return instantiateImageProvider("openai", decrypt(personal.encryptedKey))
    }
  }

  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "IMAGE", providerKey, teamId: ctx.teamId, isEnabled: true },
    })
    if (record) {
      return instantiateImageProvider(record.providerName, decrypt(record.encryptedApiKey))
    }
  }

  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "IMAGE", teamId: ctx.teamId, isDefault: true, isEnabled: true },
  })
  if (defaultRecord) {
    return instantiateImageProvider(
      defaultRecord.providerName,
      decrypt(defaultRecord.encryptedApiKey)
    )
  }

  return null
}
