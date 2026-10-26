'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, RotateCcw, Megaphone, Palette, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Panel } from '@/components/ui/Panel'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { QueryError } from '@/components/ui/QueryError'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { PageHead } from '@/components/ui/PageHead'
import { FOCUS, ICON, ICON_BUTTON, ICON_SM, SECTION_HEAD, TAG } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { ROW_TITLE } from '@/components/campaigns/classes'
import { postStyleLabel, postStyleOptions } from '@/components/campaigns/postStyleOptions'
import type { Campaign, BrandKitSummary, ProjectSummary, ProjectRef } from '@/lib/api-types'

// A campaign row in a group card: ruled above on --line-subtle, except the
// first row of each column (one column below lg, two from lg).
const LIST_ROW =
  'flex min-w-0 items-start gap-3 border-t border-line-subtle py-3.5 first:border-t-0 lg:[&:nth-child(2)]:border-t-0'

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrandKitId, setNewBrandKitId] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
  const [newPostStyle, setNewPostStyle] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  const {
    data: campaigns = [],
    isLoading: loading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<Campaign[]>('/api/campaigns'),
  })

  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/api/projects'),
  })

  function invalidateCampaigns() {
    return queryClient.invalidateQueries({ queryKey: ['campaigns'] })
  }

  const brandKitOptions = [
    { value: '', label: 'No brand kit (inherit / system default)' },
    ...brandKits.map(k => ({ value: k.id, label: k.name })),
  ]
  const projectOptions = [
    { value: '', label: 'Standalone (no project)' },
    ...projects.map(p => ({ value: p.id, label: p.name })),
  ]

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      await apiFetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          brandKitId: newBrandKitId || undefined,
          projectId: newProjectId || undefined,
          defaultPostStyle: newPostStyle || undefined,
        }),
      })
      setNewName(''); setNewBrandKitId(''); setNewProjectId(''); setNewPostStyle(''); setCreating(false)
      invalidateCampaigns()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function softDelete(id: string) {
    if (!(await confirm({
      title: 'Delete this campaign?',
      description: 'You can restore it later from "Show deleted".',
      confirmLabel: 'Delete',
    }))) return
    try {
      await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' })
      invalidateCampaigns()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  async function restore(id: string) {
    try {
      await apiFetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDeleted: false }),
      })
      invalidateCampaigns()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  const visible = campaigns.filter(c => showDeleted ? c.isDeleted : !c.isDeleted)

  // Group campaigns under their parent project (the API returns a join
  // array, but the app only ever assigns one project per campaign);
  // standalone campaigns form the trailing group.
  const groupMap = new Map<string, { project: ProjectRef | null; campaigns: Campaign[] }>()
  for (const c of visible) {
    const project = c.projects[0]?.project ?? null
    const key = project?.id ?? ''
    const group = groupMap.get(key) ?? { project, campaigns: [] }
    group.campaigns.push(c)
    groupMap.set(key, group)
  }
  const groups = [...groupMap.values()].sort((a, b) => {
    if (!a.project) return 1
    if (!b.project) return -1
    return a.project.name.localeCompare(b.project.name)
  })

  return (
    <>
      {/* Page head (DESIGN_SYSTEM.md §6): an eyebrow, the title, a lead. */}
      <PageHead
        className="mb-6"
        eyebrow="Organize"
        title="Campaigns"
        lead="Group posts by campaign, assign a brand kit override and set a default post style."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowDeleted(v => !v)}>
              {showDeleted ? 'Show active' : 'Show deleted'}
            </Button>
            {/* One accent primary per view: while the form is open its Create is
                the primary, and this toggle shows as an open Outline button. */}
            <Button
              variant={creating ? 'secondary' : 'primary'}
              aria-expanded={creating}
              onClick={() => setCreating(v => !v)}
            >
              <Plus {...ICON} /> New Campaign
            </Button>
          </>
        }
      />

      {creating && (
        <Panel className="mb-5 animate-fade-in p-5">
          <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Input
                label="Campaign name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Summer Product Launch"
                autoFocus
              />
            </div>
            <div className="sm:w-52">
              <Select
                label="Project"
                options={projectOptions}
                value={newProjectId}
                onChange={e => setNewProjectId(e.target.value)}
              />
            </div>
            <div className="sm:w-52">
              <Select
                label="Brand kit"
                options={brandKitOptions}
                value={newBrandKitId}
                onChange={e => setNewBrandKitId(e.target.value)}
              />
            </div>
            <div className="sm:w-52">
              <Select
                label="Default post style"
                options={postStyleOptions('No default (General)')}
                value={newPostStyle}
                onChange={e => setNewPostStyle(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!newName.trim()}>Create</Button>
              <Button variant="ghost" type="button" onClick={() => { setCreating(false); setNewName(''); setNewBrandKitId(''); setNewProjectId(''); setNewPostStyle('') }}>Cancel</Button>
            </div>
          </form>
        </Panel>
      )}

      {loading && (
        <p className="py-8 text-center text-ui-sm text-fg-muted">Loading…</p>
      )}

      {isError && (
        <QueryError error={error} onRetry={() => refetch()} />
      )}

      {!loading && !isError && visible.length === 0 && (
        <Panel bezel className="py-12 text-center">
          <Megaphone size={28} strokeWidth={1.6} aria-hidden className="mx-auto mb-3 text-fg-muted" />
          <p className="text-ui-sm text-fg-muted">
            {showDeleted ? 'No deleted campaigns.' : 'No campaigns yet.'}
          </p>
        </Panel>
      )}

      {!isError && (
        <div className="space-y-5">
          {groups.map(group => (
            // Each project's campaigns: one bezel card (021 design.md §8).
            <section key={group.project?.id ?? 'standalone'} className="surface-bezel min-w-0 p-5">
              {/* The card head: the project's name as a section head linking to
                  the project, its count on the right. */}
              <div className="mb-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h2 className={`min-w-0 break-words ${SECTION_HEAD}`}>
                  {group.project ? (
                    <Link
                      href={`/projects/${group.project.id}`}
                      className={`rounded-ui-sm text-fg decoration-line underline-offset-4 hover:underline ${FOCUS}`}
                    >
                      {group.project.name}
                    </Link>
                  ) : (
                    <span className="text-fg-muted">Standalone</span>
                  )}
                </h2>
                <span className="ml-auto text-ui-xs text-fg-muted">
                  {group.campaigns.length} campaign{group.campaigns.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Campaigns as ruled rows on --line-subtle (§6), two columns on
                  wide screens. Each row is ruled above, except the first row of
                  each column. */}
              <ul className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-10">
                {group.campaigns.map(campaign => (
                  <li key={campaign.id} className={LIST_ROW}>
                    <div className="min-w-0 flex-1">
                      <Link href={`/campaigns/${campaign.id}`} className={`rounded-ui-sm ${ROW_TITLE} ${FOCUS}`}>
                        {campaign.name}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-ui-xs text-fg-muted">
                        <span>{campaign._count.briefs} brief{campaign._count.briefs !== 1 ? 's' : ''}</span>
                        {campaign.brandKit && (
                          <span title={`Brand kit: ${campaign.brandKit.name}`} className={TAG}>
                            <Palette {...ICON_SM} aria-hidden className="flex-shrink-0 text-fg-muted" />
                            <span className="truncate">{campaign.brandKit.name}</span>
                          </span>
                        )}
                        {postStyleLabel(campaign.defaultPostStyle) && (
                          <span title="Default post style" className={TAG} data-testid="campaign-post-style">
                            <span className="truncate">{postStyleLabel(campaign.defaultPostStyle)}</span>
                          </span>
                        )}
                        {campaign.defaultTone && (
                          <span title="Default tone" className={`${TAG} capitalize`}>
                            <MessageCircle {...ICON_SM} aria-hidden className="flex-shrink-0 text-fg-muted" />
                            <span className="truncate">{campaign.defaultTone}</span>
                          </span>
                        )}
                      </div>
                    </div>
                    {campaign.isDeleted ? (
                      <Button variant="ghost" size="sm" onClick={() => restore(campaign.id)}>
                        <RotateCcw {...ICON} /> Restore
                      </Button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete ${campaign.name}`}
                        title="Delete"
                        onClick={() => softDelete(campaign.id)}
                        className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                      >
                        <Trash2 {...ICON} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
