'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, FolderKanban, ChevronRight, Circle, X } from 'lucide-react'
import Header from '@/components/Header'
import { projects, campaigns, drafts, brandKits } from '@/data/mock'

const statusColors = {
  active: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
  archived: 'bg-slate-50 text-slate-500 ring-1 ring-slate-200/60',
}

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [showCreateCampaign, setShowCreateCampaign] = useState(false)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title="Projects" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[0.82rem] text-slate-500">
              Organize campaigns and posts into projects. Brand kit and tone settings cascade from project → campaign → post.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.78rem] font-semibold transition-colors flex-shrink-0 ml-4"
          >
            <Plus size={14} /> New Project
          </button>
        </div>

        {showCreate && (
          <div className="glass rounded-xl p-5 mb-6 border border-blue-100 bg-blue-50/30">
            <h3 className="text-[0.88rem] font-semibold text-slate-700 mb-3">New Project</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Q4 2026 Growth"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.82rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Default Brand Kit</label>
                <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.82rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                  <option value="">— Inherit system default —</option>
                  {brandKits.map(bk => (
                    <option key={bk.id} value={bk.id}>{bk.name}{bk.isDefault ? ' (system default)' : ''}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Default Tone</label>
                <input
                  type="text"
                  placeholder="e.g. Professional, energetic"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.82rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.78rem] font-semibold transition-colors">
                Create
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[0.78rem] font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(project => {
            const projectCampaigns = campaigns.filter(c => c.projectIds.includes(project.id))
            const projectDrafts = drafts.filter(d => d.projectId === project.id)
            const readyCount = projectDrafts.filter(d => d.status === 'ready').length
            const publishedCount = projectDrafts.filter(d => d.status === 'published').length
            const defaultBrandKit = brandKits.find(b => b.id === project.defaultBrandKitId)

            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="glass rounded-xl p-5 hover:shadow-md hover:shadow-blue-500/5 transition-all group border border-transparent hover:border-blue-100"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/10 to-violet-500/10 flex items-center justify-center border border-blue-100">
                      <FolderKanban size={17} className="text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-[0.9rem] font-semibold text-slate-800 group-hover:text-blue-700 transition-colors leading-tight">{project.name}</h3>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.62rem] font-semibold mt-0.5 ${statusColors[project.status]}`}>
                        {project.status}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors mt-1" />
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center py-2 bg-slate-50 rounded-lg">
                    <div className="text-[1rem] font-bold text-slate-800">{projectCampaigns.length}</div>
                    <div className="text-[0.6rem] uppercase tracking-widest text-slate-400 font-semibold">Campaigns</div>
                  </div>
                  <div className="text-center py-2 bg-emerald-50 rounded-lg">
                    <div className="text-[1rem] font-bold text-emerald-700">{readyCount}</div>
                    <div className="text-[0.6rem] uppercase tracking-widest text-emerald-500 font-semibold">Ready</div>
                  </div>
                  <div className="text-center py-2 bg-slate-50 rounded-lg">
                    <div className="text-[1rem] font-bold text-slate-800">{publishedCount}</div>
                    <div className="text-[0.6rem] uppercase tracking-widest text-slate-400 font-semibold">Published</div>
                  </div>
                </div>

                {/* Brand kit + tone */}
                <div className="space-y-1.5 mb-3">
                  {defaultBrandKit && (
                    <div className="flex items-center gap-2 text-[0.75rem] text-slate-500">
                      <div className="flex gap-1">
                        {[defaultBrandKit.primaryColor, defaultBrandKit.secondaryColor, defaultBrandKit.accentColor].map((color, i) => (
                          <span key={i} className="w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: color }} />
                        ))}
                      </div>
                      <span>{defaultBrandKit.name}</span>
                    </div>
                  )}
                  {project.defaultTone && (
                    <div className="text-[0.72rem] text-slate-400 italic">&ldquo;{project.defaultTone}&rdquo;</div>
                  )}
                </div>

                {/* Campaign pills */}
                {projectCampaigns.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {projectCampaigns.slice(0, 3).map(c => (
                      <span key={c.id} className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[0.68rem] font-medium border border-slate-200/80">
                        {c.name}
                      </span>
                    ))}
                    {projectCampaigns.length > 3 && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[0.68rem]">
                        +{projectCampaigns.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </Link>
            )
          })}

          {/* Standalone campaigns card */}
          {(() => {
            const standalone = campaigns.filter(c => c.projectIds.length === 0)
            const standaloneDrafts = drafts.filter(d => d.campaignId && standalone.map(c => c.id).includes(d.campaignId))
            return (
              <div className="glass rounded-xl p-5 border border-dashed border-slate-200 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200 flex-shrink-0">
                      <Circle size={16} className="text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-[0.9rem] font-semibold text-slate-600 leading-tight">Standalone Campaigns</h3>
                      <p className="text-[0.68rem] text-slate-400">Not assigned to any project</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCreateCampaign(v => !v)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[0.72rem] font-semibold transition-colors flex-shrink-0"
                  >
                    <Plus size={12} /> New Campaign
                  </button>
                </div>

                {showCreateCampaign && (
                  <div className="mb-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[0.78rem] font-semibold text-slate-700">New Standalone Campaign</p>
                      <button onClick={() => setShowCreateCampaign(false)} className="p-0.5 rounded text-slate-400 hover:text-slate-600">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      <div>
                        <label className="block text-[0.68rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Campaign Name</label>
                        <input
                          type="text"
                          placeholder="e.g. Social Proof Series 2"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.8rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[0.68rem] font-semibold text-slate-500 uppercase tracking-widest mb-1">Brand Kit <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                        <select className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[0.8rem] text-slate-700 bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                          <option value="">— System default —</option>
                          {brandKits.map(bk => (
                            <option key={bk.id} value={bk.id}>{bk.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCreateCampaign(false)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.75rem] font-semibold transition-colors"
                      >
                        Create
                      </button>
                      <button
                        onClick={() => setShowCreateCampaign(false)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[0.75rem] font-medium hover:bg-slate-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {standalone.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="text-center py-2 bg-slate-50 rounded-lg">
                        <div className="text-[1rem] font-bold text-slate-700">{standalone.length}</div>
                        <div className="text-[0.6rem] uppercase tracking-widest text-slate-400 font-semibold">Campaigns</div>
                      </div>
                      <div className="text-center py-2 bg-slate-50 rounded-lg">
                        <div className="text-[1rem] font-bold text-slate-700">{standaloneDrafts.length}</div>
                        <div className="text-[0.6rem] uppercase tracking-widest text-slate-400 font-semibold">Posts</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {standalone.map(c => (
                        <Link
                          key={c.id}
                          href={`/campaigns/${c.id}`}
                          onClick={e => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[0.68rem] font-medium border border-slate-200/80 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          {c.name}
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {standalone.length === 0 && !showCreateCampaign && (
                  <p className="text-[0.75rem] text-slate-400 text-center py-2">No standalone campaigns yet.</p>
                )}
              </div>
            )
          })()}
        </div>
      </main>
    </div>
  )
}
