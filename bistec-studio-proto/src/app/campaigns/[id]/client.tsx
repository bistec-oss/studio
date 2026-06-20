'use client'

import Link from 'next/link'
import { Instagram, Linkedin, Plus, ChevronRight, ArrowUpRight } from 'lucide-react'
import Header from '@/components/Header'
import { Badge } from '@/components/Badge'
import { drafts, projects, getCampaignBrandKit, getBrandKitSource } from '@/data/mock'
import { statusConfig } from '@/lib/utils'
import type { Campaign } from '@/data/mock'

const pathColors: Record<string, string> = {
  A: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  B: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/60',
}

const bkSourceLabel: Record<string, string> = {
  campaign: 'Campaign override',
  project: 'Inherited from project',
  default: 'System default',
}

const bkSourceColors: Record<string, string> = {
  campaign: 'text-blue-600 bg-blue-50 ring-1 ring-blue-200/60',
  project: 'text-violet-600 bg-violet-50 ring-1 ring-violet-200/60',
  default: 'text-slate-500 bg-slate-50 ring-1 ring-slate-200/60',
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
  draft: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60',
  completed: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  archived: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/60',
}

const platformIcon = { instagram: Instagram, linkedin: Linkedin }

export default function CampaignClient({ campaign }: { campaign: Campaign }) {
  const campaignDrafts = drafts.filter(d => d.campaignId === campaign.id)
  const kit = getCampaignBrandKit(campaign)
  const kitSource = getBrandKitSource(campaign)
  const parentProject = campaign.projectIds.length > 0 ? projects.find(p => p.id === campaign.projectIds[0]) : null

  const breadcrumbs = parentProject
    ? [
        { label: 'Projects', href: '/projects' },
        { label: parentProject.name, href: `/projects/${parentProject.id}` },
        { label: campaign.name },
      ]
    : [
        { label: 'Projects', href: '/projects' },
        { label: campaign.name },
      ]

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title={campaign.name} breadcrumbs={breadcrumbs} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Campaign header */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 mb-8">
          <div className="glass rounded-xl p-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <h2 className="text-[1rem] font-bold text-slate-800">{campaign.name}</h2>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.62rem] font-semibold ${statusColors[campaign.status]}`}>
                {campaign.status}
              </span>
              {parentProject && (
                <Link
                  href={`/projects/${parentProject.id}`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[0.68rem] font-medium hover:bg-blue-100 transition-colors"
                >
                  {parentProject.name} <ArrowUpRight size={10} />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-[1.4rem] font-bold text-slate-800">{campaignDrafts.length}</div>
                <div className="text-[0.62rem] uppercase tracking-widest text-slate-400 font-semibold">Posts</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-[1.4rem] font-bold text-emerald-700">{campaignDrafts.filter(d => d.status === 'ready').length}</div>
                <div className="text-[0.62rem] uppercase tracking-widest text-emerald-500 font-semibold">Ready</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-[1.4rem] font-bold text-blue-700">{campaignDrafts.filter(d => d.status === 'published').length}</div>
                <div className="text-[0.62rem] uppercase tracking-widest text-blue-500 font-semibold">Published</div>
              </div>
            </div>
          </div>

          {/* Brand kit card */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-400 mb-3">Brand Kit</h3>
            <div className="flex items-center gap-2.5 mb-2">
              <div className="flex gap-1">
                {[kit.primaryColor, kit.secondaryColor, kit.accentColor].map((color, i) => (
                  <span key={i} className="w-5 h-5 rounded-full border border-white shadow-sm" style={{ background: color }} />
                ))}
              </div>
              <span className="text-[0.82rem] font-semibold text-slate-700">{kit.name}</span>
            </div>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.62rem] font-semibold ${bkSourceColors[kitSource]}`}>
              {bkSourceLabel[kitSource]}
            </span>
            <p className="text-[0.68rem] text-slate-400 mt-2">
              {kitSource === 'campaign' && 'This campaign uses its own brand kit override.'}
              {kitSource === 'project' && `Inherited from project "${parentProject?.name}".`}
              {kitSource === 'default' && 'No override set — using the system default brand kit.'}
            </p>
          </div>
        </div>

        {/* Posts in this campaign */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[0.82rem] font-bold text-slate-700 uppercase tracking-widest">Posts</h2>
          <Link
            href="/brief/new"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.75rem] font-semibold transition-colors"
          >
            <Plus size={13} /> New Brief
          </Link>
        </div>

        {campaignDrafts.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-slate-400 text-[0.88rem]">No posts in this campaign yet.</p>
            <Link href="/brief/new" className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] text-blue-600 hover:text-blue-700 font-medium">
              <Plus size={14} /> Create a brief
            </Link>
          </div>
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Post</th>
                    <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Platform</th>
                    <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Path</th>
                    <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Revisions</th>
                    <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Status</th>
                    <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaignDrafts.map(draft => {
                    const PlatformIcon = platformIcon[draft.platform]
                    return (
                      <tr
                        key={draft.id}
                        className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                        onClick={() => window.location.href = `/draft/${draft.id}`}
                      >
                        <td className="px-4 py-3">
                          <span className="text-[0.82rem] font-medium text-slate-700 group-hover:text-blue-700 transition-colors">{draft.briefSummary}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <PlatformIcon size={13} />
                            <span className="text-[0.75rem] capitalize">{draft.platform}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[0.68rem] font-semibold ${pathColors[draft.pathType]}`}>
                            Path {draft.pathType}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[0.78rem] text-slate-500">{draft.revisions.length}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge status={draft.status} config={statusConfig} />
                        </td>
                        <td className="px-4 py-3">
                          <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
