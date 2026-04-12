'use client'

import Link from 'next/link'
import Logo from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { BRAND_NAME } from '@/config/brand'
import { KINETIC_AUTH_HERO_IMAGE } from '@/lib/marketing/kinetic-auth-hero'
import { KINETIC_LANDING_HERO_BADGE } from '@/lib/marketing/target-audience-nav'
import { ArrowLeft, ArrowRight, Lock, Shield } from 'lucide-react'
import { KineticFloatingEmailField } from '@/components/onboarding/kinetic-floating-email-field'
import { OTPInput } from '@/components/onboarding/otp-input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Turnstile } from '@marsidev/react-turnstile'
import { useSignInFlow } from './use-sign-in-flow'

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

const LIME_CTA =
  'group inline-flex h-12 w-full items-center justify-center gap-2 rounded bg-[#72ff70] px-6 text-xs font-bold uppercase tracking-[0.2em] text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 disabled:opacity-50 disabled:translate-y-0 disabled:shadow-none [font-family:var(--font-kinetic-headline),system-ui,sans-serif]'

const OUTLINE_SECONDARY =
  'w-full rounded-md border border-[#c6c6cc]/80 bg-white text-[15px] font-medium text-[#45474c] transition-all hover:border-[#9ea0a8] hover:bg-[#f6f3f4] hover:text-[#1b1b1d] active:scale-[0.98]'

