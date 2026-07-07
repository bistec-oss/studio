'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldAlert, KeyRound, UserX, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { GlassInput } from '@/components/ui/GlassInput'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'

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

const ROLE_LABEL: Record<ManagedUser['role'], string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
}

function StatusPill({ disabled }: { disabled: boolean }) {
  return disabled ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-status-failed/10 dark:bg-status-failed-dark/15 text-status-failed dark:text-status-failed-dark border border-status-failed/25 dark:border-status-failed-dark/30">
      Deactivated
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-status-published/10 dark:bg-status-published-dark/15 text-status-published dark:text-status-published-dark border border-status-published/25 dark:border-status-published-dark/30">
      Active
    </span>
  )
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
      <GlassPanel className="p-12 text-center max-w-md mx-auto mt-12">
        <ShieldAlert size={32} className="mx-auto mb-3 text-light-text-muted dark:text-dark-text-muted" />
        <h1 className="text-lg font-semibold text-light-text dark:text-dark-text mb-1">
          Requires super admin
        </h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
          User management is limited to super administrators.
        </p>
      </GlassPanel>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-light-text dark:text-dark-text">Users</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            Create accounts and manage roles. Share initial passwords out-of-band.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add user
        </Button>
      </div>

      <GlassPanel className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-light-text-muted dark:text-dark-text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Username</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Created</th>
                <th className="py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const locked = u.role === 'SUPER_ADMIN' || u.id === me?.userId
                return (
                  <tr key={u.id} className="border-t border-light-border/50 dark:border-dark-border/50">
                    <td className="py-2.5 pr-3 font-medium text-light-text dark:text-dark-text">
                      {u.name}
                      {u.id === me?.userId && (
                        <span className="ml-1.5 text-xs text-light-text-muted dark:text-dark-text-muted">(you)</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-light-text dark:text-dark-text">{loginLabel(u)}</td>
                    <td className="py-2.5 pr-3">
                      {locked ? (
                        <span className="text-light-text dark:text-dark-text">{ROLE_LABEL[u.role]}</span>
                      ) : (
                        <Select
                          aria-label={`Role for ${loginLabel(u)}`}
                          className="w-28 py-1"
                          options={[
                            { value: 'admin', label: 'Admin' },
                            { value: 'editor', label: 'Editor' },
                          ]}
                          value={u.role === 'ADMIN' ? 'admin' : 'editor'}
                          onChange={e => patchUser(u, { role: e.target.value }, 'Role updated')}
                        />
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusPill disabled={u.disabled} />
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-xs text-light-text-muted dark:text-dark-text-muted whitespace-nowrap">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      {!locked && (
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => setResetTarget(u)}>
                            <KeyRound size={13} /> Reset password
                          </Button>
                          <Button
                            variant={u.disabled ? 'secondary' : 'danger'}
                            size="sm"
                            onClick={() => toggleDisabled(u)}
                          >
                            {u.disabled ? (
                              <>
                                <UserCheck size={13} /> Reactivate
                              </>
                            ) : (
                              <>
                                <UserX size={13} /> Deactivate
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
      </GlassPanel>

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
  const [role, setRole] = useState('editor')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setUsername('')
    setRole('editor')
    setPassword('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, role, password }),
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
        <GlassInput label="Name" value={name} onChange={e => setName(e.target.value)} required />
        <GlassInput
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
        <Select
          label="Role"
          options={[
            { value: 'editor', label: 'Editor' },
            { value: 'admin', label: 'Admin' },
          ]}
          value={role}
          onChange={e => setRole(e.target.value)}
        />
        <GlassInput
          label="Initial password"
          type="text"
          value={password}
          onChange={e => setPassword(e.target.value)}
          minLength={8}
          required
          placeholder="At least 8 characters"
        />
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
          The password is set directly — share it with the user privately and ask them to change it.
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
        <GlassInput
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
