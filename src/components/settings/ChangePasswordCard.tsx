'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Lock } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { Button } from '@/components/ui/Button'
import { authClient } from '@/lib/auth-client'

// Self-service password change. better-auth's base client always exposes
// `changePassword` (a core emailAndPassword endpoint, independent of any
// plugin) — it returns `{ data, error }` rather than throwing, mirroring the
// login page's authClient.signIn usage. `revokeOtherSessions: true` signs out
// every other device the moment the new password is set, matching the
// deactivation flow's "sessions revoked" precedent elsewhere in the app.
const MIN_LENGTH = 8

export function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters`)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match')
      return
    }

    setSaving(true)
    try {
      const { error: authError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (authError) {
        setError(authError.message ?? 'Failed to change password')
        return
      }
      toast.success('Password changed — other devices have been signed out')
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <GlassPanel className="p-6 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10 dark:bg-primary-light/10 text-primary dark:text-primary-light">
          <Lock size={20} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-light-text dark:text-dark-text">Password</h2>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            Change your sign-in password. Other devices are signed out immediately.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3 max-w-sm">
        <GlassInput
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          required
        />
        <GlassInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          minLength={MIN_LENGTH}
          required
          placeholder={`At least ${MIN_LENGTH} characters`}
        />
        <GlassInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          minLength={MIN_LENGTH}
          required
        />
        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
        <div>
          <Button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>
            {saving ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </GlassPanel>
  )
}
