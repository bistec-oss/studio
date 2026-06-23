'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'

interface Campaign {
  id: string
  name: string
  defaultTone: string | null
  brandKit: { id: string; name: string } | null
  projects: Array<{ project: { id: string; name: string } }>
  _count: { briefs: number }
}

interface ResolvedKit {
  kit: { id: string; name: string; colors: string[] } | null
  source: 'campaign' | 'project' | 'system' | null
}

const SOURCE_LABEL: Record<string, string> = {
  campaign: 'Campaign override',
  project: 'Inherited from project',
  system: 'System default',
}

async function apiFetch(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
  return res.json()
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [resolved, setResolved] = useState<ResolvedKit | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const [camp, kit] = await Promise.all([
        apiFetch(`/api/campaigns/${params.id}`),
        apiFetch(`/api/campaigns/${params.id}/brandkit`),
      ])
      setCampaign(camp)
      setResolved(kit)
    } catch {
      router.push('/campaigns')
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return <div className="text-sm text-light-text-muted dark:text-dark-text-muted py-8">Loading…</div>
  }

  if (!campaign) return null

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
                <dt className="text-light-text-muted dark:text-dark-text-muted">Default tone</dt>
                <dd className="text-light-text dark:text-dark-text font-medium capitalize">
                  {campaign.defaultTone ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-light-text-muted dark:text-dark-text-muted">Brand kit override</dt>
                <dd className="text-light-text dark:text-dark-text font-medium">
                  {campaign.brandKit?.name ?? '—'}
                </dd>
              </div>
            </dl>
          </GlassPanel>
        </div>
      </div>
    </>
  )
}
