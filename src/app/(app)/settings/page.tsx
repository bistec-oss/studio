'use client'

import { ClaudeTokenCard } from '@/components/settings/ClaudeTokenCard'
import { OpenAiKeyCard } from '@/components/settings/OpenAiKeyCard'
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard'

// Self-service user settings: personal Claude/OpenAI credential connections
// plus account security. Team-wide settings (shared providers, channels,
// team Claude token, API keys) live at /team instead — this page is strictly
// per-user.
export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Settings</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
          Your account and generation preferences.
        </p>
      </div>

      <div className="max-w-3xl flex flex-col gap-6">
        <ClaudeTokenCard />
        <OpenAiKeyCard />
        <ChangePasswordCard />
      </div>
    </div>
  )
}
