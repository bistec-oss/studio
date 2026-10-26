'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Megaphone, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { PageTitle } from '@/components/ui/PageHead'
import { EYEBROW, FOCUS, ICON, ICON_SM, SECTION_HEAD } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { ASIDE_BLOCK, CRUMB_CURRENT, CRUMB_LINK } from '@/components/campaigns/classes'
import type { ProjectDetail, BrandKitSummary } from '@/lib/api-types'

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { isTeamAdmin } = useCurrentUser()
  const [savingKit, setSavingKit] = useState(false)
  // The aside kit select is named by its visible dt (FR-12 row 25).
  const kitLabelId = React.useId()

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
    return <p className="py-8 text-ui-sm text-fg-muted">Loading…</p>
  }

  const activeCampaigns = project.campaigns.filter(c => !c.campaign.isDeleted)

  return (
    <>
      {/* Breadcrumb (DESIGN_SYSTEM.md §8.6, the study's .back), then the page title. */}
      <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-ui-xs text-fg-muted">
        <button type="button" onClick={() => router.push('/projects')} className={`${CRUMB_LINK} ${FOCUS}`}>
          <ArrowLeft {...ICON_SM} aria-hidden /> Projects
        </button>
        <span aria-hidden>/</span>
        <span aria-hidden className={CRUMB_CURRENT}>{project.name}</span>
      </nav>
      <PageTitle className="mb-6 break-words">{project.name}</PageTitle>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        {/* Campaigns list: a bezel card of ruled rows (021 design.md §8). */}
        <section className="surface-bezel min-w-0 p-5">
          <h2 className={`mb-1 ${SECTION_HEAD}`}>Campaigns ({activeCampaigns.length})</h2>
          {activeCampaigns.length === 0 ? (
            <div className="py-8 text-center">
              <Megaphone size={28} strokeWidth={1.6} aria-hidden className="mx-auto mb-2 text-fg-muted" />
              <p className="text-ui-sm text-fg-muted">No campaigns in this project.</p>
              <Link href="/campaigns">
                <Button variant="ghost" size="sm" className="mt-2">Go to Campaigns</Button>
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line-subtle">
              {activeCampaigns.map(({ campaign }) => (
                <li key={campaign.id}>
                  <Link
                    href={`/campaigns/${campaign.id}`}
                    className={`group flex items-center justify-between gap-3 rounded-ui-sm py-3.5 ${FOCUS}`}
                  >
                    {/* The row title (16 px / 600), underlined on hover: --accent is ink. */}
                    <span className="min-w-0 break-words text-ui-lg font-semibold leading-snug text-fg decoration-line underline-offset-4 group-hover:underline">
                      {campaign.name}
                    </span>
                    <ArrowRight {...ICON} aria-hidden className="flex-shrink-0 text-fg-muted transition-colors duration-fast ease-standard group-hover:text-fg" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Project meta: blocks under EYEBROW heads, in one card. */}
        <aside className="surface min-w-0 divide-y divide-line-subtle p-5">
          <section className={ASIDE_BLOCK}>
            <h2 className={`${EYEBROW} mb-3`}>Details</h2>
            <dl className="space-y-3 text-ui-sm">
              <div>
                <dt id={kitLabelId} className="flex items-center gap-1.5 text-ui-xs text-fg-muted">
                  Default brand kit
                  {savingKit && <Loader2 {...ICON_SM} className="animate-spin" aria-hidden />}
                </dt>
                {isTeamAdmin ? (
                  <dd className="mt-1">
                    <Select
                      aria-labelledby={kitLabelId}
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
                  <dd className="font-medium text-fg">
                    {project.defaultBrandKit?.name ?? '—'}
                  </dd>
                )}
              </div>
              <div>
                <dt className="text-ui-xs text-fg-muted">Default tone</dt>
                <dd className="font-medium capitalize text-fg">
                  {project.defaultTone ?? '—'}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  )
}
