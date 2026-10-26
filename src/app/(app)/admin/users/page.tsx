'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, KeyRound, UserX, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PageHead } from '@/components/ui/PageHead'
import { Panel } from '@/components/ui/Panel'
import { StatusChip } from '@/components/ui/StatusChip'
import { ICON, ICON_SM, SCROLL_FOCUS, TABLE_HEAD_ROW, TAG } from '@/components/ui/atoms'
import { GateNotice } from '@/components/ui/GateNotice'

interface ManagedUser {
  id: string
  name: string
  email: string
  username: string | null
  displayUsername: string | null
  role: 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR'
  disabled: boolean
  createdAt: string
}

// Accounts sign in by username; email is internal. Fall back for accounts
// predating the username switch.
function loginLabel(u: ManagedUser): string {
  return u.displayUsername ?? u.username ?? u.email
}

function StatusPill({ disabled }: { disabled: boolean }) {
  return disabled
    ? <StatusChip tone="failed">Deactivated</StatusChip>
    : <StatusChip tone="published">Active</StatusChip>
}

export default function AdminUsersPage() {
  const { user: me, isSuperAdmin, isLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [addOpen, setAddOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<ManagedUser | null>(null)

  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<ManagedUser[]>('/api/admin/users'),
    enabled: isSuperAdmin,
  })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
  }

  async function patchUser(u: ManagedUser, data: Record<string, unknown>, successMsg: string) {
    try {
      await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      toast.success(successMsg)
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    }
  }

  async function toggleDisabled(u: ManagedUser) {
    if (!u.disabled) {
      const ok = await confirm({
        title: 'Deactivate this account?',
        description: `${u.name} (${loginLabel(u)}) will be signed out and can no longer log in. Their content stays intact and the account can be reactivated later.`,
        confirmLabel: 'Deactivate',
        danger: true,
      })
      if (!ok) return
    }
    await patchUser(
      u,
      { disabled: !u.disabled },
      u.disabled ? 'Account reactivated' : 'Account deactivated',
    )
  }

  if (isLoading) return null

  if (!isSuperAdmin) {
    return (
      <GateNotice title="Requires super admin">
        User management is limited to super administrators.
      </GateNotice>
    )
  }

  return (
    <div className="max-w-4xl">
      <PageHead
        eyebrow="Admin"
        title="Users"
        lead="Create and deactivate accounts. Team roles are set under Teams. Share initial passwords out-of-band."
        className="mb-6"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus {...ICON} /> Add user
          </Button>
        }
      />

      {/* A ruled data table (§8.15, the study's .ct) on a bezel card (021
          design.md §8): sentence-case muted headers and --line-subtle rows. It
          scrolls inside its own container at narrow widths, so the container
          is a focusable, labelled region with an inset focus outline.
          `relative` makes it the containing block of the sr-only Actions
          header, which otherwise widened the page at 375 px (the pre-T5 383 px
          bug). */}
      <Panel bezel className="min-w-0 p-5">
        <div
          tabIndex={0}
          role="region"
          aria-label="Users"
          className={`relative overflow-x-auto ${SCROLL_FOCUS}`}
        >
          <table className="w-full min-w-[720px] text-ui-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Username</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Created</th>
                <th scope="col" className="py-2 font-semibold sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const locked = u.role === 'SUPER_ADMIN' || u.id === me?.userId
                return (
                  <tr key={u.id} className="border-b border-line-subtle align-middle last:border-b-0">
                    <td className="py-2.5 pr-3 font-medium text-fg">
                      {u.name}
                      {u.id === me?.userId && (
                        <span className="ml-1.5 text-ui-xs font-normal text-fg-muted">(you)</span>
                      )}
                      {u.role === 'SUPER_ADMIN' && (
                        <span className={`ml-1.5 whitespace-nowrap ${TAG}`}>Super admin</span>
                      )}
                    </td>
                    <td className="break-all py-2.5 pr-3 text-fg">{loginLabel(u)}</td>
                    <td className="py-2.5 pr-3">
                      <StatusPill disabled={u.disabled} />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-ui-xs text-fg-muted">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap py-1.5">
                      {!locked && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setResetTarget(u)}>
                            <KeyRound {...ICON_SM} /> Reset password
                          </Button>
                          <Button
                            variant={u.disabled ? 'secondary' : 'danger'}
                            size="sm"
                            onClick={() => toggleDisabled(u)}
                          >
                            {u.disabled ? (
                              <>
                                <UserCheck {...ICON_SM} /> Reactivate
                              </>
                            ) : (
                              <>
                                <UserX {...ICON_SM} /> Deactivate
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <AddUserModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={invalidate} />
      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />
    </div>
  )
}

function AddUserModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setUsername('')
    setPassword('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password }),
      })
      toast.success(`User created — share the initial password with ${name}.`)
      await onSaved()
      reset()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Name" value={name} onChange={e => setName(e.target.value)} required />
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_.\-]+"
          title="Letters, numbers, dot, dash, underscore"
          required
          placeholder="e.g. jane.d"
        />
        <Input
          label="Initial password"
          type="text"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
          placeholder="At least 8 characters"
        />
        <p className="text-ui-xs text-fg-muted">
          The password is set directly — share it with the user privately and ask them to change it.
          Grant access by adding this user to a team in Teams, where you pick their per-team role
          (Admin or Editor).
        </p>
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create user'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function ResetPasswordModal({
  target,
  onClose,
}: {
  target: ManagedUser | null
  onClose: () => void
}) {
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setSaving(true)
    try {
      await apiFetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      toast.success(`Password reset for ${loginLabel(target)}`)
      setPassword('')
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={target !== null} onClose={onClose} title={`Reset password${target ? ` — ${target.name}` : ''}`} size="sm">
      <form onSubmit={submit} className="space-y-3">
        <Input
          label="New password"
          type="text"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
          placeholder="At least 8 characters"
        />
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Reset password'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
