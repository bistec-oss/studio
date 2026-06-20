import type { Metadata } from 'next'
import { DM_Sans, JetBrains_Mono, Syne } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import TourProvider from '@/components/TourProvider'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })
const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: '800' })

export const metadata: Metadata = {
  title: 'bistec-studio',
  description: 'Marketing post generation tool for the Bistec team',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrains.variable} ${syne.variable}`}>
      <body className="font-sans bg-surface-2 text-slate-800 h-screen overflow-hidden">
        <div className="flex flex-col md:grid md:grid-cols-[240px_1fr] h-screen">
          <Sidebar />
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden min-w-0 bg-mesh">
            {children}
            <TourProvider />
          </div>
        </div>
      </body>
    </html>
  )
}
