import { pipelineMode } from '@/lib/agent/config'
import { resolveAssistantModel, runBriefingModel } from '@/lib/campaign/briefingAssistant'
import { modelCallFor, recordModelCall } from '@/lib/models/modelCalls'
import { MOCK_AI } from '@/lib/testHooks'

// Both the /prompts/generate and /prompts/improve admin routes draft through
// here. The model is the team's ASSISTANT_BRANDKIT choice (008 FR-02).
const MAX_TOKENS = 1024

// Fallback mock draft when a caller doesn't supply a route-specific one.
const DEFAULT_MOCK_DRAFT =
  '[MOCK brand voice draft for E2E tests — deterministic output from the MOCK_AI seam.]'

export interface DraftBrandVoiceOptions {
  // Deterministic text returned under the MOCK_AI test seam. Lets each route
  // keep its exact historical mock response shape (the E2E suite asserts on it).
  mockDraft?: string
}

// Draft (or improve) a brand voice prompt via Claude. Runs through the shared
// assistant text call, runBriefingModel (008 D8), so it works in both modes:
// the SDK with the provider-registry key in API mode, `claude -p` on the
// caller's withClaudeAuth credential in CLI mode. The prompt is one user
// message with no system prompt, as before. Honors the MOCK_AI test seam with
// no model call. teamId is required (team-tenancy fix, Task 19b) — both admin
// routes that call this already run under withTeamAdmin and have it.
export async function draftBrandVoice(
  teamId: string,
  userId: string | null,
  promptText: string,
  options: DraftBrandVoiceOptions = {},
): Promise<string> {
  const model = await resolveAssistantModel('ASSISTANT_BRANDKIT', teamId, userId)

  // Test seam: deterministic draft with no model call, recorded first (008 FR-16).
  if (MOCK_AI) {
    recordModelCall(modelCallFor(model, pipelineMode(), 'brand-voice'))
    return options.mockDraft ?? DEFAULT_MOCK_DRAFT
  }

  return runBriefingModel(undefined, [{ role: 'user', content: promptText }], teamId, model, {
    maxTokens: MAX_TOKENS,
    label: 'brand-voice',
  })
}
