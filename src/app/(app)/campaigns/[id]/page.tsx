'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import { PageTitle } from '@/components/ui/PageHead'
import { EYEBROW, FOCUS, ICON_SM, TEXT_LINK } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { ASIDE_BLOCK, CRUMB_CURRENT, CRUMB_LINK } from '@/components/campaigns/classes'
import { CampaignBriefingSection } from '@/components/campaigns/CampaignBriefingSection'
import { ScheduledQueueSection } from '@/components/campaigns/ScheduledQueueSection'
import { postStyleLabel, postStyleOptions } from '@/components/campaigns/postStyleOptions'
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
  const { isTeamAdmin } = useCurrentUser()
  const [savingKit, setSavingKit] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const [savingStyle, setSavingStyle] = useState(false)
  // The aside selects are named by their visible dt (FR-12 rows 23, 24).
  const projectLabelId = React.useId()
  const kitLabelId = React.useId()
  const styleLabelId = React.useId()

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

  // 027 FR-08: '' clears the default (the wizard then falls to General).
  async function updatePostStyle(value: string) {
    setSavingStyle(true)
    try {
      await apiFetch(`/api/campaigns/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultPostStyle: value || null }),
      })
      await invalidate()
      // The brief wizard and the list read the same campaigns cache.
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update post style')
    } finally {
      setSavingStyle(false)
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
    return <p className="py-8 text-ui-sm text-fg-muted">Loading…</p>
  }

  const parentProject = campaign.projects[0]?.project ?? null

  return (
    <>
      {/* Breadcrumb (DESIGN_SYSTEM.md §8.6, the study's .back): Projects /
          <project> / <campaign> under a project, Campaigns / <campaign> when
          standalone. */}
      <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-ui-xs text-fg-muted">
        {parentProject ? (
          <>
            <button type="button" onClick={() => router.push('/projects')} className={`${CRUMB_LINK} ${FOCUS}`}>
              <ArrowLeft {...ICON_SM} aria-hidden /> Projects
            </button>
            <span aria-hidden>/</span>
            <Link href={`/projects/${parentProject.id}`} className={`${CRUMB_LINK} min-w-0 break-words ${FOCUS}`}>
              {parentProject.name}
            </Link>
          </>
        ) : (
          <button type="button" onClick={() => router.push('/campaigns')} className={`${CRUMB_LINK} ${FOCUS}`}>
            <ArrowLeft {...ICON_SM} aria-hidden /> Campaigns
          </button>
        )}
        <span aria-hidden>/</span>
        <span aria-hidden className={CRUMB_CURRENT}>{campaign.name}</span>
      </nav>
      <PageTitle className="mb-6 break-words">{campaign.name}</PageTitle>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* The briefing and the queue: two bezel cards (021 design.md §8). */}
        <div className="min-w-0 space-y-5">
          <CampaignBriefingSection campaignId={params.id} isTeamAdmin={isTeamAdmin} />

          <ScheduledQueueSection
            campaignId={params.id}
            resolvedKitId={resolved?.kit?.id ?? null}
            isTeamAdmin={isTeamAdmin}
          />
        </div>

        {/* Brand kit, details, briefs and projects: blocks under EYEBROW heads,
            ruled apart in one card. */}
        <aside className="surface min-w-0 divide-y divide-line-subtle p-5">
          {resolved?.kit && (
            <section className={ASIDE_BLOCK}>
              <h2 className={`${EYEBROW} mb-3`}>Brand kit</h2>
              <p className="break-words text-ui-sm font-medium text-fg">{resolved.kit.name}</p>
              {resolved.source && (
                <p className="mt-0.5 text-ui-xs text-fg-muted">
                  {SOURCE_LABEL[resolved.source]}
                </p>
              )}
              {resolved.kit.colors.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {resolved.kit.colors.map(c => (
                    <span
                      key={c}
                      className="inline-block h-5 w-5 rounded-ui-sm border border-line"
                      style={{ backgroundColor: c }} // ui-exception: brand-kit swatch, the kit's own colour from data
                      title={c}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <section className={ASIDE_BLOCK}>
            <h2 className={`${EYEBROW} mb-3`}>Details</h2>
            <dl className="space-y-3 text-ui-sm">
              <div>
                <dt id={projectLabelId} className="flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  Project
                  {savingProject && <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      aria-labelledby={projectLabelId}
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
                  <dd className="font-medium text-fg">
                    {campaign.projects[0]?.project.name ?? 'Standalone'}
                  </dd>
                )}
              </div>
              <div>
                <dt id={styleLabelId} className="flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  Default post style
                  {savingStyle && <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      aria-labelledby={styleLabelId}
                      data-testid="campaign-default-post-style"
                      options={postStyleOptions('No default (General)', campaign.defaultPostStyle)}
                      value={campaign.defaultPostStyle ?? ''}
                      onChange={e => updatePostStyle(e.target.value)}
                      disabled={savingStyle}
                    />
                  </dd>
                ) : (
                  <dd className="font-medium text-fg" data-testid="campaign-default-post-style-text">
                    {postStyleLabel(campaign.defaultPostStyle) ?? 'General'}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-ui-xs text-fg-muted">Default tone</dt>
                <dd className="font-medium capitalize text-fg">
                  {campaign.defaultTone ?? '—'}
                </dd>
              </div>
              <div>
                <dt id={kitLabelId} className="flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  Brand kit override
                  {savingKit && <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      aria-labelledby={kitLabelId}
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
                  <dd className="font-medium text-fg">
                    {campaign.brandKit?.name ?? '—'}
                  </dd>
                )}
              </div>
            </dl>
          </section>

          <section className={ASIDE_BLOCK}>
            <h2 className={`${EYEBROW} mb-3`}>Posts ({campaign._count.briefs})</h2>
            {campaign._count.briefs === 0 ? (
              <p className="text-ui-sm text-fg-muted">
                No posts created under this campaign yet.
              </p>
            ) : (
              <p className="text-ui-sm text-fg-muted">
                {campaign._count.briefs} post{campaign._count.briefs !== 1 ? 's' : ''} in this campaign.
              </p>
            )}
          </section>

          {campaign.projects.length > 0 && (
            <section className={ASIDE_BLOCK}>
              <h2 className={`${EYEBROW} mb-3`}>Projects</h2>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-ui-sm">
                {campaign.projects.map(({ project }) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className={`rounded-ui-sm break-words ${TEXT_LINK} ${FOCUS}`}
                  >
                    {project.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </>
  )
}
