'use client'

// The review panel (007 FR-12, FR-13, FR-14): the live flagged list, the
// Upgrade button and one card per proposed edit. It renders a RuleReview from
// useRuleReview and uses the Graphite atoms only.
import React from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { ICON, SUB_HEAD, TAG } from '@/components/ui/atoms'
import type { RuleReview } from './useRuleReview'

const PROVENANCE_LABEL = {
  dataset: 'From the design-rule dataset',
  unverified: 'Number not from the dataset, check it',
} as const

const STALE_REASON = 'This phrase appears more than once; reword one occurrence'

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

const KIT_STALE_TEXT = 'The active version changed. Reload the page to start from it.'

export function RuleReviewPanel({
  review,
  staleBaseText = KIT_STALE_TEXT,
}: {
  review: RuleReview
  /** Shown under the error when the host's base version moved (STALE_BASE). */
  staleBaseText?: string
}) {
  const { flags, edits, outcome, error, notice } = review
  const rejected = outcome?.rejected ?? []
  const repeated = rejected.some((r) => r.reason === 'stale-quote')

  return (
    <section role="region" aria-label="Design rules" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className={SUB_HEAD}>Design rules</h4>
        <span className="text-ui-xs text-fg-muted" aria-live="polite">
          {flags.length === 0
            ? 'No vague phrases flagged'
            : `${plural(flags.length, 'phrase', 'phrases')} flagged`}
        </span>
      </div>

      {review.truncated && (
        <Notice tone="neutral">Only the first 20,000 characters are checked.</Notice>
      )}

      {flags.length > 0 && (
        <ul className="divide-y divide-line-subtle" aria-label="Flagged phrases">
          {flags.map((f) => (
            <li key={f.key} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
              <div className="min-w-0 flex-1 basis-56 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-mono text-ui-sm font-semibold text-fg">
                    {f.candidate.quote}
                  </span>
                  <span className={TAG}>{f.label}</span>
                </div>
                <p className="break-words text-ui-xs text-fg-muted">Try: {f.suggestion}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => review.dismiss(f.key)}
                aria-label={`Dismiss flag: ${f.candidate.quote}`}
              >
                Dismiss
              </Button>
            </li>
          ))}
        </ul>
      )}
      {review.more && (
        <p className="text-ui-xs text-fg-muted">
          More phrases exist than are listed; fix these and check again.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={review.upgrade}
          disabled={!review.canUpgrade}
        >
          <Sparkles {...ICON} />
          {review.upgrading ? 'Upgrading…' : 'Upgrade'}
        </Button>
      </div>

      {error && (
        <Notice tone="error" role="alert">
          <p className="break-words">{error.message}</p>
          {error.code === 'STALE_BASE' && (
            <p className="mt-1">{staleBaseText}</p>
          )}
          {error.retryable && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={review.upgrade}
              disabled={!review.canUpgrade}
            >
              Try again
            </Button>
          )}
        </Notice>
      )}

      {notice && (
        <Notice tone="warning" role="status">
          {notice}
        </Notice>
      )}

      {outcome?.kind === 'none' && (
        <Notice tone="neutral" role="status">
          {outcome.reason === 'no-candidates' &&
            'Nothing to upgrade: no vague design phrase was found.'}
          {outcome.reason === 'model-proposed-none' &&
            'The model had no suggestions for these phrases.'}
          {outcome.reason === 'all-rejected' &&
            `${plural(rejected.length, 'suggestion', 'suggestions')} failed the checks and were dropped.`}
          {repeated && ` ${STALE_REASON}.`}
        </Notice>
      )}
      {outcome?.kind === 'edits' && rejected.length > 0 && (
        <Notice tone="neutral" role="status">
          {plural(rejected.length, 'suggestion', 'suggestions')} failed the checks and were dropped.
          {repeated && ` ${STALE_REASON}.`}
        </Notice>
      )}

      {edits.length > 0 && (
        <ul className="divide-y divide-line-subtle" aria-label="Proposed edits">
          {edits.map(({ edit, status }) => (
            <li key={edit.id} className="py-3">
              <div role="group" aria-label={`Edit for ${edit.quote}`} className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={TAG}>{edit.kind === 'replace' ? 'Replace' : 'Add after'}</span>
                  <span className={TAG}>{PROVENANCE_LABEL[edit.provenance]}</span>
                </div>
                {/* An insert removes nothing, so only a replace strikes its quote. */}
                <p className="break-words text-ui-sm text-fg">
                  {edit.kind === 'replace' ? (
                    <>
                      <del className="text-fg-muted">{edit.quote}</del>
                      {' becomes '}
                    </>
                  ) : (
                    <>
                      {'After the sentence with '}
                      <span className="text-fg-muted">“{edit.quote}”</span>
                      {', add '}
                    </>
                  )}
                  <ins className="font-semibold no-underline">{edit.replacement}</ins>
                </p>
                <p className="break-words text-ui-xs text-fg-muted">{edit.rationale}</p>
                {edit.provenance === 'unverified' && (
                  <Notice tone="warning">Check this number before you accept it.</Notice>
                )}
                {status === 'stale' && (
                  <p className="text-ui-xs text-fg-muted">
                    This edit no longer applies: its phrase changed or appears more than once.{' '}
                    {STALE_REASON}.
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {status === 'accepted' && <span className={TAG}>Accepted</span>}
                  {status === 'rejected' && <span className={TAG}>Rejected</span>}
                  {(status === 'pending' || status === 'stale') && (
                    <>
                      <Button
                        variant="ink"
                        size="sm"
                        onClick={() => review.accept(edit.id)}
                        disabled={status === 'stale'}
                      >
                        Accept
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => review.reject(edit.id)}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
