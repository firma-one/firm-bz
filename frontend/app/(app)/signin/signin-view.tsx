'use client'

import { useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import { BRAND_NAME } from '@/config/brand'
import { KineticFloatingEmailField } from '@/components/signup/kinetic-floating-email-field'
import { OTPInput, type OTPInputHandle } from '@/components/signup/otp-input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import { AuthShell } from '@/components/marketing/v2/auth/auth-shell'
import {
  AuthAlert,
  AuthBack,
  AuthChevron,
  AuthDivider,
  AuthFieldCheck,
  AuthNote,
  GoogleMark,
  MicrosoftMark,
} from '@/components/marketing/v2/auth/auth-ui'
import { enabledOAuthProviders, OAUTH_PROVIDER_LABEL, signInMethodsHint } from '@/lib/auth/oauth-providers'
import { useSignInFlow } from './use-sign-in-flow'

/** Turnstile on the white card: light theme, full card width (min 300 px per Cloudflare). */
const TURNSTILE_OPTIONS = { theme: 'light', size: 'flexible' } as const

const PROVIDER_MARK = { google: <GoogleMark />, microsoft: <MicrosoftMark /> }

/**
 * Sign-in on the v2 marketing system (SignIn / SignInPhone boards): the card is the hero, with the
 * silk ribbon sweeping past it. The flow (email check, Turnstile, code, Google / Microsoft, redirects)
 * lives in `useSignInFlow`; this file is presentation only.
 */
export function SigninView({ microsoftSignInEnabled = false }: { microsoftSignInEnabled?: boolean } = {}) {
  const otpInputRef = useRef<OTPInputHandle>(null)
  const emailTurnstileRef = useRef<TurnstileInstance>(undefined)
  const otpTurnstileRef = useRef<TurnstileInstance>(undefined)
  const emailTurnstileErrorCount = useRef(0)
  const otpTurnstileErrorCount = useRef(0)
  const {
    step,
    email,
    setEmail,
    otpCode,
    setOtpCode,
    loading,
    checkLoading,
    googleLoading,
    microsoftLoading,
    error,
    setError,
    noAccountMessage,
    emailVerified,
    turnstileToken,
    setTurnstileToken,
    showTurnstile,
    setShowTurnstile,
    stepContentClass,
    animateToStep,
    handleEmailSubmit,
    handleVerifyOTP,
    handleInitiateCheck,
    handleTurnstileSuccess,
  } = useSignInFlow()

  const canChooseMethod = !noAccountMessage && emailVerified
  const providers = enabledOAuthProviders(microsoftSignInEnabled)
  const providerLoading = { google: googleLoading, microsoft: microsoftLoading }

  return (
    <AuthShell
      kind="signin"
      cardFooter={
        <>
          New to {BRAND_NAME}? <Link href="/signup">Create account</Link>
        </>
      }
    >
      {step === 'email' && (
        <div
          className={`mk-auth-step ${stepContentClass}`}
          // Returning from the code step, the email step slides in from the left.
          style={{ '--mk-auth-step-from': '-18px' } as CSSProperties}
        >
          <h1 className="mk-auth-title">Sign in to your account</h1>

          <div className="mt-[30px]">
            <KineticFloatingEmailField
              variant="mk"
              id="signin-email"
              label="Work email"
              placeholder="you@example.com"
              hint={signInMethodsHint(providers)}
              value={email}
              onValueChange={setEmail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !emailVerified) handleInitiateCheck()
              }}
              autoFocus
              endAdornment={<AuthFieldCheck on={emailVerified} />}
            />
          </div>

          {noAccountMessage && (
            <AuthNote>
              {noAccountMessage}{' '}
              <Link href={`/signup${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`}>Sign up</Link>
            </AuthNote>
          )}

          {showTurnstile && (
            <div className="mk-auth-turnstile">
              <Turnstile
                ref={emailTurnstileRef}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                options={TURNSTILE_OPTIONS}
                onSuccess={(token) => {
                  emailTurnstileErrorCount.current = 0
                  handleTurnstileSuccess(token)
                }}
                onError={() => {
                  emailTurnstileErrorCount.current += 1
                  if (emailTurnstileErrorCount.current > 1) {
                    setError('Captcha verification failed. Retrying…')
                  }
                  setTurnstileToken(null)
                  emailTurnstileRef.current?.reset()
                }}
                onExpire={() => {
                  setTurnstileToken(null)
                  emailTurnstileRef.current?.reset()
                }}
              />
            </div>
          )}

          {error && <AuthAlert>{error}</AuthAlert>}

          {canChooseMethod ? (
            // Once the email is confirmed: send a code, or continue with Google / Microsoft.
            <div className="mk-auth-reveal">
              <button
                type="button"
                onClick={() => handleEmailSubmit('otp')}
                disabled={!emailVerified || loading || googleLoading || (showTurnstile && !turnstileToken)}
                aria-busy={loading || undefined}
                className="mk-btn mk-btn--primary mk-auth-btn mt-6"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    Sending code…
                  </>
                ) : (
                  <>
                    Send me a code
                    <AuthChevron />
                  </>
                )}
              </button>

              {providers.length > 0 && <AuthDivider>Or sign in with</AuthDivider>}

              {/* The same list the hint above is written from. */}
              {providers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleEmailSubmit(p)}
                  disabled={!emailVerified || loading || providerLoading[p]}
                  aria-busy={providerLoading[p] || undefined}
                  className="mk-auth-oauth"
                >
                  {providerLoading[p] ? <LoadingSpinner size="sm" /> : PROVIDER_MARK[p]}
                  {providerLoading[p] ? 'Signing in…' : OAUTH_PROVIDER_LABEL[p]}
                </button>
              ))}
            </div>
          ) : (
            // Before that: confirm the email (Turnstile, then the account check).
            <button
              type="button"
              onClick={handleInitiateCheck}
              disabled={checkLoading || !email.trim()}
              aria-busy={checkLoading || undefined}
              className="mk-btn mk-btn--primary mk-auth-btn mt-6"
            >
              {checkLoading && <LoadingSpinner size="sm" />}
              Continue
              {!checkLoading && <AuthChevron />}
            </button>
          )}
        </div>
      )}

      {step === 'otp-verify' && (
        <div className={`mk-auth-step ${stepContentClass}`} style={{ '--mk-auth-step-from': '18px' } as CSSProperties}>
          <AuthBack onClick={() => animateToStep('email')} />
          <h1 className="mk-auth-title">Check your email</h1>
          <p className="mk-auth-lede">
            Enter the 6-digit code we sent to <strong>{email}</strong>.
          </p>

          <div className="mt-7">
            <OTPInput
              ref={otpInputRef}
              value={otpCode}
              onChange={setOtpCode}
              onComplete={(code) => handleVerifyOTP(code)}
              disabled={loading}
              loading={loading}
              variant="mk"
            />
          </div>

          {error && <AuthAlert>{error}</AuthAlert>}

          <button
            type="button"
            onClick={() => handleVerifyOTP()}
            disabled={loading || otpCode.length !== 6}
            aria-busy={loading || undefined}
            className="mk-btn mk-btn--primary mk-auth-btn mt-6"
          >
            {loading ? (
              <>
                <LoadingSpinner size="sm" />
                Verifying…
              </>
            ) : (
              'Verify code'
            )}
          </button>

          <p className="mk-auth-resend">
            Didn’t get it?{' '}
            <button
              type="button"
              onClick={() => {
                setOtpCode('')
                setTurnstileToken(null)
                setShowTurnstile(true)
                setTimeout(() => otpInputRef.current?.focus(), 0)
              }}
              disabled={loading}
              className="mk-auth-text-btn"
            >
              Resend code
            </button>
          </p>

          {showTurnstile && step === 'otp-verify' && (
            <div className="mk-auth-turnstile">
              <Turnstile
                ref={otpTurnstileRef}
                siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                options={TURNSTILE_OPTIONS}
                onSuccess={(token) => {
                  otpTurnstileErrorCount.current = 0
                  handleTurnstileSuccess(token)
                }}
                onError={() => {
                  otpTurnstileErrorCount.current += 1
                  if (otpTurnstileErrorCount.current > 1) {
                    setError('Captcha verification failed. Retrying…')
                  }
                  setTurnstileToken(null)
                  otpTurnstileRef.current?.reset()
                }}
                onExpire={() => {
                  setTurnstileToken(null)
                  otpTurnstileRef.current?.reset()
                }}
              />
            </div>
          )}
        </div>
      )}
    </AuthShell>
  )
}
