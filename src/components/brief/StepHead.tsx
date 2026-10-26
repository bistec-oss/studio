'use client'

import React from 'react'
import { SECTION_HEAD } from '@/components/ui/atoms'

// ─── Step head ───────────────────────────────────────────────────────────────
// The step's card head (DESIGN_SYSTEM.md §8.14, the study's .card-hd h2): the
// h2 in the section style, then a muted lead. No numeral (021 A11): the
// stepper announces the step. Bespoke rather than the ui SectionHead (014
// FR-01): a lead with its own spacing, built from the shared heading string.

interface StepHeadProps {
  title: React.ReactNode
  children?: React.ReactNode // the lead paragraph
}

export function StepHead({ title, children }: StepHeadProps) {
  return (
    <>
      <h2 className={SECTION_HEAD}>{title}</h2>
      {children && <p className="mt-1.5 mb-6 text-ui-sm text-fg-muted">{children}</p>}
    </>
  )
}
