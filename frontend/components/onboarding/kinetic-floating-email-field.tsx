'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type KeyboardEventHandler,
  type ReactNode,
} from 'react'
import { Mail } from 'lucide-react'

/** Shared sign-in / split-signup email: floating label, mail icon, neutral focus (no blue ring). */
const inputSurfaceClass =
  'peer h-14 w-full rounded-md border border-[#c6c6cc]/80 bg-[#fcf8fa] pt-4 pb-1 pl-11 pr-3 text-[15px] text-[#1b1b1d] outline-none transition-[border-color,background-color] placeholder:text-transparent focus:border-[#9ea0a8] focus:bg-white focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60'

export type KineticFloatingEmailFieldProps = {
  id: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
  required?: boolean
  autoFocus?: boolean
  autoComplete?: string
  label?: string
  /** Shown to the right of the field (e.g. signup submit arrow). */
  trailing?: ReactNode
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  onFocus?: () => void
}

export const KineticFloatingEmailField = forwardRef<HTMLInputElement, KineticFloatingEmailFieldProps>(
  function KineticFloatingEmailField(
    {
      id,
      value,
      onValueChange,
      disabled,
      required,
      autoFocus,
      autoComplete = 'email',
      label = 'Email address',
      trailing,
      onKeyDown,
      onFocus: onFocusProp,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement)

    const [focused, setFocused] = useState(false)

    const syncFromDom = useCallback(() => {
      const v = inputRef.current?.value?.trim() ?? ''
      if (v) onValueChange(v)
    }, [onValueChange])

    useEffect(() => {
      const t1 = setTimeout(syncFromDom, 100)
      const t2 = setTimeout(syncFromDom, 400)
      const t3 = setTimeout(syncFromDom, 800)
      const t4 = setTimeout(syncFromDom, 1500)
      const t5 = setTimeout(syncFromDom, 2500)
      const interval = setInterval(syncFromDom, 300)
      const stopInterval = setTimeout(() => clearInterval(interval), 3000)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
        clearTimeout(t4)
        clearTimeout(t5)
        clearInterval(interval)
        clearTimeout(stopInterval)
      }
    }, [syncFromDom])

    const labelFloated = focused || value.length > 0

    const field = (
      <div className="relative min-w-0 flex-1">
        <div className="relative">
          <Mail
            className={`pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition-colors duration-200 ${focused ? 'text-[#006e16]' : 'text-[#76777d]'}`}
            aria-hidden
          />
          <input
            ref={inputRef}
            id={id}
            type="email"
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onBlur={() => {
              setFocused(false)
              syncFromDom()
            }}
            onFocus={() => {
              setFocused(true)
              syncFromDom()
              onFocusProp?.()
            }}
            onAnimationStart={(e) => {
              if (e.animationName) syncFromDom()
            }}
            onKeyDown={onKeyDown}
            autoFocus={autoFocus}
            autoComplete={autoComplete}
            disabled={disabled}
            required={required}
            className={inputSurfaceClass}
            placeholder={label}
          />
          <label
            htmlFor={id}
            className={`pointer-events-none absolute left-11 transition-all duration-200 ease-out ${labelFloated ? 'top-2 text-[11px] font-medium text-[#45474c]' : 'top-1/2 -translate-y-1/2 text-[15px] text-[#76777d]'}`}
          >
            {label}
          </label>
        </div>
      </div>
    )

    if (trailing != null) {
      return (
        <div className="flex items-center gap-2">
          {field}
          {trailing}
        </div>
      )
    }

    return field
  },
)

KineticFloatingEmailField.displayName = 'KineticFloatingEmailField'
