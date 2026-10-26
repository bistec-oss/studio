'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Select } from '@/components/ui/Select'
import { apiFetch } from '@/lib/apiFetch'
import type { FontFamily } from '@/lib/fonts/types'

// 031 FR-25: the font a kit uses for Sinhala text. One Select over the families that carry the
// script (GET /api/fonts?script=sinhala); None leaves Sinhala to the system font.
interface ScriptFontPickerProps {
  value: string | null
  onChange: (family: string | null) => void
}

export function ScriptFontPicker({ value, onChange }: ScriptFontPickerProps) {
  const { data } = useQuery({
    queryKey: ['fonts', 'script', 'sinhala'],
    queryFn: () => apiFetch<{ snapshotDate: string; families: FontFamily[] }>('/api/fonts?script=sinhala'),
    staleTime: 5 * 60_000,
  })
  const families = data?.families ?? []
  // A stored family missing from the list must still show as selected.
  const names = families.map(f => f.family)
  if (value && !names.includes(value)) names.push(value)
  const options = [
    { value: '', label: 'None (system font)' },
    ...names.map(n => ({ value: n, label: n })),
  ]
  return (
    <Select
      label="Sinhala font"
      options={options}
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : e.target.value)}
    />
  )
}
