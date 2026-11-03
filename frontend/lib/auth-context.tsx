"use client"

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { getOAuthRedirectOrigin } from './config'
import { logger } from './logger'
import { buildUserSettingsPlus } from './actions/user-settings'
import { clearCheckoutHintSessionKeys } from './marketing/checkout-hint-session'

/** Cooldown (ms) to avoid calling buildUserSettingsPlus multiple times in a short period (e.g. initial load + SIGNED_IN + Strict Mode). */
const BUILD_SETTINGS_COOLDOWN_MS = 5000

/**
 * Tag Sentry events with the signed-in user so a support report ("it failed for this
 * person") can actually be looked up. Without this, errors and session replays arrive
 * anonymous and there is no way to filter to one user — which is exactly why the
 * OneDrive regrant report could not be traced.
 *
 * Dynamically imported and failure-tolerant: Sentry is not initialised in development,
 * and identification must never be able to break authentication.
 */
function identifyToSentry(user: User | null) {
    if (process.env.NODE_ENV === 'development') return
    import('@sentry/nextjs')
        .then((Sentry) => {
            if (user) {
                Sentry.setUser({ id: user.id, email: user.email ?? undefined })
            } else {
                Sentry.setUser(null)
            }
        })
        .catch(() => { /* Sentry unavailable — never block auth on telemetry */ })
}

/**
 * A sign-in that ended without anyone pressing Sign out in this tab: revoked from another device or
 * by an admin, or a refresh that failed. Reported so abrupt sign-outs can be counted rather than
 * guessed at. Never blocks the sign-out itself.
 */
function reportUnexpectedSignOut(userId: string | null) {
    if (process.env.NODE_ENV === 'development') return
    const path = typeof window !== 'undefined' ? window.location.pathname : undefined
    import('@sentry/nextjs')
        .then((Sentry) => {
            Sentry.captureMessage('Signed out without a sign-out click', {
                level: 'warning',
                tags: { area: 'auth' },
                // The Sentry user is cleared by the time this runs, so the id travels here.
                user: userId ? { id: userId } : undefined,
                extra: { path, visibility: typeof document !== 'undefined' ? document.visibilityState : undefined },
            })
        })
        .catch(() => { /* Sentry unavailable */ })
}

/**
 * A Sign out click in one tab reaches this browser's other tabs as SIGNED_OUT too. The clicking tab
 * leaves this mark, so the others don't report an expected sign-out as an unexpected one.
 */
const SIGN_OUT_MARK_KEY = 'fm-signing-out-at'
const SIGN_OUT_MARK_WINDOW_MS = 15_000

function markSigningOut() {
    try { localStorage.setItem(SIGN_OUT_MARK_KEY, String(Date.now())) } catch { /* storage blocked */ }
}

