import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { GlassPanel } from '@/components/ui/GlassPanel'

// Server-side gate for every /admin page. The sidebar already hides the Admin
// entry for non-admins; this enforces it for direct navigation. API routes
// carry their own requireRole('admin') checks — this is the page-level UX.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  if (user?.role !== 'admin') {
    return (
      <GlassPanel className="p-12 text-center max-w-md mx-auto mt-12">
        <ShieldAlert size={32} className="mx-auto mb-3 text-light-text-muted dark:text-dark-text-muted" />
        <h1 className="text-lg font-semibold text-light-text dark:text-dark-text mb-1">
          Requires admin
        </h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-4">
          This area is limited to administrators. Ask an admin if you need access.
        </p>
        <Link
          href="/"
          className="text-sm text-primary dark:text-primary-light hover:underline"
        >
          Back to Dashboard
        </Link>
      </GlassPanel>
    )
  }

  return <>{children}</>
}
