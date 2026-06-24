'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Megaphone, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'

interface Project {
  id: string
  name: string
  defaultTone: string | null
  defaultBrandKit: { id: string; name: string } | null
  campaigns: Array<{
    campaign: { id: string; name: string; isDeleted: boolean }
  }>
}

interface BrandKitOption {
  id: string
  name: string
  previewColor: string
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [brandKits, setBrandKits] = useState<BrandKitOption[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [savingKit, setSavingKit] = useState(false)

  const fetchProject = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/projects/${params.id}`)
      setProject(data)
    } catch {
      router.push('/projects')
    } finally {
      setLoading(false)
    }
  }, [params.id, router])

  useEffect(() => { fetchProject() }, [fetchProject])
  useEffect(() => {
    apiFetch<BrandKitOption[]>('/api/brandkits').then(setBrandKits).catch(console.error)
    apiFetch<{ role: string }>('/api/me')
      .then(u => setIsAdmin(u.role?.toLowerCase() === 'admin'))
      .catch(() => setIsAdmin(false))
  }, [])

  async function updateBrandKit(value: string) {
    setSavingKit(true)
    try {
      await apiFetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultBrandKitId: value || null }),
      })
      await fetchProject()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update brand kit')
    } finally {
      setSavingKit(false)
    }
  }

  if (loading) {
    return <div className="text-sm text-light-text-muted dark:text-dark-text-muted py-8">Loading…</div>
  }

  if (!project) return null

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
                {isAdmin ? (
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
