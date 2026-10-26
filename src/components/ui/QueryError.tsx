import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Panel } from '@/components/ui/Panel'
import { Button } from '@/components/ui/Button'

interface QueryErrorProps {
  error?: unknown
  message?: string
  onRetry: () => void
  className?: string
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong loading this data.'
}

// Shared inline error state for failed list/detail fetches — replaces the
// misleading "No X yet" empty state that a failed fetch used to fall through
// to (the request errored, it isn't that there's nothing there).
export function QueryError({ error, message, onRetry, className }: QueryErrorProps) {
  return (
    <Panel className={`p-8 text-center ${className ?? ''}`}>
      <AlertTriangle size={28} className="mx-auto mb-3 text-status-failed" />
      <p className="text-ui-sm text-fg mb-3">
        {message ?? messageFor(error)}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Panel>
  )
}
