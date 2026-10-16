'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      ref={ref}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        [
          'inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors h-5 w-9',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-action' : 'bg-fg-subtle',
        ],
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform h-3.5 w-3.5',
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        )}
      />
    </button>
  )
)
Switch.displayName = 'Switch'

export { Switch }
