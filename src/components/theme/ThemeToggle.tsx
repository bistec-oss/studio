'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from './ThemeProvider'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="
        p-2 rounded-xl
        text-light-text-muted dark:text-dark-text-muted
        hover:bg-primary/10 dark:hover:bg-primary-light/10
        hover:text-primary dark:hover:text-primary-light
        transition-colors duration-150
      "
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
