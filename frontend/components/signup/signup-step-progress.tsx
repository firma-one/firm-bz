'use client'

import { cn } from '@/lib/utils'

/** Four segments: email → auth method → OTP → success. */
export const SIGNUP_PROGRESS_STEPS = 4

const STEPS = SIGNUP_PROGRESS_STEPS

export type SignupStepKey = 'info' | 'auth-method' | 'otp-verify' | 'success'

const STEP_ORDER: SignupStepKey[] = ['info', 'auth-method', 'otp-verify', 'success']

export function signupStepIndex(step: SignupStepKey): number {
  return STEP_ORDER.indexOf(step)
}

/**
 * Maps UI state to 0–3 progress (four mini-bars).
 * - 0: email + name (`info`)
 * - 1: choose auth (`auth-method` — Continue with Email Code or Google)
 * - 2: enter OTP (`otp-verify`; Google OAuth skips this and redirects from step 1)
 * - 3 (all filled): signup-success page
 */
export function computeSignupProgressIndex(
  step: SignupStepKey,
  emailVerifiedNewUser: boolean,
): number {
  if (step === 'success') return STEPS  // sentinel: all bars filled
  if (step === 'otp-verify') return 2
  if (step === 'auth-method') return 1
  if (step === 'info' && emailVerifiedNewUser) return 1
  return 0
}

export type SignupStepProgressVariant = 'kineticDark' | 'light' | 'mk'

/** Steps the v2 marketing sign-up card counts: details → how to sign in → code. */
const MK_STEPS = 3

/**
 * 1-based step for the `mk` card ("Step 2 of 3"): details (email + name) is 1, choosing how to sign in
 * is 2, the code is 3. Google OAuth leaves from step 2; `success` keeps every bar filled.
 */
export function signupMkStepNumber(step: SignupStepKey): number {
  if (step === 'auth-method') return 2
  if (step === 'otp-verify' || step === 'success') return 3
  return 1
}

/**
 * Four-segment progress: `kineticDark` for navy hero; `light` for the signup card (right column).
 * `mk`: the v2 marketing card's "Step N of 3" with three bars (follows `step`; needs
 * `marketing/v2/auth/auth.css`).
 */
export function SignupStepProgress({
  step,
  activeIndex: activeIndexProp,
  emailVerifiedNewUser = false,
  variant = 'kineticDark',
  className,
  'aria-label': ariaLabel = 'Sign up progress',
}: {
  step: SignupStepKey
  /** When set, overrides index from `computeSignupProgressIndex(step, emailVerifiedNewUser)`. */
  activeIndex?: number
  /** Used with `step` when `activeIndex` is omitted (stacked onboarding). */
  emailVerifiedNewUser?: boolean
  variant?: SignupStepProgressVariant
  className?: string
  'aria-label'?: string
}) {
  if (variant === 'mk') {
    const current = signupMkStepNumber(step)
    return (
      <div className={cn('mk-auth-progress', className)}>
        {/* Keyed so the label fades when the step changes. */}
        <span key={current} className="mk-auth-progress-label mk-auth-fade" aria-hidden>
          Step {current} of {MK_STEPS}
        </span>
        <span
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={MK_STEPS}
          aria-valuenow={current}
          aria-valuetext={`Step ${current} of ${MK_STEPS}`}
          aria-label={ariaLabel}
          className="mk-auth-progress-bars"
        >
          {Array.from({ length: MK_STEPS }).map((_, i) => (
            <span key={i} data-on={i < current || undefined} />
          ))}
        </span>
      </div>
    )
  }

  const active =
    activeIndexProp !== undefined
      ? activeIndexProp
      : computeSignupProgressIndex(step, emailVerifiedNewUser)
  const isComplete = active >= STEPS
  const safe = Math.min(Math.max(active, 0), STEPS - 1)
  const isLight = variant === 'light'

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={STEPS}
      aria-valuenow={isComplete ? STEPS : safe + 1}
      aria-label={ariaLabel}
      className={cn('flex items-center gap-1.5 justify-center sm:gap-2', className)}
    >
      {Array.from({ length: STEPS }).map((_, i) => {
        const on = isComplete || i <= safe
        return (
          <span
            key={i}
            className={cn(
              'rounded-full transition-all duration-300 ease-out',
              isLight
                ? on
                  ? 'h-1.5 w-9 bg-[#72ff70]'
                  : 'h-1 w-9 bg-[#e4e2e3]'
                : on
                  ? 'h-1.5 w-9 bg-[#00FF41]'
                  : 'h-1.5 w-9 bg-[#2d3748]',
            )}
            aria-hidden
          />
        )
      })}
    </div>
  )
}
