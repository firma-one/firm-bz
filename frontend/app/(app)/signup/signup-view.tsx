'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { GoogleDriveProductMark } from '@/components/ui/google-drive-icon'
import { SignupForm } from '@/components/signup/signup-form'
import { SignupStepProgress, type SignupStepKey } from '@/components/signup/signup-step-progress'
import { BRAND_NAME } from '@/config/brand'
import { KINETIC_LANDING_HERO_BADGE } from '@/lib/marketing/target-audience-nav'
import { KINETIC_AUTH_HERO_IMAGE } from '@/lib/marketing/kinetic-auth-hero'
import { Bolt, ShieldCheck } from 'lucide-react'

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'

/** Same lead as `KineticHeroSection` — keep in sync with landing kinetic hero. */
const KINETIC_HERO_LEAD =
  'Stop sending raw Drive links. Deliver a white-glove client experience on top of the storage you already trust — non-custodial, with revoke-on-close discipline for your IP.'

export function SignupView() {
  const [step, setStep] = useState<SignupStepKey>('info')
  const [progressIndex, setProgressIndex] = useState(0)

  return (
    <div
      className={`relative min-h-screen w-full max-w-[100vw] overflow-x-hidden overflow-y-hidden bg-[#f0edee] text-[#1b1b1d] selection:bg-[#72ff70]/40 selection:text-[#002203] md:h-[100dvh] md:min-h-0 md:overflow-hidden ${B}`}
    >
      <div
        className="pointer-events-none fixed -bottom-40 -left-40 z-0 h-96 w-96 rounded-full bg-[#72ff70]/5 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-40 -top-40 z-0 h-96 w-96 rounded-full bg-[#dde1ff]/5 blur-[120px]"
        aria-hidden
      />

      <main className="relative z-10 flex min-h-screen w-full min-w-0 max-w-[100vw] flex-col overflow-x-hidden md:h-full md:min-h-0 md:max-h-full md:flex-row md:overflow-hidden">
        {/* Left: kinetic landing–aligned narrative (split ~60/40 at lg) */}
        <section className="relative flex min-h-[48vh] w-full min-w-0 flex-col justify-center bg-[#141c2a] md:h-full md:min-h-0 md:max-h-full md:w-1/2 md:overflow-y-auto md:overflow-x-hidden lg:w-3/5">
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

          <div className="relative z-10 mx-auto flex w-full max-w-xl flex-col px-8 py-16 md:px-14 md:py-20 lg:px-16 lg:py-24">
            <div className="mb-8">
              <span
                className={`inline-block text-xs font-bold uppercase tracking-[0.18em] text-[#72ff70] md:text-sm ${H}`}
              >
                {KINETIC_LANDING_HERO_BADGE}
              </span>
              <h1
                className={`mt-4 text-3xl font-bold leading-[1.05] tracking-tighter text-white sm:text-4xl md:text-5xl lg:text-[2.75rem] xl:text-5xl ${H}`}
              >
                Turn Your{' '}
                <span className="inline-flex items-center gap-1.5 align-bottom sm:gap-2">
                  <GoogleDriveProductMark className="mb-0.5 h-8 w-8 shrink-0 sm:h-9 sm:w-9 md:h-10 md:w-10" />
                  <span className="text-[#5a78ff]">Google Drive</span>
                </span>{' '}
                into a{' '}
                <span className="text-[#72ff70]">Professional Client Portal</span>
              </h1>
            </div>

            <p className={`mb-10 max-w-xl text-sm leading-relaxed text-white/75 md:text-base ${B}`}>
              {KINETIC_HERO_LEAD}
            </p>

            <div className="grid grid-cols-1 gap-6 border-t border-white/10 pt-8 sm:grid-cols-2 sm:gap-8">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#72ff70]" aria-hidden />
                <div>
                  <span className={`block text-xs font-medium uppercase tracking-widest text-white ${H}`}>
                    Non-custodial
                  </span>
                  <span className={`mt-1 block text-sm text-white/60 ${B}`}>Files stay in your Drive.</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Bolt className="mt-0.5 h-5 w-5 shrink-0 text-[#72ff70]" aria-hidden />
                <div>
                  <span className={`block text-xs font-medium uppercase tracking-widest text-white ${H}`}>
                    Delivery you control
                  </span>
                  <span className={`mt-1 block text-sm text-white/60 ${B}`}>
                    Revoke-on-close discipline for your IP.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Right: same shell as /signin — card fills column height (flex-1 + md:h-full) */}
        <section
          className={`flex min-h-0 w-full min-w-0 flex-col justify-center overflow-x-hidden px-5 py-10 md:h-full md:max-h-full md:w-1/2 md:overflow-hidden md:px-10 md:py-12 lg:w-2/5 lg:px-12 ${B}`}
        >
          <div className="mx-auto flex w-full min-w-0 max-w-md flex-col md:h-full md:min-h-0 md:max-h-full">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-black/[0.06] bg-white px-8 py-9 shadow-[0_24px_60px_-16px_rgba(27,27,29,0.14)] sm:px-10 sm:py-11 md:max-h-full">
              {/* Top: logo (left) + separator */}
              <div className="shrink-0">
                <div className="flex justify-start">
                  <Logo size="lg" />
                </div>
                <div className="mt-6 border-b border-black/[0.1]" aria-hidden />
                <SignupStepProgress
                  step={step}
                  activeIndex={progressIndex}
                  variant="light"
                  className="mt-6"
                  aria-label="Sign up steps"
                />
              </div>

              {/* Middle: title + form vertically centered as one block */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center py-8">
                <div className="max-h-full w-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain text-left [scrollbar-gutter:stable]">
                  <div className="w-full min-w-0">
                    <h2 className={`mb-2 text-3xl font-bold tracking-tight text-[#1b1b1d] ${H}`}>Sign up</h2>
                    <p className="text-[15px] leading-relaxed text-[#45474c]">
                      Create your account and start setting up your firm workspace.
                    </p>
                    <div className="mt-8 min-w-0">
                      <Suspense fallback={<div className="py-8 text-[#45474c]">Loading...</div>}>
                        <SignupForm
                          layout="split-light"
                          onStepChange={setStep}
                          onProgressIndexChange={setProgressIndex}
                        />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: separator + account link */}
              <div className="shrink-0 border-t border-black/[0.1] pt-6">
                <p className="text-left text-sm text-[#45474c]">
                  Already have an account?{' '}
                  <Link
                    href="/signin"
                    className={`font-bold text-[#1b1b1d] underline-offset-4 transition-colors hover:text-[#006e16] hover:underline ${H}`}
                  >
                    Sign in
                  </Link>
                </p>
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
