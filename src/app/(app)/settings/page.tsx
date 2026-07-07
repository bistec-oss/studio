'use client'

import { ClaudeTokenCard } from '@/components/settings/ClaudeTokenCard'

// Self-service user settings. Currently hosts the personal Claude account
// connection; future per-user preferences belong here too (it's the only
// non-admin settings surface).
export default function SettingsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Settings</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
          Your account and generation preferences.
        </p>
      </div>

      <div className="max-w-3xl">
        <ClaudeTokenCard />
      </div>
    </div>
  )
}
