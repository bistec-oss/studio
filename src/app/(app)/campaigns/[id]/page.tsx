'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { Campaign, BrandKitSummary, ProjectSummary, ResolvedBrandKitResponse } from '@/lib/api-types'

const SOURCE_LABEL: Record<string, string> = {
  explicit: 'Selected for this post',
  campaign: 'Campaign override',
  project: 'Inherited from project',
  system: 'System default',
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isAdmin } = useCurrentUser()
  const [savingKit, setSavingKit] = useState(false)
  const [savingProject, setSavingProject] = useState(false)

  const campaignQuery = useQuery({
    queryKey: ['campaigns', params.id],
    queryFn: () => apiFetch<Campaign>(`/api/campaigns/${params.id}`),
  })

  const resolvedQuery = useQuery({
    queryKey: ['campaigns', params.id, 'brandkit'],
    queryFn: () => apiFetch<ResolvedBrandKitResponse>(`/api/campaigns/${params.id}/brandkit`),
  })

  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectSummary[]>('/api/projects'),
  })

  const campaign = campaignQuery.data
  const resolved = resolvedQuery.data

  // Mirrors the previous try/catch behaviour: a failed/missing campaign
  // bounces back to the list rather than showing a dead-end detail page.
  useEffect(() => {
    if (campaignQuery.isError) router.push('/campaigns')
  }, [campaignQuery.isError, router])

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['campaigns', params.id] }),
      queryClient.invalidateQueries({ queryKey: ['campaigns', params.id, 'brandkit'] }),
    ])
  }

  async function updateBrandKit(value: string) {
    setSavingKit(true)
    try {
      await apiFetch(`/api/campaigns/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKitId: value || null }),
      })
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update brand kit')
    } finally {
      setSavingKit(false)
    }
  }

  async function updateProject(value: string) {
    setSavingProject(true)
    try {
      await apiFetch(`/api/campaigns/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // API replaces project membership: '' clears it (standalone).
        body: JSON.stringify({ projectId: value || '' }),
      })
      await invalidate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update project')
    } finally {
      setSavingProject(false)
    }
  }

  if (campaignQuery.isLoading || campaignQuery.isError || !campaign) {
    return <div className="text-sm text-light-text-muted dark:text-dark-text-muted py-8">Loading…</div>
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/campaigns')}>
          <ArrowLeft size={14} /> Campaigns
        </Button>
        <span className="text-light-text-muted dark:text-dark-text-muted">/</span>
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">{campaign.name}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Stats */}
        <div className="space-y-4">
          <GlassPanel className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
              Briefs ({campaign._count.briefs})
            </h3>
            {campaign._count.briefs === 0 ? (
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                No briefs created under this campaign yet.
              </p>
            ) : (
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                {campaign._count.briefs} brief{campaign._count.briefs !== 1 ? 's' : ''} in this campaign.
              </p>
            )}
          </GlassPanel>

          {campaign.projects.length > 0 && (
            <GlassPanel className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
                Projects
              </h3>
              <div className="flex flex-wrap gap-2">
                {campaign.projects.map(({ project }) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="text-sm text-primary dark:text-primary-light hover:underline"
                  >
                    {project.name}
                  </Link>
                ))}
              </div>
            </GlassPanel>
          )}
        </div>

        {/* Brand kit + meta */}
        <div className="space-y-3">
          {resolved?.kit && (
            <GlassPanel className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
                Brand Kit
              </h3>
              <p className="text-sm font-medium text-light-text dark:text-dark-text">{resolved.kit.name}</p>
              {resolved.source && (
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
                  {SOURCE_LABEL[resolved.source]}
                </p>
              )}
              {resolved.kit.colors.length > 0 && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {resolved.kit.colors.map(c => (
                    <span
                      key={c}
                      className="inline-block w-5 h-5 rounded-md border border-black/10 dark:border-white/10"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              )}
            </GlassPanel>
          )}

          <GlassPanel className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
              Details
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-light-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  Project
                  {savingProject && <Loader2 size={11} className="animate-spin" />}
                </dt>
                {isAdmin ? (
                  <dd className="mt-1">
                    <Select
                      options={[
                        { value: '', label: 'Standalone (no project)' },
                        ...projects.map(p => ({ value: p.id, label: p.name })),
                      ]}
                      value={campaign.projects[0]?.project.id ?? ''}
                      onChange={e => updateProject(e.target.value)}
                      disabled={savingProject}
                    />
                  </dd>
                ) : (
                  <dd className="text-light-text dark:text-dark-text font-medium">
                    {campaign.projects[0]?.project.name ?? 'Standalone'}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-light-text-muted dark:text-dark-text-muted">Default tone</dt>
                <dd className="text-light-text dark:text-dark-text font-medium capitalize">
                  {campaign.defaultTone ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-light-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  Brand kit override
                  {savingKit && <Loader2 size={11} className="animate-spin" />}
                </dt>
                {isAdmin ? (
                  <dd className="mt-1">
                    <Select
                      options={[
                        { value: '', label: 'No override (inherit / system default)' },
                        ...brandKits.map(k => ({ value: k.id, label: k.name })),
                      ]}
                      value={campaign.brandKit?.id ?? ''}
                      onChange={e => updateBrandKit(e.target.value)}
                      disabled={savingKit}
                    />
                  </dd>
                ) : (
                  <dd className="text-light-text dark:text-dark-text font-medium">
                    {campaign.brandKit?.name ?? '—'}
                  </dd>
                )}
              </div>
            </dl>
          </GlassPanel>
        </div>
      </div>
    </>
  )
}
