'use client'

import { useState } from 'react'
import { Plus, ChevronRight, Check, Palette, Type, Instagram, Linkedin } from 'lucide-react'
import Header from '@/components/Header'
import { brandKits, brandKitTemplates } from '@/data/mock'
import type { BrandKit } from '@/data/mock'

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-4 h-4 rounded-full border border-white shadow-sm flex-shrink-0" style={{ background: color }} />
      <span className="text-[0.68rem] text-slate-500 font-mono">{color}</span>
    </div>
  )
}

function KitCard({ kit, isSelected, onClick }: { kit: BrandKit; isSelected: boolean; onClick: () => void }) {
  const templates = brandKitTemplates.filter(t => t.brandKitId === kit.id)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all glass-hover ${
        isSelected ? 'border-blue-500 bg-blue-50/50' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[0.9rem] font-bold text-slate-800">{kit.name}</span>
            {kit.isDefault && (
              <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60">Default</span>
            )}
          </div>
          <div className="text-[0.7rem] text-slate-400 mt-0.5">{templates.length} template{templates.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="flex gap-1">
          <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center" title="Instagram">
            <Instagram size={11} className="text-slate-400" />
          </div>
          <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center" title="LinkedIn">
            <Linkedin size={11} className="text-slate-400" />
          </div>
        </div>
      </div>
      <div className="flex gap-1.5 mb-3">
        {[kit.primaryColor, kit.secondaryColor, kit.accentColor].map((c, i) => (
          <div key={i} className="w-6 h-6 rounded-full border-2 border-white shadow-sm" style={{ background: c }} />
        ))}
      </div>
      <div className="text-[0.68rem] text-slate-400">{kit.fontHeading} · {kit.fontBody}</div>
    </button>
  )
}

export default function BrandKitsPage() {
  const [selectedKit, setSelectedKit] = useState<BrandKit>(brandKits[0])

  const kitTemplates = brandKitTemplates.filter(t => t.brandKitId === selectedKit.id)

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title="Brand Kits" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
          {/* Kit list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-400">Your Kits</h2>
              <button className="flex items-center gap-1 text-[0.72rem] text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                <Plus size={12} /> New Kit
              </button>
            </div>
            {brandKits.map(kit => (
              <KitCard
                key={kit.id}
                kit={kit}
                isSelected={selectedKit.id === kit.id}
                onClick={() => setSelectedKit(kit)}
              />
            ))}
          </div>

          {/* Kit detail */}
          <div className="space-y-4">
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-[1.05rem] font-bold text-slate-800">{selectedKit.name}</h2>
                  {selectedKit.isDefault && (
                    <span className="text-[0.68rem] text-emerald-600">System default kit</span>
                  )}
                </div>
                <button className="px-3 py-1.5 rounded-lg border border-slate-200 text-[0.78rem] font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                  Edit Kit
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Colors */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Palette size={13} className="text-slate-400" />
                    <span className="text-[0.68rem] font-bold tracking-widest uppercase text-slate-400">Colors</span>
                  </div>
                  <div className="space-y-2">
                    <ColorSwatch color={selectedKit.primaryColor} label="Primary" />
                    <ColorSwatch color={selectedKit.secondaryColor} label="Secondary" />
                    <ColorSwatch color={selectedKit.accentColor} label="Accent" />
                  </div>
                </div>

                {/* Fonts */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Type size={13} className="text-slate-400" />
                    <span className="text-[0.68rem] font-bold tracking-widest uppercase text-slate-400">Fonts</span>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-[0.6rem] text-slate-400 uppercase tracking-wider">Heading</div>
                      <div className="text-[0.82rem] font-semibold text-slate-700">{selectedKit.fontHeading}</div>
                    </div>
                    <div>
                      <div className="text-[0.6rem] text-slate-400 uppercase tracking-wider">Body</div>
                      <div className="text-[0.82rem] font-semibold text-slate-700">{selectedKit.fontBody}</div>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[0.68rem] font-bold tracking-widest uppercase text-slate-400 mb-3">Usage</div>
                  <div className="space-y-2">
                    <div>
                      <div className="text-[0.6rem] text-slate-400 uppercase tracking-wider">Templates</div>
                      <div className="text-[1.4rem] font-bold font-mono text-slate-700">{kitTemplates.length}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[0.68rem] text-slate-400">
                      <Check size={11} className="text-emerald-500" />
                      {selectedKit.isDefault ? 'System default' : 'Non-default kit'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Templates */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[0.88rem] font-bold text-slate-700">Templates</h3>
                <button className="flex items-center gap-1 text-[0.75rem] text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                  <Plus size={13} /> Add Template
                </button>
              </div>

              {kitTemplates.length === 0 ? (
                <div className="py-8 text-center text-[0.82rem] text-slate-400">
                  No templates yet. Add one to use with Path A generation.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {kitTemplates.map(t => (
                    <div key={t.id} className="group rounded-xl border border-slate-200 overflow-hidden hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                      <div
                        className="h-24 flex items-center justify-center"
                        style={{ background: `linear-gradient(135deg, ${t.previewColor}22 0%, ${t.previewColor}44 100%)` }}
                      >
                        <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ background: t.previewColor, opacity: 0.8 }} />
                      </div>
                      <div className="p-3">
                        <div className="text-[0.78rem] font-semibold text-slate-700">{t.name}</div>
                        <div className="text-[0.68rem] text-slate-400 mt-0.5">{t.description}</div>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-1 text-slate-400">
                            <Instagram size={10} /><Linkedin size={10} />
                            <span className="text-[0.65rem]">All platforms</span>
                          </div>
                          <button className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 text-[0.65rem] text-blue-600 font-semibold transition-opacity">
                            Edit <ChevronRight size={10} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Voice prompts */}
            <div className="glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[0.88rem] font-bold text-slate-700">Brand Voice Prompts</h3>
                <button className="text-[0.75rem] text-blue-600 hover:text-blue-700 font-semibold transition-colors">Edit</button>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-[0.78rem] text-slate-600 leading-relaxed">
                Professional yet approachable. We use clear, confident language that reflects our technical expertise without jargon. Always use active voice. Posts should feel human and energetic.
              </div>
              <div className="mt-2 text-[0.65rem] text-slate-400">Version 1 · Last updated 2026-06-01</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
