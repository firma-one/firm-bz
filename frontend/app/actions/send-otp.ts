'use server'

import { headers } from 'next/headers'

import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { prisma } from '@/lib/prisma'

interface SendOTPResult {
    userExists: boolean
}

async function verifyTurnstile(turnstileToken: string, ip: string): Promise<void> {
    const secretKey = process.env.TURNSTILE_SECRET_KEY
    if (!secretKey) {
        throw new Error('Server configuration error.')
    }
    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: secretKey, response: turnstileToken, remoteip: ip }),
    })
    const verifyData = await verifyRes.json()
    if (!verifyData.success) {
        throw new Error('Captcha validation failed. Please try again.')
    }
}

/**
 * Step 1 of signup: verify Turnstile and check if the email already has an account.
 * Does NOT send an OTP — OTP is sent only after the user enters their name.
 */
export async function checkEmailExists(
    email: string,
    turnstileToken: string,
): Promise<ActionResponse<SendOTPResult>> {
    return serverActionWrapper(async () => {
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') || 'unknown'

        await verifyTurnstile(turnstileToken, ip)

        const normalizedEmail = email.trim().toLowerCase()
        const existingUsers = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id::text
            FROM auth.users
            WHERE lower(email) = ${normalizedEmail}
            LIMIT 1
        `
        return { userExists: existingUsers.length > 0 }
    }, 'checkEmailExists')
}

/**
 * Send OTP to the user's email with Turnstile protection.
 * Pass firstName + lastName for new signups so they are written into
 * raw_user_meta_data at user-creation time via options.data.
 */
export async function sendOTPWithTurnstile(
    email: string,
    turnstileToken: string,
    firstName?: string,
    lastName?: string,
): Promise<ActionResponse<SendOTPResult>> {
    return serverActionWrapper(async () => {
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') || 'unknown'

        await verifyTurnstile(turnstileToken, ip)

        const { createClient } = await import('@supabase/supabase-js')
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321'
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        const supabase = createClient(supabaseUrl, supabaseAnonKey)

        const normalizedEmail = email.trim().toLowerCase()
        const fn = firstName?.trim()
        const ln = lastName?.trim()
        const userData =
            fn && ln
                ? {
                      first_name: fn,
                      last_name: ln,
                      full_name: `${fn} ${ln}`,
                      name: `${fn} ${ln}`,
                  }
                : undefined

        const { error } = await supabase.auth.signInWithOtp({
            email: normalizedEmail,
            options: {
                shouldCreateUser: !!(fn && ln),
                ...(userData ? { data: userData } : {}),
            },
        })

        if (error) throw new Error(error.message)

        return { userExists: false }
    }, 'sendOTPWithTurnstile')
}
