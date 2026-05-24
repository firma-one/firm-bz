import { supabase } from './supabase'
import { getOAuthRedirectOrigin } from './config'
import { User } from '@supabase/supabase-js'

export interface OnboardingData {
    email: string
    firstName: string
    lastName: string
}

export class AuthService {
    /**
     * Send OTP to email for passwordless authentication
     */
    static async sendOTP(email: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true
                }
            })

            if (error) {
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to send OTP'
            }
        }
    }

    /**
     * Verify OTP code
     */
    static async verifyOTP(
        email: string,
        token: string
    ): Promise<{ success: boolean; user?: User; error?: string }> {
        try {
            const { data, error } = await supabase.auth.verifyOtp({
                email,
                token,
                type: 'email'
            })

            if (error) {
                return { success: false, error: error.message }
            }

            if (!data.user) {
                return { success: false, error: 'No user returned' }
            }

            return { success: true, user: data.user }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to verify OTP'
            }
        }
    }

    /**
     * Sign in with Google OAuth (with onboarding context)
     */
    static async signInWithGoogle(
        onboardingData: OnboardingData,
        next?: string | null
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Store onboarding data in localStorage for callback
            localStorage.setItem('onboarding_data', JSON.stringify(onboardingData))

            const callbackNext = next ?? '/d/signup-success'
            const redirectTo = `${getOAuthRedirectOrigin()}/auth/callback?next=${encodeURIComponent(callbackNext)}`

            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                        login_hint: onboardingData.email // Pre-fill email
                    }
                }
            })

            if (error) {
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to initiate Google sign-in'
            }
        }
    }

    /**
     * Get onboarding data from localStorage
     */
    static getOnboardingData(): OnboardingData | null {
        try {
            const data = localStorage.getItem('onboarding_data')
            if (!data) return null
            return JSON.parse(data)
        } catch {
            return null
        }
    }

    /**
     * Clear onboarding data from localStorage
     */
    static clearOnboardingData(): void {
        localStorage.removeItem('onboarding_data')
    }

    /**
     * Sign out
     */
    static async signOut(): Promise<{ success: boolean; error?: string }> {
        try {
            const { error } = await supabase.auth.signOut()

            if (error) {
                return { success: false, error: error.message }
            }

            return { success: true }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to sign out'
            }
        }
    }
}
