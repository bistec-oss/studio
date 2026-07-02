'use client'

import { useCallback, useState } from 'react'
import { toast } from 'sonner'

// Captures the "do a regenerate-style action, then offer a one-click Undo"
// pattern that shows up wherever a mutation replaces something the user might
// want back (regenerated copy, regenerated design, …). The caller supplies
// `restore`, which knows how to turn a captured snapshot back into the live
// state (API call + any local state updates); this hook only owns the
// snapshot value and the in-flight/undoing flags.

export interface UseUndoableActionResult<T> {
  /** The captured "previous" value, or null when there's nothing to undo. */
  snapshot: T | null
  /** True while `undo()` is in flight. */
  undoing: boolean
  /** Record a new "previous" value after a regenerate-style action. */
  capture: (value: T) => void
  /** Discard the current snapshot without restoring it. */
  clear: () => void
  /** Restore the captured snapshot via `restore`, then clear it. */
  undo: () => Promise<void>
}

export function useUndoableAction<T>(
  restore: (snapshot: T) => Promise<void>
): UseUndoableActionResult<T> {
  const [snapshot, setSnapshot] = useState<T | null>(null)
  const [undoing, setUndoing] = useState(false)

  const capture = useCallback((value: T) => setSnapshot(value), [])
  const clear = useCallback(() => setSnapshot(null), [])

  const undo = useCallback(async () => {
    if (snapshot === null) return
    setUndoing(true)
    try {
      await restore(snapshot)
      setSnapshot(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to undo')
    } finally {
      setUndoing(false)
    }
  }, [snapshot, restore])

  return { snapshot, undoing, capture, clear, undo }
}
