'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, RotateCcw, Megaphone, FolderOpen, Palette, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { GlassInput } from '@/components/ui/GlassInput'
import { Select } from '@/components/ui/Select'
import { QueryError } from '@/components/ui/QueryError'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import type { Campaign, BrandKitSummary, ProjectSummary, ProjectRef } from '@/lib/api-types'

export default function CampaignsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBrandKitId, setNewBrandKitId] = useState('')
  const [newProjectId, setNewProjectId] = useState('')
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
        }),
      })
      setNewName(''); setNewBrandKitId(''); setNewProjectId(''); setCreating(false)
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Campaigns</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Group posts by campaign and assign a brand kit override.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowDeleted(v => !v)}>
            {showDeleted ? 'Show active' : 'Show deleted'}
          </Button>
          <Button onClick={() => setCreating(v => !v)}>
            <Plus size={16} /> New Campaign
          </Button>
        </div>
      </div>

      {creating && (
        <GlassPanel className="p-4 mb-4 animate-fade-in">
          <form onSubmit={create} className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <GlassInput
              label="Campaign name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Summer Product Launch"
              className="flex-1"
              autoFocus
            />
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
            <div className="flex gap-2">
              <Button type="submit" disabled={!newName.trim()}>Create</Button>
              <Button variant="ghost" type="button" onClick={() => { setCreating(false); setNewName(''); setNewBrandKitId(''); setNewProjectId('') }}>Cancel</Button>
            </div>
          </form>
        </GlassPanel>
      )}

      {loading && (
        <div className="text-sm text-light-text-muted dark:text-dark-text-muted py-8 text-center">Loading…</div>
      )}

      {isError && (
        <QueryError error={error} onRetry={() => refetch()} />
      )}

      {!loading && !isError && visible.length === 0 && (
        <GlassPanel className="p-8 text-center">
          <Megaphone size={32} className="mx-auto mb-3 text-light-text-muted dark:text-dark-text-muted" />
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            {showDeleted ? 'No deleted campaigns.' : 'No campaigns yet.'}
          </p>
        </GlassPanel>
      )}

      {!isError && (
        <div className="space-y-6">
          {groups.map(group => (
            <section key={group.project?.id ?? 'standalone'}>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={15} className="text-light-text-muted dark:text-dark-text-muted" />
                {group.project ? (
                  <Link
                    href={`/projects/${group.project.id}`}
                    className="text-sm font-semibold uppercase tracking-widest text-light-text dark:text-dark-text hover:text-primary dark:hover:text-primary-light transition-colors"
                  >
                    {group.project.name}
                  </Link>
                ) : (
                  <span className="text-sm font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted">
                    Standalone
                  </span>
                )}
                <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  {group.campaigns.length} campaign{group.campaigns.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.campaigns.map(campaign => (
                  <GlassPanel key={campaign.id} className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="text-base font-semibold text-light-text dark:text-dark-text hover:text-primary dark:hover:text-primary-light transition-colors"
                      >
                        {campaign.name}
                      </Link>
                      {campaign.isDeleted ? (
                        <Button variant="ghost" size="sm" onClick={() => restore(campaign.id)}>
                          <RotateCcw size={13} /> Restore
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => softDelete(campaign.id)}>
                          <Trash2 size={13} />
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs text-light-text-muted dark:text-dark-text-muted">
                      <span>{campaign._count.briefs} brief{campaign._count.briefs !== 1 ? 's' : ''}</span>
                      {campaign.brandKit && (
                        <span
                          title="Brand kit"
                          className="inline-flex items-center gap-1 bg-primary/8 dark:bg-primary-light/8 text-primary dark:text-primary-light px-2 py-0.5 rounded-full"
                        >
                          <Palette size={11} />
                          {campaign.brandKit.name}
                        </span>
                      )}
                      {campaign.defaultTone && (
                        <span
                          title="Default tone"
                          className="inline-flex items-center gap-1 bg-primary/5 dark:bg-primary-light/5 px-2 py-0.5 rounded-full capitalize"
                        >
                          <MessageCircle size={11} />
                          {campaign.defaultTone}
                        </span>
                      )}
                    </div>
                  </GlassPanel>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
