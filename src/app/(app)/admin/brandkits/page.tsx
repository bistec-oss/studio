'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { QueryError } from '@/components/ui/QueryError'
import { apiFetch } from '@/lib/apiFetch'
import type { AdminBrandKitSummary, AdminBrandKitDetail } from '@/lib/api-types'
import { AddKitModal } from '@/components/admin/brandkits/AddKitModal'
import { KitDetail } from '@/components/admin/brandkits/KitDetail'
import { ColorSwatch } from '@/components/admin/brandkits/shared'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandKitsPage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const kitsQuery = useQuery({
    queryKey: ['admin-brandkits'],
    queryFn: () => apiFetch<AdminBrandKitSummary[]>('/api/admin/brandkits'),
  })

  const selectedKitQuery = useQuery({
    queryKey: ['admin-brandkits', selectedId],
    queryFn: () => apiFetch<AdminBrandKitDetail>(`/api/admin/brandkits/${selectedId}`),
    enabled: !!selectedId,
  })

  const kits = kitsQuery.data ?? []
  const selectedKit = selectedId ? selectedKitQuery.data ?? null : null
  const loading = kitsQuery.isLoading

  function invalidateKits() {
    return queryClient.invalidateQueries({ queryKey: ['admin-brandkits'] })
  }

  function handleCreated(id: string) {
    setAdding(false)
    invalidateKits().then(() => setSelectedId(id))
  }

  function handleRefresh() {
    invalidateKits()
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this brand kit?', confirmLabel: 'Delete' }))) return
    try {
      await apiFetch(`/api/admin/brandkits/${id}`, { method: 'DELETE' })
      if (selectedId === id) setSelectedId(null)
      invalidateKits()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
  }

  return (
    <>
      {adding && <AddKitModal onClose={() => setAdding(false)} onCreated={handleCreated} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">Brand Kits</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Manage brand identities, templates, and voice prompts.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus size={16} /> Add Kit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar list */}
        <div className="space-y-2">
          {loading && (
            <div className="text-sm text-light-text-muted dark:text-dark-text-muted px-2 py-4">Loading…</div>
          )}
          {!loading && kitsQuery.isError && (
            <QueryError error={kitsQuery.error} onRetry={() => kitsQuery.refetch()} />
          )}
          {!loading && !kitsQuery.isError && kits.length === 0 && (
            <GlassPanel className="p-4 text-center">
              <p className="text-sm text-light-text-muted dark:text-dark-text-muted">No brand kits yet.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(true)}>
                <Plus size={13} /> Create one
              </Button>
            </GlassPanel>
          )}
          {kits.map(kit => (
            // Row select is a real button (keyboard reachable); the delete
            // button sits beside it rather than nested inside (nested
            // interactive elements are invalid HTML).
            <div
              key={kit.id}
              className={`glass-panel rounded-xl transition-all flex items-center gap-2 ${
                selectedId === kit.id
                  ? 'border-primary/40 dark:border-primary-light/30 bg-primary/5 dark:bg-primary-light/5'
                  : 'hover:bg-primary/5 dark:hover:bg-primary-light/5'
              }`}
            >
              <button
                type="button"
                onClick={() => setSelectedId(kit.id)}
                aria-current={selectedId === kit.id ? 'true' : undefined}
                className="flex-1 min-w-0 text-left pl-4 py-3 rounded-xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-primary-light/50"
              >
                <div className="text-sm font-medium text-light-text dark:text-dark-text truncate">{kit.name}</div>
                <div className="flex items-center gap-1.5 mt-1">
                  {kit.colors.slice(0, 5).map(c => <ColorSwatch key={c} color={c} />)}
                  {kit.isDefault && (
                    <span className="text-xs text-primary dark:text-primary-light font-mono ml-1">default</span>
                  )}
                </div>
              </button>
              <div className="flex items-center gap-1 flex-shrink-0 pr-4 py-3">
                <button
                  onClick={() => handleDelete(kit.id)}
                  aria-label={`Delete brand kit ${kit.name}`}
                  className="p-1 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
                <ChevronRight size={14} aria-hidden="true" className={`text-light-text-muted dark:text-dark-text-muted transition-transform ${selectedId === kit.id ? 'rotate-90' : ''}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {selectedKit ? (
            <KitDetail kit={selectedKit} onRefresh={handleRefresh} />
          ) : (
            <GlassPanel className="p-8 text-center text-light-text-muted dark:text-dark-text-muted">
              Select a brand kit to view details
            </GlassPanel>
          )}
        </div>
      </div>
    </>
  )
}
