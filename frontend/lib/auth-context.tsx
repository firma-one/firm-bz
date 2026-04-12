"use client"

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { config, getOAuthRedirectOrigin } from './config'
import { logger } from './logger'
import { buildUserSettingsPlus } from './actions/user-settings'
import { clearCheckoutHintSessionKeys } from './marketing/checkout-hint-session'

/** Cooldown (ms) to avoid calling buildUserSettingsPlus multiple times in a short period (e.g. initial load + SIGNED_IN + Strict Mode). */
const BUILD_SETTINGS_COOLDOWN_MS = 5000

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: (email?: string, next?: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const lastBuiltUserIdRef = useRef<string | null>(null)
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
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setUser(session?.user ?? null)

      if (session?.user) {
        maybeBuildUserSettingsPlus(session.user.id)
      }

      setLoading(false)
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.debug('Auth state change', 'Auth', { event, hasUser: !!session?.user, hasSession: !!session, userId: session?.user?.id })
        setSession(session)
        setUser(session?.user ?? null)

        if (event === 'SIGNED_IN' && session?.user) {
          logger.info('User signed in successfully', 'Auth', { userId: session.user.id })
          maybeBuildUserSettingsPlus(session.user.id)
        }

        if (event === 'SIGNED_OUT') {
          clearCheckoutHintSessionKeys()
        }

        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async (email?: string, next?: string) => {
    // Localhost must use http:// — https:// + next dev ⇒ ERR_SSL_PROTOCOL_ERROR
    const baseUrl =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? getOAuthRedirectOrigin()
        : config.appUrl
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

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('Error signing out:', error)
      throw error
    }

    clearCheckoutHintSessionKeys()
    // Note: Redirect is handled by the calling component
  }

  const value = {
    user,
    session,
    loading,
    signInWithGoogle,
    signOut
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
