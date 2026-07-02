'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { GlassInput } from '@/components/ui/GlassInput'
import { Modal } from '@/components/ui/Modal'
import { apiFetch } from '@/lib/apiFetch'

// ─── Add Kit Modal ────────────────────────────────────────────────────────────

interface AddKitModalProps {
  onClose: () => void
  onCreated: (id: string) => void
}

export function AddKitModal({ onClose, onCreated }: AddKitModalProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const kit = await apiFetch<{ id: string }>('/api/admin/brandkits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), colors: [], fonts: [] }),
      })
      onCreated(kit.id)
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Something went wrong') }
    finally { setSaving(false) }
  }

  return (
    <Modal open onClose={onClose} title="New Brand Kit" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <GlassInput
          label="Name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Bistec 2026"
          autoFocus
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Creating…' : 'Create'}</Button>
        </div>
      </form>
    </Modal>
  )
}
