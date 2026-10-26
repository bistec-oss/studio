'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Users as UsersIcon, UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PageHead } from '@/components/ui/PageHead'
import { Panel } from '@/components/ui/Panel'
import { SectionHead } from '@/components/ui/SectionHead'
import {
  FOCUS,
  ICON,
  ICON_BUTTON,
  ICON_SM,
  ROW,
  SCROLL_FOCUS,
  TABLE_HEAD_ROW,
} from '@/components/ui/atoms'
import { GateNotice } from '@/components/ui/GateNotice'
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
      <GateNotice title="Requires super admin">
        Team management is limited to super administrators.
      </GateNotice>
    )
  }

  return (
    <div className="max-w-4xl">
      <PageHead
        eyebrow="Admin"
        title="Teams"
        lead="Every team on the platform. Manage membership below a selected row."
        className="mb-6"
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus {...ICON} /> Add team
          </Button>
        }
      />

      {/* A ruled data table (§8.15, the study's .ct) on a bezel card (021
          design.md §8), in a focusable, labelled scroll region; `relative`
          contains the sr-only Actions header at 375 px. */}
      <Panel bezel className="min-w-0 p-5">
        <div
          tabIndex={0}
          role="region"
          aria-label="Teams"
          className={`relative overflow-x-auto ${SCROLL_FOCUS}`}
        >
          <table className="w-full min-w-[600px] text-ui-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW}>
                <th scope="col" className="py-2 pr-3 font-semibold">Name</th>
                <th scope="col" className="py-2 pr-6 text-right font-semibold">Members</th>
                <th scope="col" className="py-2 pr-3 font-semibold">Created</th>
                <th scope="col" className="py-2 font-semibold sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b border-line-subtle align-middle last:border-b-0">
                  <td className="break-words py-2.5 pr-3 font-medium text-fg">{t.name}</td>
                  <td className="py-2.5 pr-6 text-right tabular-nums text-fg">{t.memberCount}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-ui-xs text-fg-muted">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="whitespace-nowrap py-1.5">
                    <div className="flex justify-end gap-1">
                      {/* Secondary, expanded while its panel shows: the page
                          keeps one primary (§8.2, 021 A13). */}
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-expanded={selectedTeamId === t.id}
                        onClick={() => setSelectedTeamId(selectedTeamId === t.id ? null : t.id)}
                      >
                        <UsersIcon {...ICON_SM} /> Members
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRenameTarget(t)}>
                        <Pencil {...ICON_SM} /> Rename
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => deleteTeam(t)}>
                        <Trash2 {...ICON_SM} /> Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {teams.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ui-sm text-fg-muted">
                    No teams yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

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
        <Input label="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
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
        <Input
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
    // A bezel card (021 design.md §8), its head the study's .card-hd; the
    // members are ruled rows on --line-subtle.
    <section className="surface-bezel mt-5 min-w-0 p-5">
      <SectionHead title={`Members of ${team.name}`} className="mb-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close member panel"
          className={`${ICON_BUTTON} hover:bg-surface-raised hover:text-fg ${FOCUS}`}
        >
          <X {...ICON} />
        </button>
      </SectionHead>

      <div>
        {members.length === 0 && (
          <p className="text-ui-sm text-fg-muted">No members yet</p>
        )}
        {members.length > 0 && (
          <ul>
            {members.map((m) => (
              <li
                key={m.userId}
                className={`${ROW} flex flex-wrap items-center justify-between gap-x-3 gap-y-2`}
              >
                <div className="min-w-0">
                  <p className="truncate text-ui-base font-medium text-fg" title={m.name}>{m.name}</p>
                  <p className="break-all text-ui-xs text-fg-muted">{m.loginLabel}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Select
                    aria-label={`Role for ${m.name}`}
                    className="w-32"
                    options={ROLE_OPTIONS}
                    value={m.role}
                    onChange={(e) => changeRole(m, e.target.value as 'ADMIN' | 'EDITOR')}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeMember(m)}>
                    <Trash2 {...ICON_SM} /> Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addMember} className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
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
            className="sm:w-32"
            options={ROLE_OPTIONS}
            value={addRole}
            onChange={(e) => setAddRole(e.target.value as 'ADMIN' | 'EDITOR')}
          />
          <Button type="submit" variant="ink" disabled={!addUserId || adding}>
            <UserPlus {...ICON} /> {adding ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </div>
    </section>
  )
}
