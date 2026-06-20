'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Instagram, Linkedin, Plus, ChevronRight, FolderOpen } from 'lucide-react'
import Header from '@/components/Header'
import { Badge } from '@/components/Badge'
import { drafts, campaigns, projects, getUncategorizedDrafts } from '@/data/mock'
import { statusConfig } from '@/lib/utils'
import type { DraftStatus, Platform } from '@/data/mock'

const platformIcon = { instagram: Instagram, linkedin: Linkedin }

const statusOrder: DraftStatus[] = ['generating', 'ready', 'pending', 'published', 'failed']
const pathColors: Record<string, string> = {
  A: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  B: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/60',
}

type ScopeFilter =
  | { type: 'all' }
  | { type: 'project'; projectId: string }
  | { type: 'campaign'; campaignId: string }
  | { type: 'uncategorized' }

export default function LibraryPage() {
  const [scope, setScope] = useState<ScopeFilter>({ type: 'all' })
  const [statusFilter, setStatusFilter] = useState<DraftStatus | 'all'>('all')
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all')

  function getScopedDrafts() {
    switch (scope.type) {
      case 'project':
        const campaignIds = campaigns.filter(c => c.projectIds.includes(scope.projectId)).map(c => c.id)
        return drafts.filter(d => d.campaignId && campaignIds.includes(d.campaignId))
      case 'campaign':
        return drafts.filter(d => d.campaignId === scope.campaignId)
      case 'uncategorized':
        return getUncategorizedDrafts()
      default:
        return drafts
    }
  }

  const filtered = getScopedDrafts()
    .filter(d => statusFilter === 'all' || d.status === statusFilter)
    .filter(d => platformFilter === 'all' || d.platform === platformFilter)
    .sort((a, b) => statusOrder.indexOf(a.status as DraftStatus) - statusOrder.indexOf(b.status as DraftStatus))

  // Group by campaign name for display
  const groupedByCampaign: { label: string; items: typeof filtered }[] = []
  if (scope.type === 'campaign' || scope.type === 'uncategorized') {
    groupedByCampaign.push({ label: scope.type === 'uncategorized' ? 'Uncategorized' : campaigns.find(c => c.id === scope.campaignId)?.name ?? '', items: filtered })
  } else {
    const seen = new Set<string | null>()
    const campaignOrder = [...new Set(filtered.map(d => d.campaignId))]
    for (const cid of campaignOrder) {
      if (seen.has(cid)) continue
      seen.add(cid)
      const label = cid ? (campaigns.find(c => c.id === cid)?.name ?? cid) : 'Uncategorized'
      groupedByCampaign.push({ label, items: filtered.filter(d => d.campaignId === cid) })
    }
  }

  const activeCampaign = scope.type === 'campaign' ? campaigns.find(c => c.id === scope.campaignId) : null
  const activeCampaignProjectIds = activeCampaign?.projectIds ?? []
  const activeScopeProject = scope.type === 'project' ? projects.find(p => p.id === scope.projectId) : null

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title="Library" />
      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-0 min-h-full">

          {/* Left — drill-down nav */}
          <aside className="lg:w-56 xl:w-64 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-surface-1">
            <div className="p-4">
              <p className="text-[0.62rem] font-bold uppercase tracking-widest text-slate-400 mb-3">Filter by</p>

              <button
                onClick={() => setScope({ type: 'all' })}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-all mb-0.5 ${
                  scope.type === 'all' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All Posts
                <span className="ml-auto text-[0.72rem] text-slate-400">{drafts.length}</span>
              </button>

              {projects.map(project => {
                const projectCampaigns = campaigns.filter(c => c.projectIds.includes(project.id))
                const projectDraftCount = drafts.filter(d => d.projectId === project.id).length
                const isProjectActive = (scope.type === 'project' && scope.projectId === project.id) ||
                  (scope.type === 'campaign' && activeCampaignProjectIds.includes(project.id))

                return (
                  <div key={project.id}>
                    <button
                      onClick={() => setScope({ type: 'project', projectId: project.id })}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-all mb-0.5 ${
                        scope.type === 'project' && scope.projectId === project.id
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <FolderOpen size={14} className={isProjectActive ? 'text-blue-500' : 'text-slate-400'} />
                      <span className="truncate">{project.name}</span>
                      <span className="ml-auto text-[0.72rem] text-slate-400">{projectDraftCount}</span>
                    </button>

                    {/* Campaign sub-items */}
                    {isProjectActive && projectCampaigns.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setScope({ type: 'campaign', campaignId: c.id })}
                        className={`w-full text-left flex items-center gap-2 pl-8 pr-3 py-1.5 rounded-lg text-[0.76rem] transition-all mb-0.5 ${
                          scope.type === 'campaign' && scope.campaignId === c.id
                            ? 'bg-blue-50 text-blue-600 font-semibold'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                      >
                        <ChevronRight size={11} className="text-slate-300 flex-shrink-0" />
                        <span className="truncate">{c.name}</span>
                        <span className="ml-auto text-[0.68rem] text-slate-400">{drafts.filter(d => d.campaignId === c.id).length}</span>
                      </button>
                    ))}
                  </div>
                )
              })}

              {/* Standalone campaigns with no project */}
              {campaigns.filter(c => c.projectIds.length === 0).map(c => (
                <button
                  key={c.id}
                  onClick={() => setScope({ type: 'campaign', campaignId: c.id })}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-all mb-0.5 ${
                    scope.type === 'campaign' && scope.campaignId === c.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-[0.72rem] text-slate-400">{drafts.filter(d => d.campaignId === c.id).length}</span>
                </button>
              ))}

              <button
                onClick={() => setScope({ type: 'uncategorized' })}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-[0.8rem] font-medium transition-all mb-0.5 ${
                  scope.type === 'uncategorized' ? 'bg-amber-50 text-amber-700' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span className="w-3 h-3 rounded border-2 border-dashed border-slate-300 flex-shrink-0" />
                Uncategorized
                <span className="ml-auto text-[0.72rem] text-slate-400">{getUncategorizedDrafts().length}</span>
              </button>
            </div>
          </aside>

          {/* Right — posts table */}
          <div className="flex-1 min-w-0 p-4 md:p-6">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 mb-4 text-[0.75rem] text-slate-400 flex-wrap">
              <button onClick={() => setScope({ type: 'all' })} className="hover:text-slate-600 transition-colors">All Posts</button>
              {activeScopeProject && (
                <>
                  <ChevronRight size={12} />
                  <span className="text-slate-600 font-medium">{activeScopeProject.name}</span>
                </>
              )}
              {activeCampaign && (
                <>
                  {activeCampaignProjectIds.length > 0 && (
                    <>
                      <ChevronRight size={12} />
                      <button
                        onClick={() => setScope({ type: 'project', projectId: activeCampaignProjectIds[0] })}
                        className="hover:text-slate-600 transition-colors"
                      >
                        {projects.find(p => p.id === activeCampaignProjectIds[0])?.name}
                      </button>
                    </>
                  )}
                  <ChevronRight size={12} />
                  <span className="text-slate-600 font-medium">{activeCampaign.name}</span>
                </>
              )}
              {scope.type === 'uncategorized' && (
                <>
                  <ChevronRight size={12} />
                  <span className="text-amber-600 font-medium">Uncategorized</span>
                </>
              )}
            </div>

            {/* Status + platform filters */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
              <div className="flex flex-wrap gap-1">
                {(['all', 'ready', 'generating', 'published', 'failed'] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1 rounded-full text-[0.72rem] font-semibold transition-all capitalize ${
                      statusFilter === s
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>

              <div className="w-px h-4 bg-slate-200 mx-1 hidden sm:block" />

              <div className="flex gap-1">
                {(['all', 'instagram', 'linkedin'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`px-3 py-1 rounded-full text-[0.72rem] font-semibold capitalize transition-all ${
                      platformFilter === p
                        ? 'bg-slate-800 text-white'
                        : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div className="ml-auto">
                <Link
                  href="/brief/new"
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.78rem] font-semibold transition-colors"
                >
                  <Plus size={14} /> New Brief
                </Link>
              </div>
            </div>

            {/* Grouped table */}
            {groupedByCampaign.map(({ label, items: groupItems }) => {
              if (groupItems.length === 0) return null
              return (
                <div key={label} className="mb-6">
                  <h3 className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-400 mb-2 px-1">{label}</h3>
                  <div className="glass rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[580px]">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Post</th>
                            <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Platform</th>
                            <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Path</th>
                            <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Rev.</th>
                            <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Status</th>
                            <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groupItems.map(draft => {
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
                                  <span className="text-[0.72rem] text-slate-400">{draft.createdAt.slice(0, 10)}</span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })}

            {filtered.length === 0 && (
              <div className="glass rounded-xl p-12 text-center">
                <p className="text-slate-400 text-[0.88rem]">No drafts match these filters.</p>
                <Link href="/brief/new" className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] text-blue-600 hover:text-blue-700 font-medium">
                  <Plus size={14} /> Create a brief
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
