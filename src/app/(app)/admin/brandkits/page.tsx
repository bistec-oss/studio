'use client'

import React, { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { QueryError } from '@/components/ui/QueryError'
import { PageHead } from '@/components/ui/PageHead'
import { FOCUS, ICON, ICON_BUTTON, PILL_BADGE, SCROLL_FOCUS } from '@/components/ui/atoms'
import { apiFetch } from '@/lib/apiFetch'
import type { AdminBrandKitSummary, AdminBrandKitDetail } from '@/lib/api-types'
import { AddKitModal } from '@/components/admin/brandkits/AddKitModal'
import { KitDetail } from '@/components/admin/brandkits/KitDetail'
import { ColorSwatch } from '@/components/admin/brandkits/shared'
import { rowCls } from '@/components/admin/brandkits/classes'

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

      {/* Page head (DESIGN_SYSTEM.md §6): an eyebrow, the title, a lead. */}
      {/* One accent primary per view: once a kit is open, its own Save is the
          contextual primary, and Add Kit shows as an Outline button. */}
      <PageHead
        className="mb-6"
        eyebrow="Admin"
        title="Brand kits"
        lead="Manage brand identities, templates, and voice prompts."
        actions={
          <Button variant={selectedId ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
            <Plus {...ICON} /> Add Kit
          </Button>
        }
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* The kit list: one card of ruled rows; the open kit takes the nav
            "current" look, as the sidebar marks the current page (021 design.md
            §8). Capped at about eight rows (014 FR-09), so it scrolls inside its
            own box: a focusable, labelled region whether or not it overflows now
            (the static rule, FR-17). */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Brand kits"
          className={`surface max-h-[32rem] min-w-0 overflow-y-auto p-1.5 ${SCROLL_FOCUS}`}
        >
          {loading && (
            <div className="px-2 py-4 text-ui-sm text-fg-muted">Loading…</div>
          )}
          {!loading && kitsQuery.isError && (
            <div className="p-2">
              <QueryError error={kitsQuery.error} onRetry={() => kitsQuery.refetch()} />
            </div>
          )}
          {!loading && !kitsQuery.isError && kits.length === 0 && (
            <div className="py-6 text-center">
              <p className="text-ui-sm text-fg-muted">No brand kits yet.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAdding(true)}>
                <Plus {...ICON} /> Create one
              </Button>
            </div>
          )}
          {kits.length > 0 && (
            <ul>
              {kits.map(kit => {
                const selected = selectedId === kit.id
                return (
                  // Row select is a real button (keyboard reachable); the delete
                  // button sits beside it rather than nested inside (nested
                  // interactive elements are invalid HTML). It sits flush with
                  // the list edge, so its focus outline is inset: the list's own
                  // overflow would clip an outset one.
                  <li key={kit.id} className={rowCls(selected, 'flex items-center gap-1 pr-1')}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(kit.id)}
                      aria-current={selected ? 'true' : undefined}
                      className={`min-w-0 flex-1 cursor-pointer rounded-ui-sm py-2.5 pl-2.5 text-left ${SCROLL_FOCUS}`}
                    >
                      <span
                        className={`block truncate text-ui-sm ${selected ? 'font-semibold text-fg' : 'font-medium text-fg'}`}
                        title={kit.name}
                      >
                        {kit.name}
                      </span>
                      <span className="mt-1.5 flex items-center gap-1.5">
                        {kit.colors.slice(0, 5).map(c => <ColorSwatch key={c} color={c} decorative />)}
                        {kit.isDefault && (
                          <span className={`ml-1 ${PILL_BADGE}`}>default</span>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(kit.id)}
                      aria-label={`Delete brand kit ${kit.name}`}
                      title="Delete"
                      className={`${ICON_BUTTON} hover:text-status-failed ${FOCUS}`}
                    >
                      <Trash2 {...ICON} />
                    </button>
                    <ChevronRight
                      {...ICON}
                      aria-hidden="true"
                      className={`flex-shrink-0 text-fg-muted transition-transform duration-fast ease-standard ${selected ? 'rotate-90' : ''}`}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {selectedKit ? (
            <KitDetail kit={selectedKit} onRefresh={handleRefresh} />
          ) : (
            <div className="surface-bezel py-12 text-center text-ui-sm text-fg-muted">
              Select a brand kit to view details
            </div>
          )}
        </div>
      </div>
    </>
  )
}
