'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { STEPS } from './constants'
import { FOCUS, SMALL_CAPS } from '@/components/ui/atoms'

// ─── Stepper ─────────────────────────────────────────────────────────────────
// Graphite (021 design.md §8, DESIGN_SYSTEM.md §5.2, §6): the steps sit on one
// card, the current one raised in the nav "current" look. Each step shows a
// 22 px disc (the study's .st), ink with the step number for the current step,
// a check once done, the number on the canvas ahead, and beneath it the label
// as a micro-label (021 FR-07). The state is never colour alone: the current
// step carries aria-current="step", a done step its check, a step ahead
// aria-disabled (014 FR-15; it stays focusable). The number stays in the
// button's name, as before (021 FR-12). Below sm the label is sr-only, not
// removed, so a done step (whose number became a check) still has a name.

interface StepperProps {
  step: number
  onJump: (i: number) => void
}

export function Stepper({ step, onJump }: StepperProps) {
  return (
    <ol className="surface grid grid-cols-5 gap-1 p-1.5 mb-5">
      {STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <li key={label} className="min-w-0">
            <button
              type="button"
              onClick={() => done && onJump(i)}
              aria-current={active ? 'step' : undefined}
              aria-disabled={(!done && !active) || undefined}
              className={[
                'flex w-full flex-col items-center sm:items-start gap-2 rounded-ui-md p-2 sm:px-3 text-left',
                'transition-[background-color,color,box-shadow] duration-fast ease-standard',
                FOCUS,
                active
                  ? 'bg-surface-raised text-fg shadow-panel ring-1 ring-inset ring-line-subtle'
                  : done
                    ? 'text-fg cursor-pointer hover:bg-canvas'
                    : 'text-fg-muted cursor-default',
              ].join(' ')}
            >
              <span
                className={[
                  'flex size-[22px] flex-shrink-0 items-center justify-center rounded-full text-ui-2xs font-semibold leading-none tabular-nums',
                  active ? 'bg-accent text-accent-fg' : 'bg-canvas ring-1 ring-inset ring-line-subtle',
                ].join(' ')}
              >
                {done ? <Check size={13} strokeWidth={2} aria-hidden /> : i + 1}
              </span>
              <span className={`sr-only sm:not-sr-only sm:block ${SMALL_CAPS} leading-snug`}>
                {label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
