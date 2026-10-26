import Link from 'next/link'
import { Plus } from 'lucide-react'
import { FOCUS } from '@/components/ui/atoms'

// Floating "Create post" shortcut, fixed bottom-right on every (app) page
// except /brief and the draft page (AppShell decides). A plain link, so it
// always starts a fresh brief — resuming an unfinished one stays on the
// dashboard's Recent Drafts.
//
// The study's .fab (021 design.md §5): a 52 px ink pill (--accent, which is
// ink, with --accent-fg text), 24 px from the right and bottom, on the soft
// --shadow-overlay. Opaque: a solid fill, no alpha, no backdrop-filter. The
// Plus sits in a 38 px nub that turns 90° on hover; the press is a 0.98 scale.
// Under reduced motion neither moves.
// z-30 keeps it under the header (z-40), the mobile sidebar overlay and
// modals (z-50), and Sonner's toaster, whose offset in ToastProvider stacks
// toasts 20 px above it.
// Icon + label from md up; a 52 × 52 circle with the nub alone below md, where
// `title` gives the tooltip (set at every width — a title can't be
// breakpoint-scoped). aria-label keeps the accessible name identical at both
// widths.
export function CreatePostButton() {
  return (
    <Link
      href="/brief"
      aria-label="Create post"
      title="Create post"
      data-testid="create-post-fab"
      className={`
        group fixed bottom-6 right-6 z-30
        inline-flex items-center justify-center gap-2.5 h-[52px] w-[52px] md:w-auto md:pl-[7px] md:pr-5 rounded-ui-pill
        bg-accent text-accent-fg text-ui-sm font-semibold
        shadow-overlay
        transition-transform duration-fast ease-standard
        active:scale-[0.98] motion-reduce:active:transform-none
        ${FOCUS}
      `}
    >
      <span
        className="
          grid h-[38px] w-[38px] flex-shrink-0 place-items-center rounded-full bg-accent-fg/[0.14]
          transition-transform duration-base ease-standard
          group-hover:rotate-90 motion-reduce:group-hover:transform-none
        "
      >
        <Plus size={18} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="hidden md:inline">Create post</span>
    </Link>
  )
}
