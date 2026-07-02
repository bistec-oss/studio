// Shared date formatters — the single source for "how long ago" and
// "absolute date/time" strings across the app. Consolidates three
// near-duplicate implementations that had drifted (dashboard's
// `relativeTime`, the draft page's misnamed `timeAgo` which actually
// returned an absolute date, and the publish history drawer's `formatDate`).

// Relative "time ago" string — e.g. "just now", "5m ago", "3h ago", "2d ago",
// or a short absolute date once it's more than ~30 days old.
export function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Absolute date/time string — e.g. "Jun 24, 2026, 3:45 PM". Accepts a Date,
// an ISO string, or null/undefined (renders as an em dash).
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
