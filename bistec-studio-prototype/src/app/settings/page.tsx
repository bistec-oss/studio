'use client'

import { useState, useEffect } from 'react'
import {
  Settings, Cpu, Sparkles, Shield, Plus, Trash2,
  ChevronDown, ChevronUp, EyeOff, RotateCcw,
  Upload, Check, Star, AlertCircle,
} from 'lucide-react'
import Header from '@/components/Header'
import {
  providers, brandKits,
  type AvailableProvider, type BrandKit, type BrandKitPrompt,
  type BrandKitArtifact, type ProviderSlot,
} from '@/data/mock'

type ArtifactType = BrandKitArtifact['type']

const SOURCE_BADGE: Record<string, string> = {
  CANVA: 'bg-violet-400/10 text-violet-400',
  BACKEND: 'bg-cyan-400/10 text-cyan-400',
  HYBRID: 'bg-emerald-400/10 text-emerald-400',
}

const ARTIFACT_ICON: Record<ArtifactType, string> = {
  LOGO: '🖼',
  FONT: '🔤',
  COLOR: '🎨',
  REFERENCE_IMAGE: '📷',
  EXAMPLE_POST: '📄',
  OTHER: '📎',
}

const ARTIFACT_BADGE: Record<ArtifactType, string> = {
  LOGO: 'bg-violet-400/10 text-violet-400',
  FONT: 'bg-blue-400/10 text-blue-400',
  COLOR: 'bg-pink-400/10 text-pink-400',
  REFERENCE_IMAGE: 'bg-amber-400/10 text-amber-400',
  EXAMPLE_POST: 'bg-emerald-400/10 text-emerald-400',
  OTHER: 'bg-slate-400/10 text-slate-400',
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'brandkits' | 'providers'>('brandkits')
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set(['bk-001']))
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const [kitArtifacts, setKitArtifacts] = useState<Record<string, BrandKitArtifact[]>>(
    () => Object.fromEntries(brandKits.map(k => [k.id, k.artifacts]))
  )
  const [artifactFeedToggle, setArtifactFeedToggle] = useState<Record<string, boolean>>(
    () => {
      const map: Record<string, boolean> = {}
      brandKits.forEach(k => k.artifacts.forEach(a => { map[a.id] = a.feedToAI }))
      return map
    }
  )

  const [addingPromptFor, setAddingPromptFor] = useState<string | null>(null)
  const [newPromptContent, setNewPromptContent] = useState('')

  const [showAddKitModal, setShowAddKitModal] = useState(false)
  const [newKitName, setNewKitName] = useState('')
  const [newKitSource, setNewKitSource] = useState<'CANVA' | 'BACKEND' | 'HYBRID'>('BACKEND')
  const [newKitCanvaId, setNewKitCanvaId] = useState('')
  const [localKits, setLocalKits] = useState<BrandKit[]>(brandKits)

  const [enabledProviders, setEnabledProviders] = useState<Record<string, boolean>>(
    () => Object.fromEntries(providers.map(p => [p.id, p.isEnabled]))
  )
  const [defaultProviders, setDefaultProviders] = useState<Record<ProviderSlot, string | null>>(
    () => {
      const copy = providers.find(p => p.slot === 'COPY' && p.isDefault)?.id ?? null
      const image = providers.find(p => p.slot === 'IMAGE' && p.isDefault)?.id ?? null
      return { COPY: copy, IMAGE: image }
    }
  )
  const [localProviders, setLocalProviders] = useState<AvailableProvider[]>(providers)

  const [showAddProviderModal, setShowAddProviderModal] = useState(false)
  const [newProvKey, setNewProvKey] = useState('')
  const [newProvLabel, setNewProvLabel] = useState('')
  const [newProvSlot, setNewProvSlot] = useState<ProviderSlot>('COPY')

  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 2000)
    return () => clearTimeout(t)
  }, [toastMessage])

  function toggleKit(id: string) {
    setExpandedKits(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleRollback(kitId: string, prompt: BrandKitPrompt) {
    setToastMessage(`Rolled back to v${prompt.version}`)
  }

  function handleSavePrompt(kitId: string) {
    if (!newPromptContent.trim()) return
    setAddingPromptFor(null)
    setNewPromptContent('')
    setToastMessage('New version saved')
  }

  function handleToggleArtifactFeed(artifactId: string) {
    setArtifactFeedToggle(prev => ({ ...prev, [artifactId]: !prev[artifactId] }))
  }

  function handleUploadArtifact(kitId: string) {
    const fakeId = `a-fake-${Date.now()}`
    const fakeArtifact: BrandKitArtifact = {
      id: fakeId, type: 'OTHER', name: `Uploaded Asset ${Date.now().toString().slice(-4)}`,
      url: '', feedToAI: false,
    }
    setKitArtifacts(prev => ({ ...prev, [kitId]: [...(prev[kitId] ?? []), fakeArtifact] }))
    setArtifactFeedToggle(prev => ({ ...prev, [fakeId]: false }))
    setToastMessage('Artifact uploaded')
  }

  function handleAddKit() {
    if (!newKitName.trim()) return
    const newKit: BrandKit = {
      id: `bk-new-${Date.now()}`, name: newKitName.trim(), source: newKitSource,
      canvaBrandKitId: newKitCanvaId.trim() || undefined,
      isDefault: false, isDeleted: false, createdAt: new Date().toISOString().slice(0, 10),
      prompts: [], artifacts: [],
    }
    setLocalKits(prev => [...prev, newKit])
    setKitArtifacts(prev => ({ ...prev, [newKit.id]: [] }))
    setNewKitName(''); setNewKitCanvaId(''); setNewKitSource('BACKEND')
    setShowAddKitModal(false)
    setToastMessage('Brand kit added')
  }

  function handleToggleProvider(id: string) {
    setEnabledProviders(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleSetDefault(id: string, slot: ProviderSlot) {
    setDefaultProviders(prev => ({ ...prev, [slot]: id }))
  }

  function handleRemoveProvider(id: string) {
    setLocalProviders(prev => prev.filter(p => p.id !== id))
  }

  function handleAddProvider() {
    if (!newProvKey.trim() || !newProvLabel.trim()) return
    const newProv: AvailableProvider = {
      id: `prov-new-${Date.now()}`, slot: newProvSlot,
      providerKey: newProvKey.trim(), label: newProvLabel.trim(),
      isEnabled: true, isDefault: false,
    }
    setLocalProviders(prev => [...prev, newProv])
    setEnabledProviders(prev => ({ ...prev, [newProv.id]: true }))
    setNewProvKey(''); setNewProvLabel(''); setNewProvSlot('COPY')
    setShowAddProviderModal(false)
    setToastMessage('Provider added')
  }

  const copyProviders = localProviders.filter(p => p.slot === 'COPY')
  const imageProviders = localProviders.filter(p => p.slot === 'IMAGE')

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header title="Settings" />

      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-mesh">
        <div className="max-w-4xl mx-auto">

          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-slate-400/10 flex items-center justify-center">
              <Settings size={18} className="text-slate-400" />
            </div>
            <div>
              <h2 className="text-[1rem] font-semibold text-slate-200">Admin Settings</h2>
              <p className="text-[0.72rem] text-slate-500">Manage brand kits and AI provider configuration</p>
            </div>
          </div>

          <div className="flex gap-1 p-1 rounded-xl glass mb-6 w-fit">
            <button
              onClick={() => setActiveTab('brandkits')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[0.82rem] font-medium transition-all ${
                activeTab === 'brandkits'
                  ? 'bg-white/[0.08] text-slate-200 shadow-sm'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              <Sparkles size={14} />
              Brand Kits
            </button>
            <button
              onClick={() => setActiveTab('providers')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[0.82rem] font-medium transition-all ${
                activeTab === 'providers'
                  ? 'bg-white/[0.08] text-slate-200 shadow-sm'
                  : 'text-slate-500 hover:text-slate-400'
              }`}
            >
              <Cpu size={14} />
              AI Providers
            </button>
          </div>

          {activeTab === 'brandkits' && (
            <div className="animate-fade-in">
              {localKits.filter(k => !k.isDeleted).map(kit => (
                <div key={kit.id} className="glass rounded-xl mb-4">
                  <button
                    onClick={() => toggleKit(kit.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div className="flex-1 flex items-center gap-2.5 flex-wrap min-w-0">
                      <span className="font-semibold text-slate-200 text-[0.9rem] truncate">{kit.name}</span>
                      <span className={`px-2 py-0.5 rounded-md text-[0.65rem] font-semibold uppercase tracking-wide ${SOURCE_BADGE[kit.source]}`}>
                        {kit.source}
                      </span>
                      {kit.isDefault && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[0.65rem] font-semibold bg-amber-400/10 text-amber-400">
                          <Star size={10} fill="currentColor" /> Default
                        </span>
                      )}
                      {kit.canvaBrandKitId && (
                        <span className="font-mono text-[0.62rem] text-slate-600 hidden sm:inline">{kit.canvaBrandKitId}</span>
                      )}
                    </div>
                    <div className="text-slate-600 flex-shrink-0">
                      {expandedKits.has(kit.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </button>

                  {expandedKits.has(kit.id) && (
                    <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-5">

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[0.72rem] font-semibold text-slate-500 uppercase tracking-wider">Brand Voice Prompt</span>
                          <button
                            onClick={() => { setAddingPromptFor(addingPromptFor === kit.id ? null : kit.id); setNewPromptContent('') }}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.72rem] text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                          >
                            <Plus size={12} /> Add Version
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          {kit.prompts.length === 0 && (
                            <div className="flex items-center gap-2 text-[0.75rem] text-slate-600 py-2">
                              <AlertCircle size={13} /> No prompt versions yet
                            </div>
                          )}
                          {kit.prompts.map(prompt => (
                            <div key={prompt.id} className="flex items-start gap-3 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                              <span className="flex-shrink-0 px-1.5 py-0.5 rounded text-[0.62rem] font-mono font-bold bg-white/[0.06] text-slate-400 mt-0.5">
                                v{prompt.version}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  {prompt.isActive ? (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-emerald-400/10 text-emerald-400">
                                      <Check size={9} /> Active
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[0.6rem] font-semibold bg-white/[0.04] text-slate-600">
                                      Inactive
                                    </span>
                                  )}
                                  <span className="text-[0.62rem] text-slate-600">{formatDate(prompt.createdAt)}</span>
                                </div>
                                <p className="text-[0.75rem] text-slate-400 leading-relaxed">
                                  {prompt.content.slice(0, 80)}{prompt.content.length > 80 ? '…' : ''}
                                </p>
                              </div>
                              {!prompt.isActive && (
                                <button
                                  onClick={() => handleRollback(kit.id, prompt)}
                                  className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-[0.68rem] text-amber-400 hover:bg-amber-400/10 transition-colors mt-0.5"
                                >
                                  <RotateCcw size={11} /> Roll back
                                </button>
                              )}
                            </div>
                          ))}
                        </div>

                        {addingPromptFor === kit.id && (
                          <div className="mt-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2">
                            <textarea
                              value={newPromptContent}
                              onChange={e => setNewPromptContent(e.target.value)}
                              placeholder="Enter prompt content for the new version…"
                              rows={4}
                              className="w-full bg-transparent text-[0.8rem] text-slate-300 placeholder:text-slate-600 outline-none resize-none"
                            />
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                onClick={() => { setAddingPromptFor(null); setNewPromptContent('') }}
                                className="px-3 py-1.5 rounded-lg text-[0.75rem] text-slate-500 hover:text-slate-400 transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSavePrompt(kit.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 transition-colors"
                              >
                                <Check size={12} /> Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[0.72rem] font-semibold text-slate-500 uppercase tracking-wider">Artifacts</span>
                          <button
                            onClick={() => handleUploadArtifact(kit.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.72rem] text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                          >
                            <Upload size={12} /> Upload Artifact
                          </button>
                        </div>

                        <div className="space-y-1.5">
                          {(kitArtifacts[kit.id] ?? []).length === 0 && (
                            <div className="flex items-center gap-2 text-[0.75rem] text-slate-600 py-2">
                              <AlertCircle size={13} /> No artifacts yet
                            </div>
                          )}
                          {(kitArtifacts[kit.id] ?? []).map(artifact => (
                            <div key={artifact.id} className="flex items-center gap-3 py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                              <span className="text-base flex-shrink-0 w-6 text-center">{ARTIFACT_ICON[artifact.type]}</span>
                              <span className="flex-1 min-w-0 text-[0.8rem] text-slate-300 truncate">{artifact.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[0.6rem] font-semibold flex-shrink-0 ${ARTIFACT_BADGE[artifact.type]}`}>
                                {artifact.type.replace('_', ' ')}
                              </span>
                              <button
                                onClick={() => handleToggleArtifactFeed(artifact.id)}
                                className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.68rem] font-medium transition-all ${
                                  artifactFeedToggle[artifact.id]
                                    ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20'
                                    : 'bg-white/[0.04] text-slate-600 hover:bg-white/[0.07]'
                                }`}
                              >
                                {artifactFeedToggle[artifact.id] ? (
                                  <><Check size={10} /> Feed AI</>
                                ) : (
                                  <><EyeOff size={10} /> Feed AI</>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => setShowAddKitModal(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/[0.1] text-slate-500 hover:text-slate-400 hover:border-white/[0.18] transition-all w-full justify-center text-[0.82rem] mt-2"
              >
                <Plus size={15} /> Add Brand Kit
              </button>
            </div>
          )}

          {activeTab === 'providers' && (
            <div className="animate-fade-in space-y-6">
              {([
                { slot: 'COPY' as ProviderSlot, label: 'Copy Generation', icon: Sparkles, accent: 'cyan' },
                { slot: 'IMAGE' as ProviderSlot, label: 'Image Generation', icon: Shield, accent: 'violet' },
              ]).map(({ slot, label, icon: Icon, accent }) => {
                const slotProviders = slot === 'COPY' ? copyProviders : imageProviders
                return (
                  <div key={slot}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon size={15} className={`text-${accent}-400`} />
                        <span className="text-[0.88rem] font-semibold text-slate-300">{label}</span>
                        <span className="px-1.5 py-0.5 rounded text-[0.6rem] bg-white/[0.04] text-slate-500">{slotProviders.length}</span>
                      </div>
                      <button
                        onClick={() => { setNewProvSlot(slot); setShowAddProviderModal(true) }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.72rem] text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                      >
                        <Plus size={12} /> Add Provider
                      </button>
                    </div>

                    <div className="glass rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[500px]">
                          <thead>
                            <tr className="border-b border-white/[0.06]">
                              <th className="text-left px-4 py-2.5 text-[0.65rem] font-semibold text-slate-600 uppercase tracking-wider">Provider</th>
                              <th className="text-left px-4 py-2.5 text-[0.65rem] font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                              <th className="text-left px-4 py-2.5 text-[0.65rem] font-semibold text-slate-600 uppercase tracking-wider">Default</th>
                              <th className="text-left px-4 py-2.5 text-[0.65rem] font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.04]">
                            {slotProviders.map(prov => {
                              const isEnabled = enabledProviders[prov.id] ?? false
                              const isDefault = defaultProviders[slot] === prov.id
                              return (
                                <tr key={prov.id} className="hover:bg-white/[0.02] transition-colors">
                                  <td className="px-4 py-3">
                                    <div>
                                      <div className="text-[0.82rem] font-medium text-slate-200">{prov.label}</div>
                                      <div className="text-[0.65rem] text-slate-600 font-mono">{prov.providerKey}</div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => handleToggleProvider(prov.id)}
                                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[0.72rem] font-medium transition-all ${
                                        isEnabled
                                          ? 'bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20'
                                          : 'bg-white/[0.04] text-slate-600 hover:bg-white/[0.08]'
                                      }`}
                                    >
                                      {isEnabled ? <><Check size={11} /> Enabled</> : <><EyeOff size={11} /> Disabled</>}
                                    </button>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => handleSetDefault(prov.id, slot)}
                                      className={`p-1.5 rounded-lg transition-all ${
                                        isDefault
                                          ? 'text-amber-400 bg-amber-400/10'
                                          : 'text-slate-700 hover:text-slate-500 hover:bg-white/[0.04]'
                                      }`}
                                      title={isDefault ? 'Default provider' : 'Set as default'}
                                    >
                                      <Star size={14} fill={isDefault ? 'currentColor' : 'none'} />
                                    </button>
                                  </td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => handleRemoveProvider(prov.id)}
                                      className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-400/10 transition-all"
                                      title="Remove provider"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                            {slotProviders.length === 0 && (
                              <tr>
                                <td colSpan={4} className="px-4 py-6 text-center text-[0.78rem] text-slate-600">
                                  No providers configured for this slot
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </main>

      {showAddKitModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAddKitModal(false)} />
          <div className="fixed inset-0 z-51 flex items-center justify-center p-4 pointer-events-none">
            <div className="glass rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 w-full max-w-md pointer-events-auto animate-scale-in">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[0.9rem] font-semibold text-slate-200">Add Brand Kit</span>
                <button onClick={() => setShowAddKitModal(false)} className="text-slate-600 hover:text-slate-400 transition-colors text-[1.1rem] leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[0.72rem] font-medium text-slate-500 mb-1.5">Name</label>
                  <input
                    value={newKitName}
                    onChange={e => setNewKitName(e.target.value)}
                    placeholder="e.g. Bistec Events"
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-[0.82rem] text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[0.72rem] font-medium text-slate-500 mb-2">Source</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['BACKEND', 'CANVA', 'HYBRID'] as const).map(s => (
                      <button
                        key={s}
                        onClick={() => setNewKitSource(s)}
                        className={`px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border transition-all ${
                          newKitSource === s
                            ? `${SOURCE_BADGE[s]} border-current`
                            : 'text-slate-600 border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {(newKitSource === 'CANVA' || newKitSource === 'HYBRID') && (
                  <div>
                    <label className="block text-[0.72rem] font-medium text-slate-500 mb-1.5">Canva Brand Kit ID <span className="text-slate-700">(optional)</span></label>
                    <input
                      value={newKitCanvaId}
                      onChange={e => setNewKitCanvaId(e.target.value)}
                      placeholder="bk_xxxxxxxx"
                      className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-[0.82rem] font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/30 transition-colors"
                    />
                  </div>
                )}
              </div>
              <div className="px-5 pb-5 flex gap-2 justify-end">
                <button onClick={() => setShowAddKitModal(false)} className="px-4 py-2 rounded-lg text-[0.78rem] text-slate-500 hover:text-slate-400 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAddKit}
                  disabled={!newKitName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[0.78rem] bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Plus size={13} /> Add Kit
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {showAddProviderModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAddProviderModal(false)} />
          <div className="fixed inset-0 z-51 flex items-center justify-center p-4 pointer-events-none">
            <div className="glass rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60 w-full max-w-sm pointer-events-auto animate-scale-in">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                <span className="text-[0.9rem] font-semibold text-slate-200">Add Provider</span>
                <button onClick={() => setShowAddProviderModal(false)} className="text-slate-600 hover:text-slate-400 transition-colors text-[1.1rem] leading-none">×</button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[0.72rem] font-medium text-slate-500 mb-1.5">Provider Key</label>
                  <input
                    value={newProvKey}
                    onChange={e => setNewProvKey(e.target.value)}
                    placeholder="e.g. anthropic-claude-3"
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-[0.82rem] font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[0.72rem] font-medium text-slate-500 mb-1.5">Label</label>
                  <input
                    value={newProvLabel}
                    onChange={e => setNewProvLabel(e.target.value)}
                    placeholder="e.g. Claude 3 Opus"
                    className="w-full bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2 text-[0.82rem] text-slate-200 placeholder:text-slate-600 outline-none focus:border-cyan-400/30 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[0.72rem] font-medium text-slate-500 mb-2">Slot</label>
                  <div className="flex gap-2">
                    {(['COPY', 'IMAGE'] as ProviderSlot[]).map(s => (
                      <button
                        key={s}
                        onClick={() => setNewProvSlot(s)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.75rem] font-medium border transition-all ${
                          newProvSlot === s
                            ? 'bg-cyan-400/10 text-cyan-400 border-cyan-400/30'
                            : 'text-slate-600 border-white/[0.06] hover:border-white/[0.12]'
                        }`}
                      >
                        {s === 'COPY' ? <Sparkles size={11} /> : <Shield size={11} />}
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-5 pb-5 flex gap-2 justify-end">
                <button onClick={() => setShowAddProviderModal(false)} className="px-4 py-2 rounded-lg text-[0.78rem] text-slate-500 hover:text-slate-400 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAddProvider}
                  disabled={!newProvKey.trim() || !newProvLabel.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[0.78rem] bg-cyan-400/10 text-cyan-400 hover:bg-cyan-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <Plus size={13} /> Add Provider
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[999] animate-slide-in">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl glass border border-emerald-400/20 shadow-xl shadow-black/40">
            <div className="w-5 h-5 rounded-full bg-emerald-400/10 flex items-center justify-center flex-shrink-0">
              <Check size={11} className="text-emerald-400" />
            </div>
            <span className="text-[0.8rem] text-slate-300">{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  )
}
