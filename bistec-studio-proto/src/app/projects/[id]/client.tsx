'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FolderKanban, ChevronRight, Plus, ArrowUpRight, Instagram, Linkedin, X } from 'lucide-react'
import Header from '@/components/Header'
import { Badge } from '@/components/Badge'
import { campaigns, drafts, brandKits, getBrandKitSource, getCampaignBrandKit } from '@/data/mock'
import { statusConfig } from '@/lib/utils'
import type { Project } from '@/data/mock'

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
  draft: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/60',
  completed: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  archived: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/60',
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

export default function ProjectClient({ project }: { project: Project }) {
  const [showCreateCampaign, setShowCreateCampaign] = useState(false)
  const projectCampaigns = campaigns.filter(c => c.projectIds.includes(project.id))
  const projectDrafts = drafts.filter(d => d.projectId === project.id)
  const defaultBrandKit = brandKits.find(b => b.id === project.defaultBrandKitId)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header
        title={project.name}
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">

        {/* Project overview */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 mb-8">
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/10 to-violet-500/10 flex items-center justify-center border border-blue-100">
                <FolderKanban size={17} className="text-blue-600" />
              </div>
              <div>
                <h2 className="text-[1rem] font-bold text-slate-800">{project.name}</h2>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.62rem] font-semibold ${statusColors[project.status]}`}>
                  {project.status}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-lg p-3 text-center">
                <div className="text-[1.4rem] font-bold text-slate-800">{projectCampaigns.length}</div>
                <div className="text-[0.62rem] uppercase tracking-widest text-slate-400 font-semibold">Campaigns</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 text-center">
                <div className="text-[1.4rem] font-bold text-emerald-700">{projectDrafts.filter(d => d.status === 'ready').length}</div>
                <div className="text-[0.62rem] uppercase tracking-widest text-emerald-500 font-semibold">Ready</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-[1.4rem] font-bold text-blue-700">{projectDrafts.filter(d => d.status === 'published').length}</div>
                <div className="text-[0.62rem] uppercase tracking-widest text-blue-500 font-semibold">Published</div>
              </div>
            </div>
          </div>

          {/* Default brand kit */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-[0.72rem] font-bold uppercase tracking-widest text-slate-400 mb-3">Default Brand Kit</h3>
            {defaultBrandKit ? (
              <div>
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="flex gap-1">
                    {[defaultBrandKit.primaryColor, defaultBrandKit.secondaryColor, defaultBrandKit.accentColor].map((color, i) => (
                      <span key={i} className="w-5 h-5 rounded-full border border-white shadow-sm" style={{ background: color }} />
                    ))}
                  </div>
                  <span className="text-[0.82rem] font-semibold text-slate-700">{defaultBrandKit.name}</span>
                </div>
                <p className="text-[0.72rem] text-slate-400 mb-2">
                  Campaigns in this project inherit this kit unless they set their own override.
                </p>
                <Link href="/admin/brandkits" className="text-[0.72rem] text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  Manage brand kits <ArrowUpRight size={11} />
                </Link>
              </div>
            ) : (
              <p className="text-[0.78rem] text-slate-400">No default set — campaigns will use the system default.</p>
            )}
            {project.defaultTone && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-[0.68rem] text-slate-400 mb-0.5 uppercase tracking-widest font-semibold">Default Tone</p>
                <p className="text-[0.78rem] text-slate-600 italic">&ldquo;{project.defaultTone}&rdquo;</p>
              </div>
            )}
          </div>
        </div>

        {/* Campaigns */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[0.82rem] font-bold text-slate-700 uppercase tracking-widest">Campaigns</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[0.75rem] font-semibold transition-colors"
            >
              <Plus size={13} /> New Campaign
            </button>
            <Link
              href="/brief/new"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.75rem] font-semibold transition-colors"
            >
              <Plus size={13} /> New Brief
            </Link>
          </div>
        </div>

        {showCreateCampaign && (
          <div className="glass rounded-xl p-5 mb-4 border border-blue-100 bg-blue-50/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[0.88rem] font-semibold text-slate-700">New Campaign in <span className="text-blue-700">{project.name}</span></h3>
              <button onClick={() => setShowCreateCampaign(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Campaign Name</label>
                <input
                  type="text"
                  placeholder="e.g. Q4 Product Launch"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.82rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Brand Kit Override <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.82rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                  <option value="">— Inherit from project ({defaultBrandKit?.name ?? 'system default'}) —</option>
                  {brandKits.map(bk => (
                    <option key={bk.id} value={bk.id}>{bk.name}{bk.isDefault ? ' (system default)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Tone Override <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                <input
                  type="text"
                  placeholder={`Leave blank to inherit: "${project.defaultTone ?? 'none set'}"`}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.82rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateCampaign(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.78rem] font-semibold transition-colors"
              >
                Create Campaign
              </button>
              <button
                onClick={() => setShowCreateCampaign(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[0.78rem] font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {projectCampaigns.length === 0 ? (
          <div className="glass rounded-xl p-10 text-center">
            <p className="text-slate-400 text-[0.88rem]">No campaigns in this project yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {projectCampaigns.map(campaign => {
              const campaignDrafts = drafts.filter(d => d.campaignId === campaign.id)
              const kit = getCampaignBrandKit(campaign)
              const kitSource = getBrandKitSource(campaign)

              return (
                <Link
                  key={campaign.id}
                  href={`/campaigns/${campaign.id}`}
                  className="glass rounded-xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:shadow-md hover:shadow-blue-500/5 transition-all group border border-transparent hover:border-blue-100"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-[0.9rem] font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{campaign.name}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.62rem] font-semibold ${statusColors[campaign.status]}`}>
                        {campaign.status}
                      </span>
                    </div>

                    {/* Brand kit source */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-1">
                        {[kit.primaryColor, kit.secondaryColor].map((color, i) => (
                          <span key={i} className="w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: color }} />
                        ))}
                      </div>
                      <span className="text-[0.72rem] text-slate-500">{kit.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[0.6rem] font-semibold ${bkSourceColors[kitSource]}`}>
                        {bkSourceLabel[kitSource]}
                      </span>
                    </div>
                  </div>

                  {/* Draft stats */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex gap-2">
                      {campaignDrafts.slice(0, 4).map(d => (
                        <Badge key={d.id} status={d.status} config={statusConfig} />
                      ))}
                    </div>
                    <div className="text-right">
                      <div className="text-[0.88rem] font-bold text-slate-700">{campaignDrafts.length}</div>
                      <div className="text-[0.62rem] text-slate-400 uppercase tracking-widest">Posts</div>
                    </div>
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
