'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { campaigns, projects, brandKits, getBrandKit, getProject, type Campaign } from '@/data/mock'
import { Megaphone, Plus, FolderOpen, BookOpen, ChevronRight, Trash2, ArchiveRestore, X } from 'lucide-react'

export default function CampaignsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'active' | 'deleted'>('active')
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKitId, setNewKitId] = useState('')
  const [newTone, setNewTone] = useState('')
  const [newProjectIds, setNewProjectIds] = useState<string[]>([])

  const activeCampaigns = campaigns.filter(c => !c.isDeleted && !deletedIds.has(c.id))
  const deletedCampaigns = [...campaigns.filter(c => c.isDeleted), ...campaigns.filter(c => deletedIds.has(c.id) && !c.isDeleted)]

  const baseList = activeTab === 'active' ? activeCampaigns : deletedCampaigns
  const displayed = projectFilter ? baseList.filter(c => c.projectIds.includes(projectFilter)) : baseList

  const toggleProjectId = (pid: string) => {
    setNewProjectIds(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : [...prev, pid])
  }

  return (
    <>
      <Header breadcrumbs={[{ label: 'Campaigns' }]} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[0.95rem] font-semibold text-slate-200">Campaigns</h1>
            <p className="text-[0.72rem] text-slate-500 mt-0.5">Standalone campaigns or grouped within projects</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-400/10 text-cyan-400 text-[0.78rem] font-medium hover:bg-cyan-400/20 transition-colors border border-cyan-400/20">
            <Plus size={14} /> New Campaign
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4">
          {(['active', 'deleted'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-[0.78rem] font-medium capitalize transition-colors ${activeTab === tab ? 'bg-white/[0.06] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab === 'active' ? `Active (${activeCampaigns.length})` : `Deleted (${deletedCampaigns.length})`}
            </button>
          ))}
        </div>

        {/* Project filter strip */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
          {[null, ...projects.filter(p => !p.isDeleted).map(p => p.id)].map(pid => {
            const label = pid === null ? 'All Campaigns' : projects.find(p => p.id === pid)?.name ?? ''
            return (
              <button key={pid ?? 'all'} onClick={() => setProjectFilter(pid)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[0.72rem] font-medium border transition-colors ${projectFilter === pid ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/30' : 'bg-white/[0.03] text-slate-500 border-white/[0.06] hover:text-slate-300'}`}>
                {label}
              </button>
            )
          })}
        </div>

        {/* Grid */}
        {displayed.length === 0 ? (
          <div className="py-20 text-center text-slate-600 text-[0.82rem]">No campaigns found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {displayed.map(campaign => {
              const kit = getBrandKit(campaign.brandKitId)
              const isDeleted = deletedIds.has(campaign.id) || campaign.isDeleted
              const campProjects = campaign.projectIds.map(pid => projects.find(p => p.id === pid)).filter(Boolean)
              return (
                <div key={campaign.id} className="glass glass-hover rounded-xl p-5 cursor-pointer card-shine"
                  onClick={() => !isDeleted && router.push('/campaigns/' + campaign.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-400/20 to-purple-500/10 border border-violet-400/20 flex items-center justify-center">
                      <Megaphone size={16} className="text-violet-400" />
                    </div>
                    <div className="flex items-center gap-1">
                      {isDeleted ? (
                        <button onClick={(e) => { e.stopPropagation(); setDeletedIds(s => { const n = new Set(s); n.delete(campaign.id); return n }) }}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors">
                          <ArchiveRestore size={14} />
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletedIds(s => new Set([...s, campaign.id])) }}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="text-[0.88rem] font-semibold text-slate-200 mb-2">{campaign.name}</h3>

                  <div className="flex flex-wrap gap-1 mb-2">
                    {campProjects.length === 0
                      ? <span className="px-2 py-0.5 rounded-full text-[0.62rem] bg-white/[0.04] text-slate-500">Standalone</span>
                      : campProjects.map(p => p && (
                        <span key={p.id} className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.62rem] bg-white/[0.04] text-slate-400">
                          <FolderOpen size={9} /> {p.name}
                        </span>
                      ))
                    }
                  </div>

                  {kit
                    ? <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 text-[0.62rem] mb-2"><BookOpen size={9} /> {kit.name}</div>
                    : <span className="inline-flex px-2 py-0.5 rounded-full text-[0.62rem] bg-white/[0.03] text-slate-600 mb-2">Inherited kit</span>
                  }

                  {campaign.defaultTone && <p className="text-[0.7rem] text-slate-500 line-clamp-1 mb-3">{campaign.defaultTone}</p>}

                  <div className="flex items-center gap-4 pt-3 border-t border-white/[0.06]">
                    <div className="text-[0.68rem] text-slate-500">{campaign.postCount} posts</div>
                    <div className="text-[0.68rem] text-slate-500">{campaign.draftCount} drafts</div>
                    {!isDeleted && <ChevronRight size={13} className="ml-auto text-slate-600" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <>
            <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
              <div className="glass rounded-2xl p-6 w-full max-w-md animate-scale-in max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[0.92rem] font-semibold">New Campaign</h2>
                  <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Campaign Name *</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Summer Awareness" className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/40" />
                  </div>
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Assign to Projects</label>
                    <div className="space-y-1">
                      {projects.filter(p => !p.isDeleted).map(p => (
                        <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/[0.02] cursor-pointer">
                          <input type="checkbox" checked={newProjectIds.includes(p.id)} onChange={() => toggleProjectId(p.id)} className="accent-cyan-400" />
                          <span className="text-[0.78rem] text-slate-300">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Brand Kit Override</label>
                    <select value={newKitId} onChange={e => setNewKitId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 outline-none focus:border-cyan-400/40">
                      <option value="">Inherit from project</option>
                      {brandKits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Default Tone Override</label>
                    <input value={newTone} onChange={e => setNewTone(e.target.value)} placeholder="Leave blank to inherit from project" className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/40" />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-lg border border-white/[0.06] text-[0.82rem] text-slate-400 hover:text-slate-200">Cancel</button>
                  <button onClick={() => { setShowModal(false); setNewName(''); setNewKitId(''); setNewTone(''); setNewProjectIds([]) }} disabled={!newName} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-[0.82rem] font-medium text-white disabled:opacity-40 hover:opacity-90">Create Campaign</button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
