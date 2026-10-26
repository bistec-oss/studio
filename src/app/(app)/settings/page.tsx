'use client'

import { ClaudeTokenCard } from '@/components/settings/ClaudeTokenCard'
import { OpenAiKeyCard } from '@/components/settings/OpenAiKeyCard'
import { ChangePasswordCard } from '@/components/settings/ChangePasswordCard'
import { PageHead } from '@/components/ui/PageHead'

// Self-service user settings: personal Claude/OpenAI credential connections
// plus account security. Team-wide settings (shared providers, channels,
// team Claude token, API keys) live at /team instead — this page is strictly
// per-user. Each card is a bezel card (021 design.md §8), stacked on the
// study's 20 px gap.
export default function SettingsPage() {
  return (
    <div className="max-w-3xl">
      <PageHead
        eyebrow="Account"
        title="Settings"
        lead="Your account and generation preferences."
        className="mb-6"
      />

      <div className="flex flex-col gap-5">
        <ClaudeTokenCard />
        <OpenAiKeyCard />
        <ChangePasswordCard />
      </div>
    </div>
  )
}
