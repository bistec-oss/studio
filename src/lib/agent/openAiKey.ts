import { prisma } from '@/lib/prisma'

// Companion to userToken.ts's markUserTokenInvalid, for the personal OpenAI
// key (UserOpenAiKey) rather than the personal Claude token. There is no
// live validation ping at save time (OpenAI has no free validation endpoint —
// see the PUT handler in src/app/api/me/openai-key/route.ts): the row starts
// ACTIVE and is only flipped INVALID here, after an observed failure.
//
// Not yet wired to a call site: unlike Claude's isClaudeAuthFailure (which
// classifies `claude -p` stderr), there is no existing classifier for OpenAI
// SDK errors as "this was an auth failure" vs. any other failure (rate limit,
// moderation, network). Inventing that classification is out of scope here —
// see the TODO in src/lib/agent/background.ts at the provider.generateImage
// call site for where this would be invoked once such a classifier exists.

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
