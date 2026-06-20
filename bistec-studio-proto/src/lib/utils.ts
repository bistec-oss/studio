export function formatCurrency(n: number): string {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B'
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K'
  return '$' + n
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Status → display label + badge color key
export const statusConfig: Record<string, { label: string; color: string }> = {
  // draft statuses
  draft: { label: 'Draft', color: 'muted' },
  generating: { label: 'Generating', color: 'primary' },
  ready: { label: 'Ready', color: 'success' },
  published: { label: 'Published', color: 'info' },
  failed: { label: 'Failed', color: 'error' },
  // campaign statuses
  active: { label: 'Active', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  completed: { label: 'Completed', color: 'info' },
  archived: { label: 'Archived', color: 'muted' },
  // provider statuses
  connected: { label: 'Connected', color: 'success' },
  error: { label: 'Error', color: 'error' },
  unconfigured: { label: 'Not configured', color: 'muted' },
}

// Light-theme badge pill styles
export const badgeStyles: Record<string, string> = {
  info:    'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60',
  warning: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/60',
  error:   'bg-red-50 text-red-600 ring-1 ring-red-200/60',
  primary: 'bg-blue-50 text-blue-600 ring-1 ring-blue-200/60',
  purple:  'bg-violet-50 text-violet-600 ring-1 ring-violet-200/60',
  orange:  'bg-orange-50 text-orange-600 ring-1 ring-orange-200/60',
  muted:   'bg-slate-100 text-slate-500 ring-1 ring-slate-200/60',
}

// Status dot color styles
export const dotStyles: Record<string, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
  info:    'bg-blue-500',
  primary: 'bg-blue-500',
  muted:   'bg-slate-400',
}

// Priority → dot color mapping
export const priorityColor: Record<string, string> = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'muted',
}
