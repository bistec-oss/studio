'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { projects, brandKits, getBrandKit, type Project } from '@/data/mock'
import { FolderOpen, Plus, Trash2, ChevronRight, Megaphone, BookOpen, X, ArchiveRestore } from 'lucide-react'

export default function ProjectsPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'active' | 'deleted'>('active')
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set(['proj-004']))
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newKitId, setNewKitId] = useState('')
  const [newTone, setNewTone] = useState('')

  const activeProjects = projects.filter(p => !deletedIds.has(p.id) && !p.isDeleted)
  const deletedProjects = [...projects.filter(p => p.isDeleted), ...projects.filter(p => deletedIds.has(p.id) && !p.isDeleted)]

  const displayed = activeTab === 'active' ? activeProjects : deletedProjects

  return (
    <>
      <Header breadcrumbs={[{ label: 'Projects' }]} />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Title + actions */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-[0.95rem] font-semibold text-slate-200">Projects</h1>
            <p className="text-[0.72rem] text-slate-500 mt-0.5">Group campaigns into projects for better organisation</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-400/10 text-cyan-400 text-[0.78rem] font-medium hover:bg-cyan-400/20 transition-colors border border-cyan-400/20">
            <Plus size={14} /> New Project
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5">
          {(['active', 'deleted'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-[0.78rem] font-medium capitalize transition-colors ${activeTab === tab ? 'bg-white/[0.06] text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab === 'active' ? `Active (${activeProjects.length})` : `Deleted (${deletedProjects.length})`}
            </button>
          ))}
        </div>

        {/* Grid */}
        {displayed.length === 0 ? (
          <div className="py-20 text-center text-slate-600 text-[0.82rem]">No {activeTab} projects</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
            {displayed.map(project => {
              const kit = getBrandKit(project.defaultBrandKitId)
              const isDeleted = deletedIds.has(project.id) || project.isDeleted
              return (
                <div key={project.id} className="glass glass-hover rounded-xl p-5 cursor-pointer card-shine transition-all"
                  onClick={() => !isDeleted && router.push('/projects/' + project.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400/20 to-blue-500/10 border border-cyan-400/20 flex items-center justify-center">
                      <FolderOpen size={16} className="text-cyan-400" />
                    </div>
                    <div className="flex items-center gap-1">
                      {isDeleted ? (
                        <button onClick={(e) => { e.stopPropagation(); setDeletedIds(s => { const n = new Set(s); n.delete(project.id); return n }) }}
                          className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-400/10 transition-colors" title="Recover">
                          <ArchiveRestore size={14} />
                        </button>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeletedIds(s => new Set([...s, project.id])) }}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-400/10 transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h3 className="text-[0.88rem] font-semibold text-slate-200 mb-1">{project.name}</h3>
                  {kit && (
                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 text-[0.65rem] mb-2">
                      <BookOpen size={9} /> {kit.name}
                    </div>
                  )}
                  {project.defaultTone && (
                    <p className="text-[0.72rem] text-slate-500 mb-3 line-clamp-1">{project.defaultTone}</p>
                  )}
                  <div className="flex items-center gap-4 pt-3 border-t border-white/[0.06]">
                    <div className="flex items-center gap-1 text-[0.68rem] text-slate-500">
                      <Megaphone size={11} /> {project.campaignCount} campaigns
                    </div>
                    <div className="text-[0.68rem] text-slate-500">{project.postCount} posts</div>
                    {!isDeleted && <ChevronRight size={13} className="ml-auto text-slate-600" />}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* New Project Modal */}
        {showModal && (
          <>
            <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4">
              <div className="glass rounded-2xl p-6 w-full max-w-md animate-scale-in">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-[0.92rem] font-semibold">New Project</h2>
                  <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300 transition-colors"><X size={16} /></button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Project Name *</label>
                    <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Q4 Campaign" className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/40 transition-colors" />
                  </div>
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Default Brand Kit</label>
                    <select value={newKitId} onChange={e => setNewKitId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 outline-none focus:border-cyan-400/40">
                      <option value="">No brand kit</option>
                      {brandKits.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[0.72rem] font-medium text-slate-400 block mb-1.5">Default Tone</label>
                    <input value={newTone} onChange={e => setNewTone(e.target.value)} placeholder="e.g. Professional, results-focused" className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[0.82rem] text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/40 transition-colors" />
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <button onClick={() => setShowModal(false)} className="flex-1 py-2 rounded-lg border border-white/[0.06] text-[0.82rem] text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
                  <button onClick={() => { setShowModal(false); setNewName(''); setNewKitId(''); setNewTone('') }} disabled={!newName} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-[0.82rem] font-medium text-white disabled:opacity-40 hover:opacity-90 transition-opacity">Create Project</button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  )
}
