import Link from 'next/link'
import { Plus } from 'lucide-react'

// Floating "Create post" shortcut, fixed bottom-right on every (app) page
// except /brief (AppShell decides). A plain link, so it always starts a fresh
// brief — resuming an unfinished one stays on the dashboard's Recent Drafts.
// Opaque on purpose (solid fill, no alpha, no backdrop-filter): it floats over
// scrolling content. z-30 keeps it under the header (z-40), the mobile sidebar
// overlay and modals (z-50), and Sonner's toaster, whose offset in
// ToastProvider stacks toasts above it.
// Icon + label from md up; icon only below md, where `title` gives the tooltip
// (set at every width — a title can't be breakpoint-scoped). aria-label keeps
// the accessible name identical at both widths.
export function CreatePostButton() {
  return (
    <Link
      href="/brief"
      aria-label="Create post"
      title="Create post"
      data-testid="create-post-fab"
      className="
        fixed bottom-6 right-6 z-30
        flex items-center justify-center gap-2 h-14 min-w-14 px-4 md:px-5 rounded-full
        bg-primary text-white text-sm font-semibold
        shadow-lg shadow-black/20 dark:shadow-black/40
        hover:bg-primary-hover active:bg-primary-active transition-colors duration-150
        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-primary dark:focus-visible:outline-primary-light
      "
    >
      <Plus size={22} aria-hidden="true" />
      <span className="hidden md:inline">Create post</span>
    </Link>
  )
}
