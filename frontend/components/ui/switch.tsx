'use client'

import * as React from 'react'
import { cn, cnV2 } from '@/lib/utils'

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
      className={cnV2(
        [
          'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors v2:h-5 v2:w-9',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 v2:focus-visible:ring-action/30 v2:focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-primary v2:bg-action' : 'bg-slate-200 v2:bg-fg-subtle',
        ],
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform v2:h-3.5 v2:w-3.5',
          checked ? 'translate-x-[22px] v2:translate-x-[18px]' : 'translate-x-1 v2:translate-x-[2px]'
        )}
      />
    </button>
  )
)
Switch.displayName = 'Switch'

export { Switch }