function signedOutOnPurpose(): boolean {
    try {
        const at = Number(localStorage.getItem(SIGN_OUT_MARK_KEY))
        return Number.isFinite(at) && Date.now() - at < SIGN_OUT_MARK_WINDOW_MS
    } catch {
        return false
    }
}

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: (email?: string, next?: string) => Promise<void>
  signInWithMicrosoft: (email?: string, next?: string) => Promise<void>
  /** Signs out this browser only. Other devices stay signed in. */
  signOut: () => Promise<void>
  /** Ends every sign-in this account has, on every device, then this one. */
  signOutEverywhere: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children, initialSession }: { children: ReactNode; initialSession?: Session | null }) {
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null)
  const [session, setSession] = useState<Session | null>(initialSession ?? null)
  // If server provided a session, skip the loading state entirely
  const [loading, setLoading] = useState<boolean>(initialSession == null)
  const lastBuiltUserIdRef = useRef<string | null>(null)
  // Who was signed in, for reporting a sign-out that happened by itself (see reportUnexpectedSignOut).
  const lastUserIdRef = useRef<string | null>(initialSession?.user?.id ?? null)
  const lastBuiltAtRef = useRef<number>(0)

  const maybeBuildUserSettingsPlus = (userId: string) => {
    const now = Date.now()
    if (lastBuiltUserIdRef.current === userId && now - lastBuiltAtRef.current < BUILD_SETTINGS_COOLDOWN_MS) {
      return
    }
    lastBuiltUserIdRef.current = userId
    lastBuiltAtRef.current = now
    buildUserSettingsPlus().catch(err => {
      logger.error('Failed to build UserSettingsPlus', err)
    })
  }

  useEffect(() => {
    if (initialSession?.user) {
      identifyToSentry(initialSession.user)
      maybeBuildUserSettingsPlus(initialSession.user.id)
    }

    // Only fetch session client-side if server didn't provide one (unauthenticated pages,
    // or static/edge cases where cookies weren't readable during SSR).
    if (initialSession == null) {
      const getInitialSession = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session)
        setUser(session?.user ?? null)
        identifyToSentry(session?.user ?? null)
        lastUserIdRef.current = session?.user?.id ?? null
        if (session?.user) {
          maybeBuildUserSettingsPlus(session.user.id)
        }
        setLoading(false)
      }
      getInitialSession()
    }

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state change', 'Auth', { event, hasUser: !!session?.user, hasSession: !!session, userId: session?.user?.id })
        setSession(session)
        setUser(session?.user ?? null)
        identifyToSentry(session?.user ?? null)

        if (event === 'SIGNED_IN' && session?.user) {
          logger.info('User signed in successfully', 'Auth', { userId: session.user.id })
          maybeBuildUserSettingsPlus(session.user.id)
        }

        if (event === 'SIGNED_OUT') {
          if (lastUserIdRef.current && !signedOutOnPurpose()) reportUnexpectedSignOut(lastUserIdRef.current)
          clearCheckoutHintSessionKeys()
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/d/')) {
            window.location.href = '/signin'
          }
        }

        lastUserIdRef.current = session?.user?.id ?? null
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async (email?: string, next?: string) => {
    // Must match the host that just set the PKCE code_verifier cookie (Supabase's SDK scopes
    // that cookie to window.location's actual host, no `domain` attribute) — using a fixed
    // config.appUrl here breaks sign-in from any host other than that one (e.g. client
    // subdomains like app.firma.bz), since the callback lands on a host that never received
    // the cookie: `AuthPKCECodeVerifierMissingError`. getOAuthRedirectOrigin() already handles
    // this correctly (current origin, with an http:// carve-out for localhost's no-TLS dev server).
    const baseUrl = getOAuthRedirectOrigin()
    const callbackUrl = next
      ? `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`
      : `${baseUrl}/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
        queryParams: email ? {
          login_hint: email // Pre-fill email if provided
        } : undefined
      }
    })

    if (error) {
      console.error('Error signing in with Google:', error)
      throw error
    }
  }

  const signInWithMicrosoft = async (email?: string, next?: string) => {
    // See signInWithGoogle above — must use the current origin, not a fixed config.appUrl,
    // for the same PKCE-cookie-host-matching reason.
    const baseUrl = getOAuthRedirectOrigin()
    const callbackUrl = next
      ? `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`
      : `${baseUrl}/auth/callback`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: callbackUrl,
        // Identity-only scopes — must NOT include Files.ReadWrite.All / Sites.ReadWrite.All,
        // which are requested separately by the OneDrive/SharePoint connector's own OAuth flow.
        scopes: 'email profile openid',
        queryParams: email ? {
          login_hint: email // Pre-fill email if provided
        } : undefined
      }
    })

    if (error) {
      console.error('Error signing in with Microsoft:', error)
      throw error
    }
  }

  const signOut = async () => {
    // Drop this browser's push subscription first. The endpoint is bound to the browser
    // profile, not the session, so without this the signed-out user keeps receiving
    // notifications on a shared machine. Best-effort: never block sign-out on it.
    try {
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration()
        const subscription = await registration?.pushManager.getSubscription()
        if (subscription) {
          const endpoint = subscription.endpoint
          await subscription.unsubscribe()
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          })
        }
      }
    } catch {
      // Stale rows are pruned server-side on the next failed send anyway.
    }

    // This browser only. Supabase's default ('global') also signed out the person's other devices,
    // which then bounced to /signin with no visible cause.
    markSigningOut()
    const { error } = await supabase.auth.signOut({ scope: 'local' })

    if (error) {
      console.error('Error signing out:', error)
      throw error
    }

    clearCheckoutHintSessionKeys()
    // Note: Redirect is handled by the calling component
  }

  const signOutEverywhere = async () => {
    // The server ends every sign-in this account has (lib/auth/sessions.ts), then this browser
    // drops its own copy. Other devices are sent to sign in when they next renew their login.
    const res = await fetch('/api/account/sessions', { method: 'DELETE' })
    if (!res.ok) throw new Error("Couldn't sign out of other devices")
    await signOut()
  }

  const value = {
    user,
    session,
    loading,
    signInWithGoogle,
    signInWithMicrosoft,
    signOut,
    signOutEverywhere,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
