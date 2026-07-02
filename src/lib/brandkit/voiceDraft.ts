import Anthropic from '@anthropic-ai/sdk'
import { resolveAnthropicApiKey } from '@/providers/registry'
import { MOCK_AI } from '@/lib/testHooks'

// Single place the brand-voice drafting model is pinned. Both the
// /prompts/generate and /prompts/improve admin routes draft through here.
const BRAND_VOICE_MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1024

// Fallback mock draft when a caller doesn't supply a route-specific one.
const DEFAULT_MOCK_DRAFT =
  '[MOCK brand voice draft for E2E tests — deterministic output from the MOCK_AI seam.]'

export interface DraftBrandVoiceOptions {
  // Deterministic text returned under the MOCK_AI test seam. Lets each route
  // keep its exact historical mock response shape (the E2E suite asserts on it).
  mockDraft?: string
}

// Draft (or improve) a brand voice prompt via Claude. Resolves the Anthropic
// API key through the encrypted provider registry (default enabled anthropic
// COPY provider → ANTHROPIC_API_KEY env fallback) instead of reading the env
// var directly, and honors the MOCK_AI test seam with no Anthropic call.
export async function draftBrandVoice(
  promptText: string,
  options: DraftBrandVoiceOptions = {},
): Promise<string> {
  // Test seam: deterministic draft with no Anthropic call.
  if (MOCK_AI) {
    return options.mockDraft ?? DEFAULT_MOCK_DRAFT
  }

  const apiKey = await resolveAnthropicApiKey()
  const client = new Anthropic({ apiKey: apiKey ?? undefined })

  const message = await client.messages.create({
    model: BRAND_VOICE_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: promptText }],
  })

  const textBlock = message.content.find(b => b.type === 'text')
  return textBlock && 'text' in textBlock ? textBlock.text : ''
}
