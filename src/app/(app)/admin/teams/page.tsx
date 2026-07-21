'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldAlert, Pencil, Trash2, Users as UsersIcon, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { GlassInput } from '@/components/ui/GlassInput'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { AdminTeamSummary, AdminTeamMember } from '@/lib/api-types'

// Super-admin platform-wide team management — models admin/users/page.tsx
// (same gate pattern, same table/modal conventions). Distinct from /team,
// which is a team-admin's OWN team's settings; this page manages every team
// on the platform: create/rename/soft-delete + membership.

interface ManagedUserRef {
  id: string
  name: string
  username: string | null
  displayUsername: string | null
  email: string
}

function loginLabel(u: { username: string | null; displayUsername: string | null; email: string }): string {
  return u.displayUsername ?? u.username ?? u.email
}

const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EDITOR', label: 'Editor' },
]

export default function AdminTeamsPage() {
  const { isSuperAdmin, isLoading } = useCurrentUser()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [addOpen, setAddOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<AdminTeamSummary | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  const { data: teams = [] } = useQuery({
    queryKey: ['admin', 'teams'],
    queryFn: () => apiFetch<AdminTeamSummary[]>('/api/admin/teams'),
    enabled: isSuperAdmin,
  })

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] })
  }

  async function deleteTeam(team: AdminTeamSummary) {
    const ok = await confirm({
      title: `Delete "${team.name}"?`,
      description: `This soft-deletes the team — its ${team.memberCount} member(s) and content stay intact, but the team drops out of every switcher and listing. This cannot be undone from the UI.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/teams/${team.id}`, { method: 'DELETE' })
      toast.success(`${team.name} deleted`)
      if (selectedTeamId === team.id) setSelectedTeamId(null)
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete team')
    }
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
          Team management is limited to super administrators.
        </p>
      </GlassPanel>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-light-text dark:text-dark-text">Teams</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            Every team on the platform. Manage membership below a selected row.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add team
        </Button>
      </div>

      <GlassPanel className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-light-text-muted dark:text-dark-text-muted">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Members</th>
                <th className="py-2 pr-3 font-medium">Created</th>
                <th className="py-2 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-t border-light-border/50 dark:border-dark-border/50">
                  <td className="py-2.5 pr-3 font-medium text-light-text dark:text-dark-text">{t.name}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-light-text dark:text-dark-text">{t.memberCount}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-light-text-muted dark:text-dark-text-muted whitespace-nowrap">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 whitespace-nowrap">
                    <div className="flex gap-1 justify-end">
                      <Button
                        variant={selectedTeamId === t.id ? 'primary' : 'ghost'}
                        size="sm"
                        onClick={() => setSelectedTeamId(selectedTeamId === t.id ? null : t.id)}
                      >
                        <UsersIcon size={13} /> Members
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRenameTarget(t)}>
                        <Pencil size={13} /> Rename
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => deleteTeam(t)}>
                        <Trash2 size={13} /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-light-text-muted dark:text-dark-text-muted italic">
                    No teams yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {selectedTeamId && (
        <TeamMembersPanel
          key={selectedTeamId}
          team={teams.find((t) => t.id === selectedTeamId) ?? null}
          onClose={() => setSelectedTeamId(null)}
          onMembershipChanged={invalidate}
        />
      )}

      <AddTeamModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={invalidate} />
      {/* Keyed on the target so the name field re-initializes per team instead
          of carrying over a previous edit (the modal wrapper otherwise stays
          mounted across opens). */}
      <RenameTeamModal
        key={renameTarget?.id ?? 'none'}
        target={renameTarget}
        onClose={() => setRenameTarget(null)}
        onSaved={invalidate}
      />
    </div>
  )
}

function AddTeamModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiFetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      toast.success(`Team "${name}" created`)
      await onSaved()
      setName('')
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create team')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add team" size="sm">
      <form onSubmit={submit} className="space-y-3">
        <GlassInput label="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create team'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function RenameTeamModal({
  target,
  onClose,
  onSaved,
}: {
  target: AdminTeamSummary | null
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const [name, setName] = useState(target?.name ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!target) return
    setSaving(true)
    try {
      await apiFetch(`/api/admin/teams/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      toast.success('Team renamed')
      await onSaved()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to rename team')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={`Rename team${target ? ` — ${target.name}` : ''}`}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-3">
        <GlassInput
          label="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Rename'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TeamMembersPanel({
  team,
  onClose,
  onMembershipChanged,
}: {
  team: AdminTeamSummary | null
  onClose: () => void
  onMembershipChanged: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [addUserId, setAddUserId] = useState('')
  const [addRole, setAddRole] = useState<'ADMIN' | 'EDITOR'>('EDITOR')
  const [adding, setAdding] = useState(false)

  const membersQuery = useQuery({
    queryKey: ['admin', 'teams', team?.id, 'members'],
    queryFn: () => apiFetch<AdminTeamMember[]>(`/api/admin/teams/${team!.id}/members`),
    enabled: !!team,
  })
  const members = membersQuery.data ?? []

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => apiFetch<ManagedUserRef[]>('/api/admin/users'),
  })
  const allUsers = usersQuery.data ?? []
  const memberIds = new Set(members.map((m) => m.userId))
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id))

  function invalidateMembers() {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'teams', team?.id, 'members'] })
  }

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    if (!team || !addUserId) return
    setAdding(true)
    try {
      await apiFetch(`/api/admin/teams/${team.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: addUserId, role: addRole }),
      })
      toast.success('Member added')
      setAddUserId('')
      setAddRole('EDITOR')
      await invalidateMembers()
      await onMembershipChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setAdding(false)
    }
  }

  async function changeRole(member: AdminTeamMember, role: 'ADMIN' | 'EDITOR') {
    if (!team) return
    try {
      await apiFetch(`/api/admin/teams/${team.id}/members/${member.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      toast.success('Role updated')
      await invalidateMembers()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role')
    }
  }

  async function removeMember(member: AdminTeamMember) {
    if (!team) return
    const ok = await confirm({
      title: `Remove ${member.name} from ${team.name}?`,
      description: 'They lose access to this team\'s content and settings immediately.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    try {
      await apiFetch(`/api/admin/teams/${team.id}/members/${member.userId}`, { method: 'DELETE' })
      toast.success('Member removed')
      await invalidateMembers()
      await onMembershipChanged()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove member')
    }
  }

  if (!team) return null

  return (
    <GlassPanel className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-light-text dark:text-dark-text">
          Members of {team.name}
        </h2>
        <button
          onClick={onClose}
          aria-label="Close member panel"
          className="text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {members.length === 0 && (
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted italic">No members yet</p>
        )}
        {members.map((m) => (
          <div
            key={m.userId}
            className="glass-input rounded-xl p-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-sm text-light-text dark:text-dark-text truncate">{m.name}</p>
              <p className="font-mono text-xs text-light-text-muted dark:text-dark-text-muted">{m.loginLabel}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Select
                aria-label={`Role for ${m.name}`}
                className="w-28 py-1"
                options={ROLE_OPTIONS}
                value={m.role}
                onChange={(e) => changeRole(m, e.target.value as 'ADMIN' | 'EDITOR')}
              />
              <Button variant="ghost" size="sm" onClick={() => removeMember(m)}>
                <Trash2 size={13} /> Remove
              </Button>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={addMember} className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-light-border/50 dark:border-dark-border/50">
        <div className="flex-1">
          <Select
            aria-label="User to add"
            options={[
              { value: '', label: availableUsers.length ? 'Select a user…' : 'No available users' },
              ...availableUsers.map((u) => ({ value: u.id, label: `${u.name} (${loginLabel(u)})` })),
            ]}
            value={addUserId}
            onChange={(e) => setAddUserId(e.target.value)}
          />
        </div>
        <Select
          aria-label="Role for new member"
          className="sm:w-28"
          options={ROLE_OPTIONS}
          value={addRole}
          onChange={(e) => setAddRole(e.target.value as 'ADMIN' | 'EDITOR')}
        />
        <Button type="submit" disabled={!addUserId || adding}>
          <UserPlus size={14} /> {adding ? 'Adding…' : 'Add'}
        </Button>
      </form>
    </GlassPanel>
  )
}
