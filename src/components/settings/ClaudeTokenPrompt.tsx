'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X, KeyRound } from 'lucide-react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

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

  return (
    <div
      className={`glass-panel rounded-xl px-4 py-3 mb-6 flex items-center gap-3 border ${
        invalid
          ? 'border-status-scheduled/30 dark:border-status-scheduled-dark/30'
          : 'border-primary/20 dark:border-primary-light/20'
      }`}
    >
      <span
        className={`p-2 rounded-xl shrink-0 ${
          invalid
            ? 'bg-status-scheduled/10 dark:bg-status-scheduled-dark/15 text-status-scheduled dark:text-status-scheduled-dark'
            : 'bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light'
        }`}
      >
        <KeyRound size={16} />
      </span>
      <p className="flex-1 text-sm text-light-text dark:text-dark-text">
        {invalid
          ? 'Your Claude token has expired or was revoked — generations are using the shared credential.'
          : 'Connect your Claude account so your posts generate on your own subscription.'}{' '}
        <Link
          href="/settings"
          className="font-medium text-primary dark:text-primary-light hover:underline"
        >
          {invalid ? 'Reconnect' : 'Connect now'}
        </Link>
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="p-1.5 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:bg-primary/10 dark:hover:bg-primary-light/10"
      >
        <X size={14} />
      </button>
    </div>
  )
}
