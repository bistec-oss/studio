import React from 'react'
import { cn } from '@/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize    = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    // Light mode: solid ice-blue CTA
    'bg-primary text-white border border-primary/80',
    'hover:bg-primary-hover active:bg-primary-active',
    // Dark mode: ghost-fill with primary-light
    'dark:bg-primary-light/20 dark:text-primary-light dark:border-primary-light/30',
    'dark:hover:bg-primary-light/30 dark:active:bg-primary-light/40',
  ].join(' '),

  secondary: [
    'glass-input',
    'text-light-text dark:text-dark-text',
    'hover:border-primary/40 dark:hover:border-primary-light/40',
    'hover:bg-primary/5 dark:hover:bg-primary-light/5',
  ].join(' '),

  ghost: [
    'bg-transparent border border-transparent',
    'text-light-text-muted dark:text-dark-text-muted',
    'hover:bg-primary/5 dark:hover:bg-primary-light/5',
    'hover:text-primary dark:hover:text-primary-light',
  ].join(' '),
}

const sizeClasses: Record<ButtonSize, string> = {
  sm:  'px-3 py-1.5 text-xs  rounded-lg  gap-1.5',
  md:  'px-4 py-2   text-sm  rounded-xl  gap-2',
  lg:  'px-5 py-2.5 text-base rounded-xl gap-2.5',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 dark:focus-visible:ring-primary-light/50',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  )
}
