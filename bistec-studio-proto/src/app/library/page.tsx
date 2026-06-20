'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Instagram, Linkedin, Plus, Filter } from 'lucide-react'
import Header from '@/components/Header'
import { Badge } from '@/components/Badge'
import { drafts, campaigns } from '@/data/mock'
import { statusConfig } from '@/lib/utils'
import type { DraftStatus, Platform } from '@/data/mock'

const platformIcon = { instagram: Instagram, linkedin: Linkedin }

const statusOrder: DraftStatus[] = ['generating', 'ready', 'pending', 'published', 'failed']
const allStatuses: { value: DraftStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'ready', label: 'Ready' },
  { value: 'generating', label: 'Generating' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
]

const pathColors: Record<string, string> = {
  A: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  B: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/60',
}

export default function LibraryPage() {
  const [statusFilter, setStatusFilter] = useState<DraftStatus | 'all'>('all')
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [platformFilter, setPlatformFilter] = useState<Platform | 'all'>('all')

  const filtered = drafts
    .filter(d => statusFilter === 'all' || d.status === statusFilter)
    .filter(d => campaignFilter === 'all' || d.campaignName === campaignFilter)
    .filter(d => platformFilter === 'all' || d.platform === platformFilter)
    .sort((a, b) => statusOrder.indexOf(a.status as DraftStatus) - statusOrder.indexOf(b.status as DraftStatus))

  const uniqueCampaigns = [...new Set(drafts.map(d => d.campaignName))]

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Header title="Library" />
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <div className="flex items-center gap-1 mr-1">
            <Filter size={13} className="text-slate-400" />
            <span className="text-[0.72rem] font-semibold text-slate-500 uppercase tracking-widest">Filter</span>
          </div>

          {/* Status filters */}
          <div className="flex flex-wrap gap-1">
            {allStatuses.map(s => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1 rounded-full text-[0.72rem] font-semibold transition-all ${
                  statusFilter === s.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-slate-200 mx-1 hidden sm:block" />

          {/* Platform filter */}
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

        {/* Campaign sections */}
        {uniqueCampaigns.map(campaign => {
          const items = filtered.filter(d => d.campaignName === campaign)
          if (items.length === 0) return null
          return (
            <div key={campaign} className="mb-6">
              <h3 className="text-[0.72rem] font-bold tracking-widest uppercase text-slate-400 mb-2 px-1">{campaign}</h3>
              <div className="glass rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px]">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Post</th>
                        <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Platform</th>
                        <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Path</th>
                        <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Revisions</th>
                        <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Status</th>
                        <th className="px-4 py-2.5 text-left text-[0.65rem] font-bold tracking-widest uppercase text-slate-400">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map(draft => {
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
      </main>
    </div>
  )
}
