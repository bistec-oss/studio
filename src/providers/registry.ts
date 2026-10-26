import { prisma } from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import type { CopyProvider } from "./interfaces/CopyProvider"
import type { ImageProvider } from "./interfaces/ImageProvider"
import { OpenAICopyProvider } from "./implementations/copy/openai"
import { OpenAIImageProvider } from "./implementations/image/openai"
import { GeminiImageProvider } from "./implementations/image/gemini"
import { AnthropicCopyProvider } from "./implementations/copy/anthropic"
import { ClaudeCliCopyProvider } from "./implementations/copy/claude-cli"
import { MOCK_AI, buildMockCaptionReply } from "@/lib/testHooks"
import { env } from "@/lib/env"
import { pipelineMode } from "@/lib/agent/config"
import { modelCallFor, recordModelCall } from "@/lib/models/modelCalls"
import { IMAGE_PROVIDERS, type ImageProviderName } from "./imageCapabilities"
import { loadCaptionRoute } from "./captionRoute"
import { RouteNotReadyError } from "@/lib/models/route"

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
    case "gemini":
      return new GeminiImageProvider(apiKey)
    default:
      throw new Error(`Unsupported provider: ${providerName}`)
  }
}

/**
 * 008 (spec open question 1, FR-17/FR-18): whether the provider a caption run
 * would use is Claude, so a caption model can be chosen. The same lookup as
 * resolveCopyProvider: a registered row decides by its providerName (OpenAI →
 * false; COPY_PROVIDER_FAMILY). With no row, captions run on Claude — `claude
 * -p` in CLI mode, the ANTHROPIC_API_KEY fallback in API mode (or no provider
 * at all, which fails the run on its own). The MOCK_AI seam is deliberately
 * NOT consulted: the mock stands in for whichever provider the team has.
 */
export async function copyProviderIsClaude(teamId: string, providerKey?: string): Promise<boolean> {
  // 024 FR-03: the answer is the selector's. A decision that is not ok stays
  // "Claude": the picker remains visible and the run fails closed on its own.
  const decision = await loadCaptionRoute(teamId, providerKey)
  return decision.ok ? decision.isClaude : true
}

// teamId is required (team-tenancy fix): both lookups below used to run with
// no teamId filter at all, so a brief could resolve — via an explicit
// providerKey OR the unfiltered "the" default lookup — to a DIFFERENT team's
// registered COPY provider row, including that team's decrypted API key.
// Every caller runs inside an already team-scoped request/generation context,
// so the real team id is always available (mirrors resolveImageProvider).
export async function resolveCopyProvider(teamId: string, providerKey?: string): Promise<CopyProvider> {
  // 024 FR-03/FR-07: the route is decided before the MOCK_AI seam, so a chosen
  // route that cannot run fails closed in the mock as in prod. A never-chosen
  // team with nothing configured is ignored by the mock, as it always was.
  const decision = await loadCaptionRoute(teamId, providerKey)
  if (!decision.ok && decision.chosen) throw new RouteNotReadyError(decision)

  // Test seam: a deterministic RAW caption reply with no provider API call — the
  // real extractor still parses it (012 FR-21). The brief's copyProviderKey must
  // still reference a real enabled COPY provider (validated at brief creation) —
  // only the generation call is stubbed here.
  // 008 FR-16: the seam short-circuits before the boundary, so it records the
  // CAPTION model it was handed (the E2E reads it through /api/test/model-calls)
  // and stamps model.arg, exactly as a real Claude provider would.
  // 024 FR-07: it also records and stamps the decision's route (null when none).
  if (MOCK_AI) {
    const route = decision.ok ? decision.route : null
    return {
      generateCaptions: async (brief, targets, model) => {
        recordModelCall(modelCallFor(model, pipelineMode(), 'copy', route))
        return { raw: buildMockCaptionReply(brief?.topic ?? '', targets), modelId: model.arg, route }
      },
    }
  }

  if (!decision.ok) throw new Error(decision.message)
  // Route, chosen flag and team id only: never a key, a prefix or a row id.
  console.info(`[captions] route=${decision.route} chosen=${decision.chosen} team=${teamId}`)

  // A registered row decides the provider (a chosen API_KEY team gets its
  // anthropic row; a never-chosen team gets today's row). Its key is read here,
  // for this one row, after the decision.
  if (decision.row && decision.route !== "CLI") {
    const record = await prisma.availableProvider.findFirst({
      where: { id: decision.row.id, teamId },
      select: { providerName: true, encryptedApiKey: true },
    })
    if (!record) throw new Error("COPY provider row disappeared while resolving captions")
    return instantiateCopyProvider(record.providerName, providerApiKey(record))
  }

  // CLI mode default (2026-07-23): with no registered API-key COPY provider,
  // copy is generated by the local `claude -p` CLI, billed via the OAuth chain
  // resolved in withClaudeAuth (personal UserClaudeToken -> team token). No
  // provider row is required — a registered API-key provider above OVERRIDES
  // this. This is why the "cli" placeholder AvailableProvider row is no longer
  // needed (though existing rows still resolve, via instantiateCopyProvider's
  // "cli" case); the mode itself is the signal.
  // Only a chosen route renames the error: a never-chosen team keeps today's
  // message byte-for-byte (NFR-01).
  if (decision.route === "CLI") {
    const cli = new ClaudeCliCopyProvider()
    return decision.chosen ? withRouteNamedCredentialError(cli) : cli
  }

  // The env.OPENAI_API_KEY fallback tier was removed (team-tenancy Task 11) —
  // COPY provider config lives entirely in AvailableProvider rows now. The
  // ANTHROPIC_API_KEY fallback stays: it's a server-wide credential, not a
  // per-team secret, and the API-mode fallback chain still expects it.
  return new AnthropicCopyProvider(env.ANTHROPIC_API_KEY as string, "SERVER_KEY")
}

