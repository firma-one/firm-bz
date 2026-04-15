'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isValidEmail, isGoogleEmail, isPotentiallyGoogleWorkspace, generateDefaultOrgName } from '@/lib/email-utils'
import { AuthService } from '@/lib/auth-service'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip'
import { OTPInput } from '@/components/onboarding/otp-input'
import { KineticFloatingEmailField } from '@/components/onboarding/kinetic-floating-email-field'
import {
    SignupStepProgress,
    computeSignupProgressIndex,
    type SignupStepKey,
} from '@/components/onboarding/signup-step-progress'
import { Turnstile } from '@marsidev/react-turnstile'
import { sendOTPWithTurnstile } from '@/app/actions/send-otp'
import { sendEvent, ANALYTICS_EVENTS } from "@/lib/analytics"
import { logger } from '@/lib/logger'
import { persistCheckoutIntent } from '@/lib/marketing/checkout-intent'

type OnboardingStep = SignupStepKey

const H = '[font-family:var(--font-kinetic-headline),system-ui,sans-serif]'
const B = '[font-family:var(--font-kinetic-body),system-ui,sans-serif]'
const primaryCta =
  'bg-[#72ff70] text-[#002203] hover:bg-[#72ff70] hover:brightness-95 shadow-[0_1px_0_rgba(0,34,3,0.28)] font-bold uppercase tracking-widest transition-all duration-300 hover:shadow-[0_0_20px_rgba(114,255,112,0.3)] active:scale-[0.98]'
const inputDark =
  'border-white/15 bg-[#141c2a]/80 text-slate-100 placeholder:text-slate-500 focus-visible:border-[#72ff70] focus-visible:ring-2 focus-visible:ring-[#72ff70]/35'
const inputLight =
  'rounded-lg border border-[#c6c6cc]/15 bg-white px-4 py-4 text-[#1b1b1d] placeholder:text-[#45474c]/70 focus-visible:outline-none focus-visible:border-black focus-visible:ring-1 focus-visible:ring-black/25 transition-all duration-200'
const labelDark = 'text-slate-300'
const labelLight =
  `${H} block text-[10px] font-bold uppercase tracking-widest text-[#45474c]`

/**
 * Kinetic lime primary — same as `landing-page.tsx` “Build Your Portal” / `pricing` `LANDING_LIME_CTA_CARD`.
 * Google OAuth keeps its own neutral styles.
 */
const kineticLimeCtaBar = `${H} group inline-flex w-full items-center justify-center gap-2 rounded border-0 bg-[#72ff70] px-6 py-3.5 text-xs font-bold uppercase tracking-[0.2em] text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_1px_0_rgba(0,34,3,0.28)]`
/** Compact lime CTA — same system as hero primary, icon-only (signup email row). */
const kineticLimeIconButton = `${H} group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border-0 bg-[#72ff70] text-[#002203] shadow-[0_1px_0_rgba(0,34,3,0.28)] transition-all duration-200 hover:bg-[#72ff70] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,34,3,0.65)] active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_1px_0_rgba(0,34,3,0.28)]`
/** Outline icon-only — pairs with lime on split-light rows (e.g. name step back). */
const kineticOutlineIconButton = `${H} group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[#c6c6cc]/25 bg-white text-[#1b1b1d] shadow-none transition-all duration-200 hover:bg-[#f6f3f4] disabled:pointer-events-none disabled:opacity-50`

/**
 * Split-light: `flexible` keeps the ~65px-tall horizontal bar and scales width to the container
 * (min 300px per Cloudflare). `w-full min-w-0` on parents avoids page horizontal scroll.
 * Avoid `compact` (150×140) — it reads as a square block and adds vertical room on Slide 3.
 */
function turnstileOptions(isSplitLight: boolean) {
    return isSplitLight
        ? ({ size: 'flexible' as const, theme: 'light' as const })
        : ({ theme: 'auto' as const })
}

