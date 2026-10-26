import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { ThemeProvider, themeInitScript } from '@/components/theme/ThemeProvider'
import { QueryProvider } from '@/components/providers/QueryProvider'
import { ToastProvider } from '@/components/providers/ToastProvider'
import './globals.css'

// The two Graphite faces (change 021, design.md §3), self-hosted by next/font
// (NFR-05): Plus Jakarta Sans is the one sans (Tailwind `font-sans`, set on
// <body>), a variable font, so weights 400–700 need no list; JetBrains Mono is
// the code face (Tailwind `font-mono`).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'monospace'],
})

export const metadata: Metadata = {
  title: 'bistec-studio',
  description: 'Marketing post generation tool for the Bistec team',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-FOUC: apply saved theme before React hydrates */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${jakarta.variable} ${jetbrainsMono.variable} font-sans`}
      >
        <ThemeProvider>
          <QueryProvider>
            {children}
            <ToastProvider />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
