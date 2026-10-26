'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, KeyRound } from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Notice } from '@/components/ui/Notice'
import { FOCUS, ICON, ICON_BUTTON, TEXT_LINK } from '@/components/ui/atoms'

// Dismissible post-login banner nudging the user to connect (or reconnect)
// their personal Claude account. Rendered only in CLI mode — the only mode
// where personal tokens are used. Dismissal is per-user and per-STATE: a
// "not connected" dismissal doesn't suppress a later "token went invalid"
// banner (and vice versa), so an expiry always resurfaces the prompt.

type PromptState = 'disconnected' | 'invalid'

function dismissalKey(userId: string) {
  return `claude-token-prompt-dismissed:${userId}`
}

export function ClaudeTokenPrompt() {
  const { user, cliMode, claudeToken } = useCurrentUser()
  // Bumped on dismiss to re-render; localStorage holds the durable state.
  const [, setDismissedAt] = useState(0)

  if (!user || !cliMode) return null

  const state: PromptState | null = !claudeToken
    ? 'disconnected'
    : claudeToken.status === 'INVALID'
      ? 'invalid'
      : null
  if (!state) return null

  // Data arrives via React Query well after hydration, so reading
  // localStorage during render is safe here (no server/client mismatch).
  if (typeof window !== 'undefined' && window.localStorage.getItem(dismissalKey(user.userId)) === state) {
    return null
  }

  const dismiss = () => {
    window.localStorage.setItem(dismissalKey(user.userId), state)
    setDismissedAt(Date.now())
  }

  const invalid = state === 'invalid'

  // A notice (§3.2): amber for an invalid token (a warning state), a neutral
  // hairline nudge otherwise. Opaque and in-flow.
  return (
    <Notice tone={invalid ? 'warning' : 'neutral'} className="mb-6 flex items-center gap-3">
      <KeyRound {...ICON} aria-hidden className={`shrink-0 ${invalid ? '' : 'text-fg-muted'}`} />
      <p className="flex-1 text-ui-sm text-fg">
        {invalid
          ? 'Your Claude token has expired or was revoked. Generations use the team’s Claude account if one is set, otherwise they can’t run.'
          : 'Connect your Claude account so your posts generate on your own subscription. Without one, generations use the team’s Claude account if one is set, otherwise they can’t run.'}{' '}
        <Link href="/settings" className={`rounded-ui-sm font-semibold ${TEXT_LINK} ${FOCUS}`}>
          {invalid ? 'Reconnect' : 'Connect now'}
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className={`${ICON_BUTTON} hover:text-fg ${FOCUS}`}
      >
        <X {...ICON} />
      </button>
    </Notice>
  )
}