/** Contain Turnstile + iframe so parents don’t gain a horizontal scrollbar (min-w-0 chain). */
const turnstileShellClass = 'w-full min-w-0 max-w-full overflow-hidden'

/**
 * Parse firstname.lastname from email if it matches the pattern.
 * Returns null if pattern doesn't match.
 */
function parseNameFromEmail(email: string): { firstName: string; lastName: string } | null {
    if (!email || !email.includes('@')) return null
    const localPart = email.split('@')[0]
    // Check for firstname.lastname pattern (exactly one dot)
    const parts = localPart.split('.')
    if (parts.length !== 2) return null
    const [first, last] = parts
    if (!first || !last) return null
    // Capitalize first letter of each name
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    return {
        firstName: capitalize(first),
        lastName: capitalize(last)
    }
}

export type OnboardingFormLayout = 'stacked-dark' | 'split-light'

export interface OnboardingFormProps {
    /** `split-light`: right-column surface from docs/design/v4/signin (light form); progress lives in parent. */
    layout?: OnboardingFormLayout
    /** Sync step to split layout (e.g. left column hero). */
    onStepChange?: (step: SignupStepKey) => void
    /** 0–3 progress index for the right-column indicator (four segments: email → names → auth → OTP). */
    onProgressIndexChange?: (index: number) => void
}