export function SigninView() {
  const {
    step,
    email,
    setEmail,
    otpCode,
    setOtpCode,
    loading,
    googleLoading,
    error,
    setError,
    turnstileToken,
    setTurnstileToken,
    showTurnstile,
    setShowTurnstile,
    mounted,
    stepContentClass,
    animateToStep,
    sendOTPWithToken,
    handleEmailSubmit,
    handleVerifyOTP,
  } = useSignInFlow()

  return (
    <div
      className={`relative min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-[#f0edee] text-[#1b1b1d] selection:bg-[#72ff70]/40 selection:text-[#002203] md:h-[100dvh] md:min-h-0 md:overflow-hidden ${B}`}
    >
      <style>{`
        @keyframes signinFadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="pointer-events-none fixed -bottom-40 -left-40 z-0 h-96 w-96 rounded-full bg-[#72ff70]/5 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-40 -top-40 z-0 h-96 w-96 rounded-full bg-[#dde1ff]/5 blur-[120px]"
        aria-hidden
      />

      <main className="relative z-10 flex min-h-screen w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden md:h-full md:min-h-0 md:max-h-full md:flex-row md:overflow-hidden">
        <section className="relative flex min-h-[42vh] w-full min-w-0 flex-col justify-center bg-[#141c2a] md:h-full md:min-h-0 md:max-h-full md:w-1/2 md:overflow-y-auto md:overflow-x-hidden lg:w-3/5">
          <div className="absolute inset-0 z-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              src={KINETIC_AUTH_HERO_IMAGE}
              className="h-full w-full object-cover opacity-40 mix-blend-luminosity"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#141c2a] via-[#141c2a]/35 to-[#141c2a]/60" />
          </div>

          <Link
            href="/"
            className="group absolute left-8 top-8 z-20 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] md:left-12 md:top-12"
            aria-label={`${BRAND_NAME} home`}
          >
            <span className="inline-block [filter:drop-shadow(0_18px_36px_rgba(0,0,0,0.42))_drop-shadow(0_6px_14px_rgba(0,0,0,0.22))] transition-[filter] duration-200 group-hover:[filter:drop-shadow(0_22px_44px_rgba(0,0,0,0.48))_drop-shadow(0_8px_18px_rgba(0,0,0,0.26))]">
              <span className="inline-flex items-center justify-center rounded-sm bg-white px-6 py-2.5 sm:px-7 sm:py-3">
                <Logo size="md" showText={false} />
              </span>
            </span>
          </Link>

          <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col px-8 py-14 md:px-14 md:py-20 lg:px-16 lg:py-24">
            <div className="mb-6">
              <span
                className={`inline-block text-xs font-bold uppercase tracking-[0.18em] text-[#72ff70] md:text-sm ${H}`}
              >
                {KINETIC_LANDING_HERO_BADGE}
              </span>
              <h1
                className={`mt-4 text-3xl font-bold leading-[1.08] tracking-tighter text-white sm:text-4xl md:text-5xl ${H}`}
              >
                Welcome back
              </h1>
            </div>

            <p className={`mb-8 max-w-xl text-sm leading-relaxed text-white/75 md:text-base ${B}`}>
              Sign in to your account with a one-time code or Google. Your files stay in Drive — we never take custody of
              your documents.
            </p>

            <div className="grid grid-cols-1 gap-5 border-t border-white/10 pt-8 sm:grid-cols-2 sm:gap-8">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[#72ff70]" aria-hidden />
                <div>
                  <span className={`block text-xs font-medium uppercase tracking-widest text-white ${H}`}>
                    Encrypted
                  </span>
                  <span className={`mt-1 block text-sm text-white/60 ${B}`}>Sign-in and session protection.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-[#72ff70]" aria-hidden />
                <div>
                  <span className={`block text-xs font-medium uppercase tracking-widest text-white ${H}`}>
                    No passwords stored
                  </span>
                  <span className={`mt-1 block text-sm text-white/60 ${B}`}>OTP or your identity provider.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className={`flex min-h-0 w-full min-w-0 flex-col justify-center overflow-x-hidden px-5 py-10 md:h-full md:max-h-full md:w-1/2 md:overflow-hidden md:px-10 md:py-12 lg:w-2/5 lg:px-12 ${B}`}
        >
          <div
            className={`mx-auto flex w-full min-w-0 max-w-md flex-col transition-all duration-700 ease-out md:h-full md:min-h-0 md:max-h-full ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-black/[0.06] bg-white px-8 py-9 shadow-[0_24px_60px_-16px_rgba(27,27,29,0.14)] sm:px-10 sm:py-11 md:max-h-full">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain [scrollbar-gutter:stable]">
                <div className="mb-6 shrink-0">
                  <Logo size="lg" />
                  <div className="mt-5 border-b border-black/[0.1]" aria-hidden />
                </div>

                {step === 'email' && (
                  <div className={`min-w-0 space-y-6 ${stepContentClass}`}>
                    <div>
                      <h2 className={`mb-1.5 text-2xl font-bold tracking-tight text-[#1b1b1d] sm:text-3xl ${H}`}>
                        Sign in
                      </h2>
                      <p className="text-[15px] leading-relaxed text-[#45474c]">Enter your work email to continue.</p>
                    </div>

                    <div className="relative min-w-0">
                      <KineticFloatingEmailField
                        id="signin-email"
                        value={email}
                        onValueChange={setEmail}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEmailSubmit('otp')
                        }}
                        autoFocus
                      />
                    </div>

                    {error && (
                      <div
                        className="rounded-md border border-[#ffdad6] bg-[#ffdad6]/40 px-4 py-3 text-sm text-[#93000a]"
                        role="alert"
                      >
                        {error}
                      </div>
                    )}

                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => handleEmailSubmit('otp')}
                        disabled={
                          loading || googleLoading || !email.trim() || (showTurnstile && !turnstileToken)
                        }
                        className={LIME_CTA}
                      >
                        {loading ? (
                          <>
                            <LoadingSpinner size="sm" />
                            <span>Sending code…</span>
                          </>
                        ) : (
                          <>
                            <span>Send Email Code</span>
                            <ArrowRight
                              className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                              strokeWidth={2}
                              aria-hidden
                            />
                          </>
                        )}
                      </button>

                      {showTurnstile && (
                        <div className="flex justify-center">
                          <Turnstile
                            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                            onSuccess={(token) => {
                              setTurnstileToken(token)
                              setError('')
                              sendOTPWithToken(token)
                            }}
                            onError={() => {
                              setError('Captcha verification failed. Please try again.')
                              setTurnstileToken(null)
                            }}
                            onExpire={() => setTurnstileToken(null)}
                          />
                        </div>
                      )}
                    </div>

                    <div className="relative py-1">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-[#e4e2e3]" />
                      </div>
                      <div className="relative flex justify-center">
                        <span
                          className={`bg-white px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#76777d] ${H}`}
                        >
                          or
                        </span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      onClick={() => handleEmailSubmit('google')}
                      disabled={loading || googleLoading}
                      variant="outline"
                      className={`${OUTLINE_SECONDARY} h-12 rounded-md`}
                    >
                      <svg className="mr-2.5 h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      {googleLoading ? 'Signing in…' : 'Continue with Google'}
                    </Button>

                    <p className="pt-1 text-center text-sm text-[#45474c]">
                      Don&apos;t have an account?{' '}
                      <Link
                        href="/signup"
                        className={`font-bold text-[#1b1b1d] underline-offset-4 transition-colors hover:text-[#006e16] hover:underline ${H}`}
                      >
                        Sign up
                      </Link>
                    </p>
                  </div>
                )}

                {step === 'otp-verify' && (
                  <div className={`min-w-0 space-y-6 ${stepContentClass}`}>
                    <button
                      type="button"
                      onClick={() => animateToStep('email')}
                      className={`group flex items-center text-sm text-[#76777d] transition-colors hover:text-[#1b1b1d] ${H}`}
                    >
                      <ArrowLeft className="mr-1 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
                      Back
                    </button>

                    <div>
                      <h2 className={`mb-2 text-xl font-bold tracking-tight text-[#1b1b1d] sm:text-2xl ${H}`}>
                        Check your email
                      </h2>
                      <p className="text-[15px] text-[#45474c]">
                        We sent a 6-digit code to{' '}
                        <strong className="font-semibold text-[#1b1b1d]">{email}</strong>
                      </p>
                    </div>

                    {error && (
                      <div
                        className="rounded-md border border-[#ffdad6] bg-[#ffdad6]/40 px-4 py-3 text-sm text-[#93000a]"
                        role="alert"
                      >
                        {error}
                      </div>
                    )}

                    <OTPInput
                      value={otpCode}
                      onChange={setOtpCode}
                      onComplete={(code) => handleVerifyOTP(code)}
                      disabled={loading}
                      loading={loading}
                    />

                    <button
                      type="button"
                      onClick={() => handleVerifyOTP()}
                      disabled={loading || otpCode.length !== 6}
                      className={LIME_CTA}
                    >
                      {loading ? (
                        <>
                          <LoadingSpinner size="sm" />
                          <span>Verifying…</span>
                        </>
                      ) : (
                        <>
                          <span>Verify code</span>
                          <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        </>
                      )}
                    </button>

                    <div className="space-y-4">
                      <button
                        type="button"
                        onClick={() => {
                          setTurnstileToken(null)
                          setShowTurnstile(true)
                        }}
                        disabled={loading}
                        className={`w-full text-sm font-medium text-[#76777d] transition-colors hover:text-[#1b1b1d] hover:underline ${H}`}
                      >
                        Resend code
                      </button>

                      {showTurnstile && step === 'otp-verify' && (
                        <div className="flex justify-center">
                          <Turnstile
                            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA'}
                            onSuccess={(token) => {
                              setTurnstileToken(token)
                              sendOTPWithToken(token)
                            }}
                            onError={() => {
                              setError('Captcha verification failed. Please try again.')
                              setTurnstileToken(null)
                            }}
                            onExpire={() => setTurnstileToken(null)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <footer className="mt-8 flex flex-col items-center justify-between gap-4 text-[10px] uppercase tracking-widest text-[#45474c]/60 sm:mt-10 sm:flex-row sm:gap-6">
              <div className="flex flex-wrap justify-center gap-6 sm:justify-start">
                <Link href="/privacy" className={`transition-colors hover:text-[#1b1b1d] ${H}`}>
                  Privacy
                </Link>
                <Link href="/terms" className={`transition-colors hover:text-[#1b1b1d] ${H}`}>
                  Terms
                </Link>
                <Link href="/contact" className={`transition-colors hover:text-[#1b1b1d] ${H}`}>
                  Support
                </Link>
              </div>
              <div className={`text-[#45474c]/40 ${H}`}>
                © {new Date().getFullYear()} {BRAND_NAME}.
              </div>
            </footer>
          </div>
        </section>
      </main>
    </div>
  )
}