// The CLI no-credential error is named at the caption call site, not the spawn
// site: claudeCli.ts is shared with design and stays route-agnostic. The
// original message and cause are kept, and generationErrors' /no claude
// credential/i still matches.
function withRouteNamedCredentialError(provider: CopyProvider): CopyProvider {
  const inner = provider.generateCaptions.bind(provider)
  provider.generateCaptions = async (...args) => {
    try {
      return await inner(...args)
    } catch (err) {
      if (err instanceof Error && /no claude credential/i.test(err.message)) {
        throw new Error(
          `Captions are set to the CLI route, but no Claude credential is available: ${err.message}`,
          { cause: err },
        )
      }
      throw err
    }
  }
  return provider
}

// Resolve a raw Anthropic API key for direct SDK calls that bypass the
// CopyProvider abstraction (e.g. the brand-voice prompt drafting helper).
// Mirrors resolveCopyProvider's resolution order: the default enabled COPY
// provider (when it is an anthropic registration, its decrypted key) → the
// ANTHROPIC_API_KEY env fallback. Returns null when neither is configured —
// callers decide how to fail.
//
// teamId is required (team-tenancy fix, Task 19b): this lookup used to run
// with no teamId filter at all, so a team's vision/voice-draft/briefing-
// assistant call could resolve — and bill — a DIFFERENT team's registered
// Anthropic COPY provider key. Every caller runs inside an already
// team-scoped request, so the real team id is always available (mirrors
// resolveCopyProvider's identical fix).
export async function resolveAnthropicApiKey(teamId: string): Promise<string | null> {
  const defaultRecord = await prisma.availableProvider.findFirst({
    where: { slot: "COPY", teamId, isDefault: true, isEnabled: true },
  })
  if (defaultRecord && defaultRecord.providerName.toLowerCase() === "anthropic") {
    return decrypt(defaultRecord.encryptedApiKey)
  }
  return env.ANTHROPIC_API_KEY ?? null
}

// Resolution order: personal UserOpenAiKey (ACTIVE, only when userId is
// given) → an explicit providerKey row scoped to ctx.teamId → the team's
// enabled default IMAGE row → the team's OLDEST enabled IMAGE row (005 FR-01:
// an enabled key that isn't flagged default still serves teammates) → null.
// No throw, no env fallback — callers (background.ts, the generate/image route)
// treat null as "skip, no image provider configured".
// Personal wins even over an explicit providerKey: a user who connected their
// own OpenAI key wants THEIR key used for every image call, team config or not.
// Tiers 2–4 only consider image-capable providers (FR-04), so a legacy row such
// as an Anthropic key registered as IMAGE is skipped rather than thrown on.
// Tiers 3+4 must stay in step with pickServingImageProvider
// (./imageCapabilities), which /team uses to say which row is serving.
export async function resolveImageProvider(
  ctx: { teamId: string; userId?: string | null },
  providerKey?: string
): Promise<ImageProvider | null> {
  return (await resolveImageProviderWithSource(ctx, providerKey))?.provider ?? null
}

// 031 FR-12: the same resolution, with the tier and provider that served it.
// An ACTIVE personal key always comes first, whatever its provider (OpenAI or
// Gemini, from the row's `provider`). Scheduled runs (userId null) never reach
// the personal tier.
export interface ResolvedImageProvider {
  provider: ImageProvider
  tier: "personal" | "team"
  providerName: ImageProviderName
}

function resolved(provider: ImageProvider, tier: "personal" | "team", providerName: string): ResolvedImageProvider {
  return { provider, tier, providerName: providerName.toLowerCase() as ImageProviderName }
}

export async function resolveImageProviderWithSource(
  ctx: { teamId: string; userId?: string | null },
  providerKey?: string
): Promise<ResolvedImageProvider | null> {
  if (ctx.userId) {
    const personal = await prisma.userOpenAiKey.findUnique({ where: { userId: ctx.userId } })
    if (personal && personal.status === "ACTIVE") {
      // A row written before 031 reads 'openai' through the column default.
      const name = personal.provider === "gemini" ? "gemini" : "openai"
      return resolved(instantiateImageProvider(name, decrypt(personal.encryptedKey)), "personal", name)
    }
  }

  const imageCapable = { in: [...IMAGE_PROVIDERS] }
  const oldestFirst = [{ createdAt: "asc" as const }, { id: "asc" as const }]

  if (providerKey) {
    const record = await prisma.availableProvider.findFirst({
      where: { slot: "IMAGE", providerKey, teamId: ctx.teamId, isEnabled: true, providerName: imageCapable },
    })
    if (record) {
      return resolved(
        instantiateImageProvider(record.providerName, decrypt(record.encryptedApiKey)),
        "team",
        record.providerName,
      )
    }
  }

  const servingRecord =
    (await prisma.availableProvider.findFirst({
      where: { slot: "IMAGE", teamId: ctx.teamId, isDefault: true, isEnabled: true, providerName: imageCapable },
      orderBy: oldestFirst,
    })) ??
    (await prisma.availableProvider.findFirst({
      where: { slot: "IMAGE", teamId: ctx.teamId, isEnabled: true, providerName: imageCapable },
      orderBy: oldestFirst,
    }))
  if (servingRecord) {
    return resolved(
      instantiateImageProvider(servingRecord.providerName, decrypt(servingRecord.encryptedApiKey)),
      "team",
      servingRecord.providerName,
    )
  }

  return null
}
