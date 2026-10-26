'use client'

// The review hook (007 FR-12). It owns the 300 ms live detector, the in-flight
// guard and the review state, and knows nothing about brand kits: the host
// passes the text, a setter and a `request(text)` that asks the server. A
// response is applied only if the text it carried is still the text.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectVagueDesign, suggestionFor, type Candidate } from '@/lib/designData/authoring'
import {
  acceptEdit,
  dismissKey,
  initialReviewState,
  reviewReducer,
  type EditStatus,
  type ReviewState,
} from '@/lib/kitUpgrade/review'
import { ApiError } from '@/lib/apiFetch'
import type { UpgradeEdit, UpgradeRejection, UpgradeResponse } from '@/lib/api-types'

const DEBOUNCE_MS = 300

export const TEXT_CHANGED_NOTICE = 'The text changed while we were working. Ask again'

export interface RuleFlag {
  key: string
  candidate: Candidate
  label: string
  suggestion: string
}

export interface ReviewError {
  message: string
  code: string | null
  /** A parse failure may succeed on a second ask: the panel offers "Try again". */
  retryable: boolean
}

export type ReviewOutcome =
  | { kind: 'edits'; rejected: UpgradeRejection[] }
  | {
      kind: 'none'
      reason: 'no-candidates' | 'model-proposed-none' | 'all-rejected'
      rejected: UpgradeRejection[]
    }

export interface ReviewEdit {
  edit: UpgradeEdit
  status: EditStatus
}

interface Options {
  text: string
  setText: (text: string) => void
  request: (text: string) => Promise<UpgradeResponse>
}

export function useRuleReview({ text, setText, request }: Options) {
  const [state, setState] = useState<ReviewState>(initialReviewState)
  const [scanned, setScanned] = useState(text)
  const [upgrading, setUpgrading] = useState(false)
  const [error, setError] = useState<ReviewError | null>(null)
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const textRef = useRef(text)

  useEffect(() => {
    textRef.current = text
  }, [text])

  // The live detector: browser only, never the server.
  useEffect(() => {
    const t = setTimeout(() => setScanned(text), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])

  const detected = useMemo(() => detectVagueDesign(scanned), [scanned])

  // Pending and stale edits follow the text; dismissals whose quote is gone drop.
  const view = useMemo(() => reviewReducer(state, { type: 'textChanged', text }), [state, text])

  const flags = useMemo<RuleFlag[]>(
    () =>
      detected.candidates
        .map((candidate) => {
          const s = suggestionFor(candidate)
          return {
            key: dismissKey(candidate.entryKey, candidate.quote),
            candidate,
            label: s?.label ?? candidate.entryKey,
            suggestion: s?.text ?? '',
          }
        })
        .filter((f) => !view.dismissed.has(f.key)),
    [detected, view.dismissed],
  )

  const upgrade = useCallback(async () => {
    const sent = textRef.current
    if (upgrading || !sent.trim()) return
    setUpgrading(true)
    setError(null)
    setOutcome(null)
    setNotice(null)
    try {
      const res = await request(sent)
      if (textRef.current !== sent) {
        setNotice(TEXT_CHANGED_NOTICE)
        return
      }
      if (res.outcome === 'edits') {
        setState((s) => reviewReducer(s, { type: 'proposed', edits: res.edits, text: sent }))
        setOutcome({ kind: 'edits', rejected: res.rejected })
      } else {
        setState((s) => reviewReducer(s, { type: 'proposed', edits: [], text: sent }))
        setOutcome({ kind: 'none', reason: res.reason, rejected: res.rejected })
      }
    } catch (e: unknown) {
      const code = e instanceof ApiError ? e.code : null
      setError({
        message: e instanceof Error ? e.message : 'Something went wrong',
        code,
        retryable: code === 'UPGRADE_PARSE_FAILED',
      })
    } finally {
      setUpgrading(false)
    }
  }, [request, upgrading])

  const accept = useCallback(
    (id: string) => {
      // Only acceptEdit applies the edit and re-checks the rest.
      const next = acceptEdit(view, id, text)
      setState(next.state)
      if (next.text !== text) setText(next.text)
    },
    [view, text, setText],
  )

  const reject = useCallback(
    (id: string) => setState(reviewReducer(view, { type: 'reject', id })),
    [view],
  )

  const dismiss = useCallback(
    (key: string) => setState(reviewReducer(view, { type: 'dismiss', key })),
    [view],
  )

  const reset = useCallback(() => {
    setState(initialReviewState)
    setError(null)
    setOutcome(null)
    setNotice(null)
  }, [])

  return {
    flags,
    truncated: detected.truncated,
    more: detected.more,
    upgrading,
    canUpgrade: !upgrading && text.trim().length > 0,
    error,
    outcome,
    notice,
    edits: view.edits as ReviewEdit[],
    upgrade,
    accept,
    reject,
    dismiss,
    reset,
  }
}

export type RuleReview = ReturnType<typeof useRuleReview>
