'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AuthService } from '@/lib/auth-service'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { checkEmailExists, sendOTPWithTurnstile } from '@/app/actions/send-otp'
import { sendEvent, ANALYTICS_EVENTS } from '@/lib/analytics'
import { resolvePostAuthTarget, AUTO_RESOLVE_TARGET } from '@/lib/auth/post-auth-target'

/**
 * The address last *successfully* signed in with on this browser, used to prefill the field.
 *
 * In localStorage, so it outlives the tab — that is the whole point. Written only once a code has
 * verified, never on a keystroke: a prefill of "deepa" is worse than an empty box, because it has
 * to be noticed and corrected every time. Only the address is kept, never the session, so signing
 * in still takes a fresh code.
 */
export const SIGNIN_EMAIL_KEY = 'fm_signin_email'

export type SignInStep = 'email' | 'otp-verify'

function getStoredEmail(): string {
  if (typeof window === 'undefined') return ''
  try {
    return localStorage.getItem(SIGNIN_EMAIL_KEY) || ''
  } catch {
    return ''
  }
}

function rememberEmail(value: string): void {
  try {
    localStorage.setItem(SIGNIN_EMAIL_KEY, value)
  } catch {
    /* ignore — private windows and blocked site data both throw */
  }
}

export function useSignInFlow() {
  const router = useRouter()
  const { signInWithGoogle, signInWithMicrosoft } = useAuth()
  const [step, setStep] = useState<SignInStep>('email')
  const [email, setEmail] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkLoading, setCheckLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [microsoftLoading, setMicrosoftLoading] = useState(false)
  const [error, setError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [showTurnstile, setShowTurnstile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [noAccountMessage, setNoAccountMessage] = useState('')
  const [emailVerified, setEmailVerified] = useState(false)
  const [turnstileAction, setTurnstileAction] = useState<'check' | 'send'>('check')
  const [stepTransition, setStepTransition] = useState<'idle' | 'exiting' | 'entering'>('idle')
  /** True while the field holds a remembered address the viewer has not touched. */
  const [prefilledFromMemory, setPrefilledFromMemory] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        router.push(resolvePostAuthTarget(params))
      }
    }
    checkSession()
  }, [router])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    // `#email=` is preferred over `?email=` by anything that can choose, because a fragment is
    // never sent over HTTP and so never reaches request logs, log drains or Referer headers
    // (see lib/actions/engagement-membership.ts). The query form is still read: Supabase owns
    // the fragment on its own auth redirects, so lib/actions/system-admin-signup.ts cannot use
    // one. Browsers carry a fragment across proxy.ts's 302 to this page (RFC 7231 7.1.2).
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const emailParam = hashParams.get('email') ?? params.get('email')
    if (emailParam) {
      // Not stored: nobody has signed in with this address yet, it just came off the link.
      setEmail(emailParam)
      // Consumed — drop it from the address bar so it is not left to be copied or shared onward.
      if (hashParams.has('email')) {
        hashParams.delete('email')
        const rest = hashParams.toString()
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`)
      }
      return
    }
    const remembered = getStoredEmail()
    if (remembered) {
      setEmail(remembered)
      setPrefilledFromMemory(true)
    }
  }, [])

  useEffect(() => {
    if (!email) return
    setNoAccountMessage('')
    setEmailVerified(false)
    setPrefilledFromMemory((was) => (was && email === getStoredEmail() ? was : false))
  }, [email])

  const animateToStep = useCallback((nextStep: SignInStep) => {
    setStepTransition('exiting')
    setTimeout(() => {
      setStep(nextStep)
      setStepTransition('entering')
      setTimeout(() => setStepTransition('idle'), 300)
    }, 200)
  }, [])

  const handleEmailCheckWithToken = useCallback(
    async (token: string) => {
      setCheckLoading(true)
      setError('')
      setNoAccountMessage('')
      const existsResult = await checkEmailExists(email, token)
      if (!existsResult.success) {
        setError(existsResult.error || 'Failed to verify email')
        setCheckLoading(false)
        setTurnstileToken(null)
        setShowTurnstile(false)
        return
      }
      if (!existsResult.data?.userExists) {
        setNoAccountMessage('No account found for this email.')
        setCheckLoading(false)
        setTurnstileToken(null)
        setShowTurnstile(false)
        return
      }
      setEmailVerified(true)
      setCheckLoading(false)
      setTurnstileToken(null)
      setShowTurnstile(false)
    },
    [email],
  )

  const sendOTPWithToken = useCallback(
    async (token: string) => {
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
      setTurnstileToken(null)
      setShowTurnstile(false)
      animateToStep('otp-verify')
    },
    [email, animateToStep],
  )

  const handleTurnstileSuccess = useCallback(
    (token: string) => {
      setTurnstileToken(token)
      setError('')
      if (turnstileAction === 'check') {
        handleEmailCheckWithToken(token)
      } else {
        sendOTPWithToken(token)
      }
    },
    [turnstileAction, handleEmailCheckWithToken, sendOTPWithToken],
  )

  const handleInitiateCheck = useCallback(() => {
    if (!email.trim()) return
    setTurnstileAction('check')
    setShowTurnstile(true)
  }, [email])

  const handleEmailSubmit = useCallback(
    async (method: 'google' | 'microsoft' | 'otp') => {
      if (!email.trim()) {
        setError('Please enter your email')
        return
      }

      setError('')

      if (method === 'google') {
        setGoogleLoading(true)
        try {
          const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
          const nextParam = params?.get('redirect') || params?.get('next') || undefined
          await signInWithGoogle(email.trim(), nextParam)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to sign in with Google')
          setGoogleLoading(false)
        }
        sendEvent({
          action: ANALYTICS_EVENTS.LOGIN,
          category: 'User',
          label: 'Login Success',
          method: 'google',
        })
      } else if (method === 'microsoft') {
        setMicrosoftLoading(true)
        try {
          const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
          const nextParam = params?.get('redirect') || params?.get('next') || undefined
          await signInWithMicrosoft(email.trim(), nextParam)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to sign in with Microsoft')
          setMicrosoftLoading(false)
        }
        sendEvent({
          action: ANALYTICS_EVENTS.LOGIN,
          category: 'User',
          label: 'Login Success',
          method: 'microsoft',
        })
      } else {
        if (!turnstileToken) {
          setTurnstileAction('send')
          setShowTurnstile(true)
          return
        }
        setLoading(true)
        await sendOTPWithToken(turnstileToken)
      }
    },
    [email, signInWithGoogle, signInWithMicrosoft, turnstileToken, sendOTPWithToken],
  )

  const handleVerifyOTP = useCallback(
    async (codeOverride?: string) => {
      setLoading(true)
      setError('')

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

      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (session) {
        // Signed in for real, so this address is worth prefilling next time.
        rememberEmail(email)
        sendEvent({
          action: ANALYTICS_EVENTS.LOGIN,
          category: 'User',
          label: 'Login Success',
          method: 'otp',
        })
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
        const target = resolvePostAuthTarget(params)

        // The 150ms pause only matters for the auto-resolving target, where `/d` immediately
        // does authenticated server work — give the session cookie a beat to settle first.
        if (target === AUTO_RESOLVE_TARGET) {
          await new Promise((resolve) => setTimeout(resolve, 150))
        }

        window.location.href = target
      } else {
        setError('Failed to establish session')
        setLoading(false)
      }
    },
    [email, otpCode],
  )

  /**
   * Forgets the remembered address and empties the field.
   *
   * The prefill is a convenience on a shared browser as much as a private one, so there has to be
   * a way to drop it without digging through site data.
   */
  const clearRememberedEmail = useCallback(() => {
    try {
      localStorage.removeItem(SIGNIN_EMAIL_KEY)
    } catch {
      /* ignore */
    }
    setEmail('')
    setPrefilledFromMemory(false)
  }, [])

  const stepContentClass =
    stepTransition === 'exiting'
      ? 'opacity-0 translate-y-2 transition-all duration-200'
      : stepTransition === 'entering'
        ? 'opacity-0 translate-y-2 animate-[signinFadeSlideIn_300ms_ease-out_forwards]'
        : ''

  return {
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
    mounted,
    prefilledFromMemory,
    clearRememberedEmail,
    stepContentClass,
    animateToStep,
    sendOTPWithToken,
    handleEmailSubmit,
    handleVerifyOTP,
    handleInitiateCheck,
    handleTurnstileSuccess,
  }
}
