'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { SignupForm } from '@/components/signup/signup-form'
import { SignupStepProgress, type SignupStepKey } from '@/components/signup/signup-step-progress'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { AuthShell } from '@/components/marketing/v2/auth/auth-shell'
import { SignupValuePoints } from '@/components/marketing/v2/auth/signup-value-points'

/**
 * Sign-up on the v2 marketing system (SignUp / SignUpPhone boards): the card is the hero, with
 * "Step N of 3" inside it and the four value points beside it. The flow itself lives in `SignupForm`.
 */
export function SignupView({ microsoftSignInEnabled = false }: { microsoftSignInEnabled?: boolean } = {}) {
  const [step, setStep] = useState<SignupStepKey>('info')

  return (
    <AuthShell
      kind="signup"
      aside={<SignupValuePoints />}
      cardFooter={
        <>
          Already have an account? <Link href="/signin">Sign in</Link>
        </>
      }
    >
      <SignupStepProgress step={step} variant="mk" aria-label="Sign-up progress" />
      <Suspense
        fallback={
          <div className="mk-auth-fallback" role="status" aria-label="Loading">
            <LoadingSpinner size="md" />
          </div>
        }
      >
        <SignupForm layout="mk" onStepChange={setStep} microsoftSignInEnabled={microsoftSignInEnabled} />
      </Suspense>
    </AuthShell>
  )
}
