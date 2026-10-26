import { prisma } from '@/lib/prisma'

// Companion to userToken.ts's markUserTokenInvalid, for the personal OpenAI
// key (UserOpenAiKey) rather than the personal Claude token. There is no
// live validation ping at save time (OpenAI has no free validation endpoint —
// see the PUT handler in src/app/api/me/openai-key/route.ts): the row starts
// ACTIVE and is only flipped INVALID here, after an observed failure.
//
// Wired by background.ts (031 FR-13): when the personal key's provider answers
// 401 or 403, isAuthRejection says so and the row is flagged INVALID.

/**
 * Whether a provider error is the provider rejecting the key (HTTP 401 or 403).
 * The OpenAI SDK sets `status` on its errors; the Gemini provider writes the
 * status into its message ("(HTTP 401)"). Anything else (a rate limit, a safety
 * refusal, a network error) is not an auth rejection.
 */
export function isAuthRejection(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const status = (err as { status?: unknown }).status
  if (status === 401 || status === 403) return true
  const message = (err as { message?: unknown }).message
  return typeof message === 'string' && /\(HTTP (?:401|403)\)/.test(message)
}

/**
 * Flags the stored personal OpenAI key after an observed auth failure so the
 * UI prompts a reconnect and later calls skip it. updateMany ⇒ idempotent and
 * a no-op when the row was deleted mid-flight or a concurrent failure already
 * flipped it.
 */
export async function markUserOpenAiKeyInvalid(userId: string): Promise<void> {
  await prisma.userOpenAiKey.updateMany({
    where: { userId },
    data: { status: 'INVALID' },
  })
}
