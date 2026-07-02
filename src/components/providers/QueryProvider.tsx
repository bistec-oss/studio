'use client'

import React, { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// One QueryClient per browser session (created lazily via useState so it
// survives re-renders but isn't shared across requests on the server).
// Defaults favour "boring": short staleness so list pages don't feel stale
// after a mutation elsewhere, a single retry (no retry storms against a
// down API), and no refetch-on-focus churn while editing a form.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
