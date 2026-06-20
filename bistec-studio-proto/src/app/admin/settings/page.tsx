'use client'

import { useState } from 'react'
import { Eye, EyeOff, Plus, Zap, CheckCircle, AlertTriangle, Settings } from 'lucide-react'
import Header from '@/components/Header'
import { Badge } from '@/components/Badge'
import { providers } from '@/data/mock'
import { statusConfig } from '@/lib/utils'
import type { AvailableProvider, ProviderType } from '@/data/mock'

const typeLabels: Record<ProviderType, string> = {
  copy: 'Copy generation',
  image: 'Image generation',
  both: 'Copy + Image',
}

const typeColors: Record<ProviderType, string> = {
  copy: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  image: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/60',
  both: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
}

function ProviderCard({ provider }: { provider: AvailableProvider }) {
  const [showKey, setShowKey] = useState(false)
  const [editing, setEditing] = useState(provider.status === 'unconfigured')
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    await new Promise(r => setTimeout(r, 900))
    setSaving(false)
    setEditing(false)
  }

  const statusIcon = provider.status === 'connected'
    ? <CheckCircle size={14} className="text-emerald-600" />
    : provider.status === 'error'
    ? <AlertTriangle size={14} className="text-red-500" />
    : <Settings size={14} className="text-slate-400" />

  return (
    <div className="glass rounded-xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <Zap size={16} className="text-slate-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[0.9rem] font-bold text-slate-800">{provider.name}</h3>
              {provider.isDefault && (
                <span className="text-[0.6rem] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 ring-1 ring-blue-200/60">Default</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {statusIcon}
              <Badge status={provider.status} config={statusConfig} />
            </div>
          </div>
        </div>
        <span className={`text-[0.68rem] font-semibold px-2 py-0.5 rounded ${typeColors[provider.type]}`}>
          {typeLabels[provider.type]}
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[0.65rem] font-bold tracking-widest uppercase text-slate-400 mb-1 block">Model</label>
          <div className="font-mono text-[0.78rem] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{provider.model}</div>
        </div>

        <div>
          <label className="text-[0.65rem] font-bold tracking-widest uppercase text-slate-400 mb-1 block">API Key</label>
          {provider.status === 'unconfigured' || editing ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={keyInput}
                  onChange={e => setKeyInput(e.target.value)}
                  placeholder="Enter API key…"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[0.78rem] font-mono text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 pr-10 transition-all"
                />
                <button
                  onClick={() => setShowKey(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <button
                onClick={save}
                disabled={!keyInput.trim() || saving}
                className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[0.75rem] font-semibold disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-[0.78rem] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                {provider.keyPrefix}
              </div>
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-2 rounded-lg border border-slate-200 text-[0.75rem] font-medium text-slate-600 hover:bg-slate-50 flex-shrink-0 transition-colors"
              >
                Rotate
              </button>
            </div>
          )}
        </div>

        {provider.lastUsed && (
          <div className="text-[0.68rem] text-slate-400">
            Last used: {new Date(provider.lastUsed).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AIProvidersPage() {
  const copyProviders = providers.filter(p => p.type === 'copy' || p.type === 'both')
  const imageProviders = providers.filter(p => p.type === 'image' || p.type === 'both')

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title="AI Providers" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Info banner */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
            <Zap size={15} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-[0.78rem] text-blue-700 leading-relaxed">
              API keys are stored AES-256-GCM encrypted. Only the key prefix is shown after saving — the full key is never returned. Set a provider as default to use it when no explicit provider is selected in a brief.
            </p>
          </div>

          {/* Copy providers */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-400">Copy Generation</h2>
              <button className="flex items-center gap-1 text-[0.72rem] text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                <Plus size={12} /> Add Provider
              </button>
            </div>
            <div className="space-y-3">
              {copyProviders.map(p => <ProviderCard key={p.id} provider={p} />)}
            </div>
          </section>

          {/* Image providers */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-400">Image Generation</h2>
              <button className="flex items-center gap-1 text-[0.72rem] text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                <Plus size={12} /> Add Provider
              </button>
            </div>
            <div className="space-y-3">
              {imageProviders.map(p => <ProviderCard key={p.id} provider={p} />)}
            </div>
          </section>

          {/* Provider resolution note */}
          <div className="glass rounded-xl p-5">
            <h3 className="text-[0.82rem] font-bold text-slate-700 mb-2">Provider Resolution Order</h3>
            <ol className="space-y-1.5 text-[0.78rem] text-slate-600">
              {[
                "Brief's explicitly chosen provider key",
                'Provider marked as default (isDefault = true)',
                'Environment variable fallback (ANTHROPIC_API_KEY / OPENAI_API_KEY)',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[0.6rem] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </main>
    </div>
  )
}