export function OnboardingForm({
    layout = 'stacked-dark',
    onStepChange,
    onProgressIndexChange,
}: OnboardingFormProps) {
    const searchParams = useSearchParams()
    const firstNameInputRef = useRef<HTMLInputElement>(null)
    const emailInputRef = useRef<HTMLInputElement>(null)
    const isSplitLight = layout === 'split-light'

    // Form state
    const [step, setStep] = useState<OnboardingStep>('info')
    const [email, setEmail] = useState(searchParams.get('email') || '')
    const [firstName, setFirstName] = useState('')
    const [lastName, setLastName] = useState('')
    const [otpCode, setOtpCode] = useState('')

    // UI state
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
    const [showTurnstile, setShowTurnstile] = useState(false)
    const [emailVerifiedNewUser, setEmailVerifiedNewUser] = useState(false)
    const [isReturningUser, setIsReturningUser] = useState(false) // User exists, OTP already sent
    const [existingAccountMessage, setExistingAccountMessage] = useState('')

    useEffect(() => {
        onStepChange?.(step)
    }, [step, onStepChange])

    useEffect(() => {
        onProgressIndexChange?.(computeSignupProgressIndex(step, emailVerifiedNewUser))
    }, [step, emailVerifiedNewUser, onProgressIndexChange])

    useEffect(() => {
        const intent = searchParams.get('intent')
        const interval = searchParams.get('interval')
        if (intent === 'standard' && (interval === 'monthly' || interval === 'annual')) {
            persistCheckoutIntent({ plan: 'Standard', interval })
        }
    }, [searchParams])

    // Check if user is already logged in — full navigation so `/d` RSC sees auth cookies (same as post-OTP).
    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session) {
                window.location.href = '/d/onboarding'
            }
        }
        void checkSession()
    }, [])

    // Handle email check via OTP (called after Turnstile success)
    const handleEmailCheckWithOTP = async (token: string) => {
        setLoading(true)
        setError('')
        setExistingAccountMessage('')

        try {
            // Send OTP with checkExistingFirst=true to detect existing users
            const result = await sendOTPWithTurnstile(email, token, true)
            
            if (!result.success) {
                setError(result.error || 'Failed to verify email')
                setLoading(false)
                setTurnstileToken(null)
                setShowTurnstile(false)
                return
            }

            if (result.data?.userExists) {
                setIsReturningUser(false)
                setStep('info')
                setEmailVerifiedNewUser(false)
                setExistingAccountMessage('An account with this email already exists. Please sign in to continue.')
            } else {
                // New user - show name fields
                const parsedName = parseNameFromEmail(email)
                if (parsedName) {
                    setFirstName(parsedName.firstName)
                    setLastName(parsedName.lastName)
                }
                setEmailVerifiedNewUser(true)
                // Focus firstName field after render
                setTimeout(() => {
                    firstNameInputRef.current?.focus()
                }, 100)
            }
        } catch (err) {
            logger.error('Email check failed', err as Error)
            setError('Something went wrong. Please try again.')
        }

        setLoading(false)
        setTurnstileToken(null)
        setShowTurnstile(false)
    }

    /** Return from name step to edit email (slide 2 → slide 1). */
    const handleBackToEmail = () => {
        if (searchParams.get('email')) return
        setEmailVerifiedNewUser(false)
        setExistingAccountMessage('')
        setShowTurnstile(false)
        setTurnstileToken(null)
        setError('')
        setTimeout(() => emailInputRef.current?.focus(), 0)
    }

    /** Return from auth method to name step (slide 3 → slide 2). */
    const handleBackToNames = () => {
        setStep('info')
        setError('')
        setShowTurnstile(false)
        setTurnstileToken(null)
        setTimeout(() => firstNameInputRef.current?.focus(), 0)
    }

    // Step 1: Collect user info
    const handleInfoSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setExistingAccountMessage('')

        if (!email) {
            setError('Please enter your email')
            return
        }
        if (!isValidEmail(email)) {
            setError('Please enter a valid email address')
            return
        }

        // If name fields are already shown, validate and proceed to auth method
        if (emailVerifiedNewUser) {
            if (!firstName?.trim() || !lastName?.trim()) {
                setError('Please enter your first and last name')
                return
            }
            setStep('auth-method')
            return
        }

        // First submission: show Turnstile to verify human before checking email
        if (!turnstileToken) {
            setShowTurnstile(true)
            return
        }

        // Turnstile already verified, proceed with email check
        await handleEmailCheckWithOTP(turnstileToken)
    }

    // Step 2a: Google OAuth
    const handleGoogleSignIn = async () => {
        setLoading(true)
        setError('')

        const result = await AuthService.signInWithGoogle({
            email,
            firstName,
            lastName
        }, searchParams.get('next'))

        if (!result.success) {
            setError(result.error || 'Failed to sign in with Google')
            setLoading(false)
            return
        }

        // Redirect will happen automatically
        sendEvent({
            action: ANALYTICS_EVENTS.SIGN_UP,
            category: 'User',
            label: 'Signup Success',
            method: 'google'
        })
    }

    // Send OTP using a Turnstile token (used by button and by Turnstile onSuccess to avoid double-click)
    const sendOTPWithToken = async (token: string) => {
        setLoading(true)
        setError('')
        const result = await sendOTPWithTurnstile(email, token)
        if (!result.success) {
            setError(result.error || 'Failed to send verification code')
            setLoading(false)
            setTurnstileToken(null)
            setShowTurnstile(false)
            return
        }
        setLoading(false)
        setStep('otp-verify')
        setTurnstileToken(null)
        setShowTurnstile(false)
    }

    // Step 2b: Send OTP with Turnstile protection
    const handleSendOTP = async () => {
        if (!turnstileToken) {
            setShowTurnstile(true)
            return
        }
        await sendOTPWithToken(turnstileToken)
    }

    // Step 3: Verify OTP and create firm
    const handleVerifyOTP = async (codeOverride?: string) => {
        setLoading(true)
        setError('')

        // Use override code if provided (from onComplete), otherwise use state
        const codeToVerify = (codeOverride || otpCode).trim()

        if (codeToVerify.length !== 6) {
            setError('Please enter the 6-digit code')
            setLoading(false)
            return
        }

        const result = await AuthService.verifyOTP(email, codeToVerify)

        if (!result.success) {
            setError(result.error || 'Invalid verification code')
            setLoading(false)
            return
        }

        // OTP verified successfully — persist display name so profile menu shows "First Last" (not email prefix).
        const fn = firstName.trim()
        const ln = lastName.trim()
        if (fn && ln) {
            const fullName = `${fn} ${ln}`
            const { error: metaErr } = await supabase.auth.updateUser({
                data: {
                    first_name: fn,
                    last_name: ln,
                    full_name: fullName,
                    name: fullName,
                },
            })
            if (metaErr) {
                logger.warn('Failed to persist name to auth metadata after signup', metaErr)
            }
        }

        // Clear onboarding data
        AuthService.clearOnboardingData()

        const {
            data: { session },
        } = await supabase.auth.getSession()
        if (!session) {
            setError('Failed to establish session')
            setLoading(false)
            return
        }

        sendEvent({
            action: ANALYTICS_EVENTS.SIGN_UP,
            category: 'User',
            label: 'Signup Success',
            method: 'email'
        })

        const nextRel = searchParams.get('next') || searchParams.get('redirect')
        const isSafeRedirect = nextRel && nextRel.startsWith('/')
        if (isSafeRedirect && nextRel) {
            const normalized =
                nextRel === '/dash' || nextRel.startsWith('/dash/')
                    ? '/d' + (nextRel === '/dash' ? '' : nextRel.slice(5))
                    : nextRel
            window.location.href = normalized
            return
        }

        await new Promise((resolve) => setTimeout(resolve, 150))

        try {
            const response = await fetch('/api/firms/default-slug', { cache: 'no-store' })
            if (response.ok) {
                const data = await response.json()
                if (data.slug && data.onboardingComplete) {
                    window.location.href = `/d/f/${data.slug}`
                    return
                }
            }
        } catch {
            /* fall through to onboarding */
        }

        window.location.href = '/d/onboarding'
    }

    const inputClass = isSplitLight ? inputLight : inputDark
    const labelClass = isSplitLight ? labelLight : labelDark
    const signinHref = email.trim() ? `/signin?email=${encodeURIComponent(email.trim())}` : '/signin'

    return (
        <div
            className={`w-full min-w-0 overflow-x-hidden ${isSplitLight ? 'max-w-none mx-0' : 'max-w-md mx-auto'} ${B}`}
        >
            {!isSplitLight && (
                <SignupStepProgress
                    step={step}
                    emailVerifiedNewUser={emailVerifiedNewUser}
                    className="mb-8"
                />
            )}

            {/* Error message */}
            {error && (
                <div
                    className={
                        isSplitLight
                            ? 'mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-in fade-in slide-in-from-top-2'
                            : 'mb-4 rounded-md border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200 animate-in fade-in slide-in-from-top-2'
                    }
                >
                    {error}
                </div>
            )}

            {/* Step 1: User Info — email only first; after we confirm email is new, show name */}
            {step === 'info' && (
                <form onSubmit={handleInfoSubmit} className="space-y-4">
                    <div>
                        {!isSplitLight && (
                            <Label htmlFor="email" className={labelClass}>
                                Email
                            </Label>
                        )}
                        {isSplitLight ? (
                            <div className="mt-0">
                                <KineticFloatingEmailField
                                    ref={emailInputRef}
                                    id="email"
                                    value={email}
                                    onValueChange={setEmail}
                                    disabled={!!searchParams.get('email') || emailVerifiedNewUser}
                                    required
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !emailVerifiedNewUser) {
                                            e.preventDefault()
                                            void handleInfoSubmit(e as unknown as React.FormEvent<Element>)
                                        }
                                    }}
                                    trailing={
                                        !emailVerifiedNewUser ? (
                                            <Button
                                                type="submit"
                                                variant="ghost"
                                                size="icon"
                                                disabled={loading || !email.trim()}
                                                className={kineticLimeIconButton}
                                                aria-label="Continue"
                                            >
                                                {loading ? (
                                                    <LoadingSpinner size="sm" />
                                                ) : (
                                                    <ArrowRight
                                                        className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                                                        strokeWidth={2}
                                                    />
                                                )}
                                            </Button>
                                        ) : undefined
                                    }
                                />
                                {!emailVerifiedNewUser && (
                                    <p className="mt-1.5 text-xs text-[#45474c]">
                                        We&apos;ll check if you already have an account.
                                    </p>
                                )}
                                {existingAccountMessage && (
                                    <p className="mt-2 text-xs text-[#8a2b2b]">
                                        {existingAccountMessage}{' '}
                                        <Link href={signinHref} className="font-semibold underline underline-offset-2 hover:text-[#5f1f1f]">
                                            Go to sign in
                                        </Link>
                                    </p>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="mt-1 flex gap-2">
                                    <Input
                                        ref={emailInputRef}
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !emailVerifiedNewUser) {
                                                e.preventDefault()
                                                handleInfoSubmit(e)
                                            }
                                        }}
                                        placeholder="you@example.com"
                                        required
                                        disabled={!!searchParams.get('email') || emailVerifiedNewUser}
                                        className={`flex-1 ${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                                    />
                                    {!emailVerifiedNewUser && (
                                        <Button
                                            type="submit"
                                            variant="default"
                                            size="icon"
                                            disabled={loading || !email.trim()}
                                            className={`h-10 w-10 shrink-0 rounded-md ${primaryCta} ${H}`}
                                        >
                                            {loading ? (
                                                <LoadingSpinner size="sm" />
                                            ) : (
                                                <ArrowRight className="h-4 w-4" />
                                            )}
                                        </Button>
                                    )}
                                </div>
                                {!emailVerifiedNewUser && (
                                    <p className="mt-1.5 text-xs text-slate-500">
                                        We&apos;ll check if you already have an account.
                                    </p>
                                )}
                                {existingAccountMessage && (
                                    <p className="mt-2 text-xs text-red-300">
                                        {existingAccountMessage}{' '}
                                        <Link href={signinHref} className="font-semibold underline underline-offset-2 hover:text-red-200">
                                            Go to sign in
                                        </Link>
                                    </p>
                                )}
                            </>
                        )}
                        
                        {/* Turnstile - shown after email submitted, before check */}
                        {showTurnstile && step === 'info' && !emailVerifiedNewUser && (
                            <div className={`mt-4 ${turnstileShellClass}`}>
                                <div
                                    className={
                                        isSplitLight
                                            ? 'w-full min-w-0'
                                            : 'flex w-full min-w-0 justify-center'
                                    }
                                >
                                    <Turnstile
                                        className={isSplitLight ? 'min-w-0 w-full' : 'min-w-0'}
                                        siteKey={
                                            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
                                            '1x00000000000000000000AA'
                                        }
                                        options={turnstileOptions(isSplitLight)}
                                        onSuccess={(token) => {
                                            setTurnstileToken(token)
                                            // Auto-trigger email check after Turnstile success
                                            handleEmailCheckWithOTP(token)
                                        }}
                                        onError={() => {
                                            setError('Captcha verification failed. Please try again.')
                                            setTurnstileToken(null)
                                            setShowTurnstile(false)
                                        }}
                                        onExpire={() => {
                                            setTurnstileToken(null)
                                            setShowTurnstile(false)
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    {emailVerifiedNewUser && isSplitLight && (
                        <TooltipProvider delayDuration={300}>
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-200">
                                {/* Match input row: [back w-10] [first] [last] [next w-10] so label columns == input width */}
                                <div className="flex gap-2">
                                    {!searchParams.get('email') && (
                                        <div className="w-10 shrink-0" aria-hidden />
                                    )}
                                    <div className="min-w-0 flex-1 text-center">
                                        <Label htmlFor="firstName" className={`${labelClass} inline-block`}>
                                            First Name
                                        </Label>
                                    </div>
                                    <div className="min-w-0 flex-1 text-center">
                                        <Label htmlFor="lastName" className={`${labelClass} inline-block`}>
                                            Last Name
                                        </Label>
                                    </div>
                                    <div className="w-10 shrink-0" aria-hidden />
                                </div>
                                <div className="mt-1.5 flex min-w-0 items-center gap-2">
                                    {!searchParams.get('email') && (
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={handleBackToEmail}
                                                    className={kineticOutlineIconButton}
                                                    aria-label="Edit email"
                                                >
                                                    <ArrowLeft
                                                        className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
                                                        strokeWidth={2}
                                                    />
                                                </Button>
                                            </TooltipTrigger>
                                            <TooltipContent variant="light" side="top">
                                                Edit email
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                    <Input
                                        ref={firstNameInputRef}
                                        id="firstName"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="John"
                                        required
                                        className={`min-w-0 flex-1 ${inputClass}`}
                                    />
                                    <Input
                                        id="lastName"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Doe"
                                        required
                                        className={`min-w-0 flex-1 ${inputClass}`}
                                    />
                                    <Button
                                        type="submit"
                                        variant="ghost"
                                        size="icon"
                                        disabled={
                                            loading || !firstName?.trim() || !lastName?.trim()
                                        }
                                        className={kineticLimeIconButton}
                                        aria-label="Continue"
                                    >
                                        {loading ? (
                                            <LoadingSpinner size="sm" />
                                        ) : (
                                            <ArrowRight
                                                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                                                strokeWidth={2}
                                            />
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </TooltipProvider>
                    )}
                    {emailVerifiedNewUser && !isSplitLight && (
                        <>
                            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                <div>
                                    <Label htmlFor="firstName" className={labelClass}>
                                        First Name
                                    </Label>
                                    <Input
                                        ref={firstNameInputRef}
                                        id="firstName"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="John"
                                        required
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="lastName" className={labelClass}>
                                        Last Name
                                    </Label>
                                    <Input
                                        id="lastName"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Doe"
                                        required
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3">
                                {!searchParams.get('email') && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={handleBackToEmail}
                                        className={`flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-white/20 bg-transparent py-5 text-[15px] font-bold uppercase tracking-widest text-slate-200 shadow-none transition-all hover:bg-white/5 ${H}`}
                                    >
                                        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                                        Back
                                    </Button>
                                )}
                                <Button
                                    type="submit"
                                    variant="default"
                                    disabled={
                                        loading || !firstName?.trim() || !lastName?.trim()
                                    }
                                    className={`inline-flex items-center justify-center gap-2 py-5 text-[15px] transition-all ${primaryCta} ${H} rounded-md ${
                                        searchParams.get('email') ? 'w-full' : 'flex-1'
                                    }`}
                                >
                                    {loading ? (
                                        <LoadingSpinner size="sm" />
                                    ) : (
                                        <>
                                            Next
                                            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </form>
            )}

            {/* Step 2: Auth Method Selection */}
            {step === 'auth-method' && (
                <div className="space-y-6">
                    <div className={isSplitLight ? 'text-left' : 'text-center'}>
                        <h2
                            className={`mb-2 text-xl font-bold tracking-tight ${H} ${
                                isSplitLight ? 'text-[#1b1b1d]' : 'text-white'
                            }`}
                        >
                            Choose authentication method
                        </h2>
                        <p className={`text-sm ${isSplitLight ? 'text-[#45474c]' : 'text-slate-400'}`}>
                            How would you like to sign in?
                        </p>
                    </div>

                    {/* Error shown once by the global error block above */}

                    {/* Email OTP — Back / Next */}
                    <div className="space-y-4">
                        <div
                            className={
                                isSplitLight
                                    ? 'flex w-full min-w-0 items-stretch gap-2'
                                    : 'flex gap-3'
                            }
                        >
                            <Button
                                type="button"
                                variant={isSplitLight ? 'ghost' : 'outline'}
                                size={isSplitLight ? 'icon' : undefined}
                                onClick={handleBackToNames}
                                disabled={loading}
                                className={
                                    isSplitLight
                                        ? `${kineticOutlineIconButton} shrink-0`
                                        : `flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-white/20 bg-transparent py-5 text-[15px] font-bold uppercase tracking-widest text-slate-200 shadow-none transition-all hover:bg-white/5 ${H}`
                                }
                            >
                                {isSplitLight ? (
                                    <ArrowLeft
                                        className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5"
                                        strokeWidth={2}
                                    />
                                ) : (
                                    <>
                                        <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                                        Back
                                    </>
                                )}
                            </Button>
                            <Button
                                type="button"
                                variant={isSplitLight ? 'ghost' : 'default'}
                                onClick={handleSendOTP}
                                disabled={loading || (showTurnstile && !turnstileToken)}
                                className={
                                    isSplitLight
                                        ? `${kineticLimeCtaBar} min-w-0 flex-1 !w-auto`
                                        : `inline-flex flex-1 items-center justify-center gap-2 py-5 text-[15px] ${primaryCta} ${H} rounded-md`
                                }
                            >
                                {loading ? (
                                    <LoadingSpinner size="sm" />
                                ) : isSplitLight ? (
                                    <>
                                        Send Email Code
                                        <ArrowRight
                                            className="h-5 w-5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                            strokeWidth={2}
                                            aria-hidden
                                        />
                                    </>
                                ) : (
                                    <>
                                        Next
                                        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                                    </>
                                )}
                            </Button>
                        </div>

                        {/* Turnstile - Only shown when email OTP is clicked */}
                        {showTurnstile && (
                            <div className={turnstileShellClass}>
                                <div
                                    className={
                                        isSplitLight
                                            ? 'w-full min-w-0'
                                            : 'flex w-full min-w-0 justify-center'
                                    }
                                >
                                    <Turnstile
                                        className={isSplitLight ? 'min-w-0 w-full' : 'min-w-0'}
                                        siteKey={
                                            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
                                            '1x00000000000000000000AA'
                                        }
                                        options={turnstileOptions(isSplitLight)}
                                        onSuccess={(token) => {
                                            setTurnstileToken(token)
                                            setError('')
                                            sendOTPWithToken(token)
                                        }}
                                        onError={() => {
                                            setError('Captcha verification failed. Please try again.')
                                            setTurnstileToken(null)
                                        }}
                                        onExpire={() => {
                                            setTurnstileToken(null)
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Divider - Show only if Google option is visible */}
                    {(isGoogleEmail(email) || isPotentiallyGoogleWorkspace(email)) && (
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div
                                    className={`w-full border-t ${isSplitLight ? 'border-[#eae7e9]' : 'border-white/10'}`}
                                />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className={`px-2 ${isSplitLight ? 'bg-[#fcf8fa] text-[#45474c]' : 'bg-[#141c2a] text-slate-500'}`}>
                                    or
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Google OAuth - Show for Google emails or potential workspace emails */}
                    {(isGoogleEmail(email) || isPotentiallyGoogleWorkspace(email)) && (
                        <Button
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            variant="outline"
                            className={
                                isSplitLight
                                    ? `w-full rounded border border-[#c6c6cc]/10 bg-[#f6f3f4] py-4 text-xs font-bold uppercase tracking-wider text-[#1b1b1d] hover:bg-[#f0edee] ${H}`
                                    : `w-full rounded-md border border-white/15 bg-[#141c2a]/60 py-5 text-[15px] text-slate-200 hover:bg-[#141c2a] hover:text-white ${H}`
                            }
                        >
                            {loading ? (
                                <LoadingSpinner size="sm" />
                            ) : (
                                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                </svg>
                            )}
                            Continue with Google
                        </Button>
                    )}
                </div>
            )}

            {/* Step 3: OTP Verification */}
            {step === 'otp-verify' && (
                <div className="space-y-6">
                    <div className={isSplitLight ? 'text-left' : 'text-center'}>
                        {isReturningUser ? (
                            <>
                                <h2
                                    className={`mb-2 text-xl font-bold tracking-tight ${H} ${
                                        isSplitLight ? 'text-[#1b1b1d]' : 'text-white'
                                    }`}
                                >
                                    Welcome back!
                                </h2>
                                <p className={`text-sm ${isSplitLight ? 'text-[#45474c]' : 'text-slate-400'}`}>
                                    We found your account. Enter the code sent to{' '}
                                    <strong
                                        className={`font-medium ${isSplitLight ? 'text-[#1b1b1d]' : 'text-slate-200'}`}
                                    >
                                        {email}
                                    </strong>
                                </p>
                            </>
                        ) : (
                            <>
                                <h2
                                    className={`mb-2 text-xl font-bold tracking-tight ${H} ${
                                        isSplitLight ? 'text-[#1b1b1d]' : 'text-white'
                                    }`}
                                >
                                    Check your email
                                </h2>
                                <p className={`text-sm ${isSplitLight ? 'text-[#45474c]' : 'text-slate-400'}`}>
                                    We sent a 6-digit code to{' '}
                                    <strong
                                        className={`font-medium ${isSplitLight ? 'text-[#1b1b1d]' : 'text-slate-200'}`}
                                    >
                                        {email}
                                    </strong>
                                </p>
                            </>
                        )}
                    </div>

                    <OTPInput
                        value={otpCode}
                        onChange={setOtpCode}
                        onComplete={(code) => handleVerifyOTP(code)}
                        disabled={loading}
                        loading={loading}
                        variant={isSplitLight ? 'light' : 'dark'}
                        slotsJustify={isSplitLight ? 'start' : 'center'}
                    />

                    <Button
                        variant={isSplitLight ? 'ghost' : 'default'}
                        onClick={() => handleVerifyOTP()}
                        disabled={loading || otpCode.length !== 6}
                        className={
                            isSplitLight
                                ? kineticLimeCtaBar
                                : `w-full py-5 text-[15px] transition-all ${primaryCta} ${H} rounded-md`
                        }
                    >
                        {loading ? (
                            isSplitLight ? (
                                <LoadingSpinner size="sm" />
                            ) : (
                                <>
                                    <LoadingSpinner size="sm" />
                                    Verifying...
                                </>
                            )
                        ) : (
                            <>
                                <Check className="h-5 w-5 shrink-0" strokeWidth={2} />
                                Verify Code
                            </>
                        )}
                    </Button>

                    <div className={`space-y-4 ${isSplitLight ? 'text-left' : 'text-center'}`}>
                        <button
                            onClick={() => {
                                setTurnstileToken(null)
                                setShowTurnstile(true)
                            }}
                            disabled={loading}
                            className={`text-sm font-medium transition-colors hover:underline ${
                                isSplitLight
                                    ? 'text-[#45474c] hover:text-[#006e16]'
                                    : 'text-slate-400 hover:text-[#72ff70]'
                            }`}
                        >
                            Resend code
                        </button>

                        {/* Turnstile for resend */}
                        {showTurnstile && step === 'otp-verify' && (
                            <div className={turnstileShellClass}>
                                <div
                                    className={
                                        isSplitLight
                                            ? 'w-full min-w-0'
                                            : 'flex w-full min-w-0 justify-center'
                                    }
                                >
                                    <Turnstile
                                        className={isSplitLight ? 'min-w-0 w-full' : 'min-w-0'}
                                        siteKey={
                                            process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ||
                                            '1x00000000000000000000AA'
                                        }
                                        options={turnstileOptions(isSplitLight)}
                                        onSuccess={(token) => {
                                            setTurnstileToken(token)
                                            // Auto-trigger resend after Turnstile success
                                            handleSendOTP()
                                        }}
                                        onError={() => {
                                            setError('Captcha verification failed. Please try again.')
                                            setTurnstileToken(null)
                                        }}
                                        onExpire={() => {
                                            setTurnstileToken(null)
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
