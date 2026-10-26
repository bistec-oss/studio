'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { useModels } from '@/lib/hooks/useModels'
import type { ModelKey, UserSurface } from '@/lib/models/catalogue'
import {
  TEAM_TOKEN_NOTICE,
  isStalePick,
  pickerState,
  reportedValue,
  teamTokenNotice,
  type PickerContext,
} from '@/lib/models/pickerState'
import { Notice } from './Notice'
import { Select } from './Select'

interface ModelPickerProps {
  surface: UserSurface
  /** The stamp and design path the pre-selection reads (FR-09, A8). */
  context?: PickerContext
  /** The user's pick, or undefined while the pre-selection stands (A5). */
  value: ModelKey | undefined
  /** Called with undefined when the user picks the pre-selected model again (A5). */
  onChange: (value: ModelKey | undefined) => void
  /** The accessible name: "Model", or a surface-specific one where several share a screen. */
  label?: string
  /** Disabled while any action is pending, like the controls beside it. */
  disabled?: boolean
  /** Overrides GET /api/models' team-default answer, for a caller that knows the draft's own provider. */
  captionProviderIsClaude?: boolean
  /** An extra hint line from the caller (e.g. why a pick was reset). */
  note?: string
  /** A refused pick's message (the server's 400 MODEL_NOT_ALLOWED), shown as the field error. */
  error?: string
  id?: string
  className?: string
}

const HINT = 'text-ui-xs text-fg-muted'

// The shared model picker (008 FR-18, design §9): the effective set for the
// surface, pre-selected to what the server would run, a hint line saying why,
// and FR-22's team-token notice. Every answer comes from pickerState.ts over
// useModels(); this component adds no rule of its own. Renders nothing until
// the models view loads, and nothing for CAPTION when the caption provider
// isn't Claude. A pick that stops being offered is reported back as undefined.
export function ModelPicker({
  surface,
  context,
  value,
  onChange,
  label = 'Model',
  disabled,
  captionProviderIsClaude,
  note,
  error,
  id,
  className,
}: ModelPickerProps) {
  const { data: models } = useModels()
  const generatedId = React.useId()
  const selectId = id ?? generatedId
  const hintId = `${selectId}-hint`

  const state = models ? pickerState(surface, models, context, captionProviderIsClaude) : null
  // A pick that is no longer offered (a policy change under an open picker) is
  // reset, so the caller never sends a key the server would refuse. Once per
  // stale value: a caller that ignores the reset is not called again for it.
  const stale = state !== null && isStalePick(state, value)
  const resetFor = React.useRef<ModelKey | undefined>(undefined)
  React.useEffect(() => {
    if (!stale) {
      resetFor.current = undefined
    } else if (value !== resetFor.current) {
      resetFor.current = value
      onChange(undefined)
    }
  }, [stale, value, onChange])

  if (!models || !state || state.kind === 'hidden') return null

  const preselected = state.preselected.key
  // Until the reset lands, a stale pick shows the pre-selection the server would run.
  const shown = value && !stale ? value : preselected
  const hints = [value === undefined ? state.hint : null, state.gated, note].filter(
    (h): h is string => Boolean(h),
  )

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {state.kind === 'single' ? (
        <p className="text-ui-sm text-fg">{`${label}: ${state.preselected.entry.displayName}`}</p>
      ) : (
        <Select
          id={selectId}
          label={label}
          options={state.options.map((o) => ({ value: o.value, label: `${o.label} (${o.speed})` }))}
          value={shown}
          disabled={disabled}
          error={error}
          aria-describedby={hints.length > 0 ? hintId : undefined}
          onChange={(e) => {
            const chosen = state.options.find((o) => o.value === e.target.value)
            if (chosen) onChange(reportedValue(chosen.value, preselected))
          }}
        />
      )}
      {hints.length > 0 && (
        <div id={hintId} className={HINT}>
          {hints.map((h) => (
            <p key={h}>{h}</p>
          ))}
        </div>
      )}
      {teamTokenNotice(models, shown, surface) && (
        <Notice tone="warning" role="status">
          {TEAM_TOKEN_NOTICE}
        </Notice>
      )}
    </div>
  )
}
