'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Megaphone, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import type { ProjectDetail, BrandKitSummary } from '@/lib/api-types'

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isTeamAdmin } = useCurrentUser()
  const [savingKit, setSavingKit] = useState(false)

  const projectQuery = useQuery({
    queryKey: ['projects', params.id],
    queryFn: () => apiFetch<ProjectDetail>(`/api/projects/${params.id}`),
  })

  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })

  const project = projectQuery.data

  // Mirrors the previous try/catch behaviour: a failed/missing project
  // bounces back to the list rather than showing a dead-end detail page.
  useEffect(() => {
    if (projectQuery.isError) router.push('/projects')
  }, [projectQuery.isError, router])

  async function updateBrandKit(value: string) {
    setSavingKit(true)
    try {
      await apiFetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultBrandKitId: value || null }),
      })
      await queryClient.invalidateQueries({ queryKey: ['projects', params.id] })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update brand kit')
    } finally {
      setSavingKit(false)
    }
  }

  if (projectQuery.isLoading || projectQuery.isError || !project) {
    return <div className="text-sm text-light-text-muted dark:text-dark-text-muted py-8">Loading…</div>
  }

  const activeCampaigns = project.campaigns.filter(c => !c.campaign.isDeleted)

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
          <ArrowLeft size={14} /> Projects
        </Button>
        <span className="text-light-text-muted dark:text-dark-text-muted">/</span>
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">{project.name}</h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* Campaigns list */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
            Campaigns ({activeCampaigns.length})
          </h2>
          {activeCampaigns.length === 0 ? (
            <GlassPanel className="p-6 text-center">
              <Megaphone size={28} className="mx-auto mb-2 text-light-text-muted dark:text-dark-text-muted" />
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No campaigns in this project.</p>
              <Link href="/campaigns">
                <Button variant="ghost" size="sm" className="mt-2">Go to Campaigns</Button>
              </Link>
            </GlassPanel>
          ) : (
            <div className="space-y-2">
              {activeCampaigns.map(({ campaign }) => (
                <Link key={campaign.id} href={`/campaigns/${campaign.id}`}>
                  <GlassPanel className="p-4 flex items-center justify-between hover:bg-primary/5 dark:hover:bg-primary-light/5 transition-colors cursor-pointer">
                    <span className="text-sm font-medium text-light-text dark:text-dark-text">{campaign.name}</span>
                    <ArrowLeft size={14} className="rotate-180 text-light-text-muted dark:text-dark-text-muted" />
                  </GlassPanel>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Project meta */}
        <div className="space-y-3">
          <GlassPanel className="p-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-light-text-muted dark:text-dark-text-muted mb-3">
              Details
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-light-text-muted dark:text-dark-text-muted flex items-center gap-1.5">
                  Default brand kit
                  {savingKit && <Loader2 size={11} className="animate-spin" />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      options={[
                        { value: '', label: 'No default brand kit' },
                        ...brandKits.map(k => ({ value: k.id, label: k.name })),
                      ]}
                      value={project.defaultBrandKit?.id ?? ''}
                      onChange={e => updateBrandKit(e.target.value)}
                      disabled={savingKit}
                    />
                  </dd>
                ) : (
                  <dd className="text-light-text dark:text-dark-text font-medium">
                    {project.defaultBrandKit?.name ?? '—'}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-light-text-muted dark:text-dark-text-muted">Default tone</dt>
                <dd className="text-light-text dark:text-dark-text font-medium capitalize">
                  {project.defaultTone ?? '—'}
                </dd>
              </div>
            </dl>
          </GlassPanel>
        </div>
      </div>
    </>
  )
}
