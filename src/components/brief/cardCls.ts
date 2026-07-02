// Shared card-button styling (selected vs idle), used across the picker steps.
export function cardCls(selected: boolean, extra = '') {
  return [
    'rounded-xl border text-left transition-all duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-primary-light/50',
    selected
      ? 'bg-primary/10 dark:bg-primary-light/15 border-primary/40 dark:border-primary-light/40 shadow-sm'
      : 'glass-input border-transparent hover:border-primary/20 dark:hover:border-primary-light/20',
    extra,
  ].join(' ')
}
