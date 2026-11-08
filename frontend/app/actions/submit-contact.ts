'use server'

import { headers } from 'next/headers'

import { CONTACT_MESSAGE_MAX_LENGTH } from '@/lib/contact-form-limits'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { CONTACT_EMAIL } from '@/components/marketing/v2/config'

const WINDOW_SIZE = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS = 5 // 5 requests per hour

/** A failure on our side, in words for a visitor: the form can't help them, so say how to reach us (P2-66). */
const COULD_NOT_SEND = `We couldn't send this. Please email us at ${CONTACT_EMAIL}.`

export async function submitContactForm(formData: FormData, token: string): Promise<ActionResponse<string>> {
    return serverActionWrapper(async () => {
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') || 'unknown'

        // 1. Database-based rate limit (Prisma → system.contact_submissions; not Supabase REST / public)
        const oneHourAgo = new Date(Date.now() - WINDOW_SIZE)
        let recentCount = 0
        try {
            recentCount = await prisma.contactSubmission.count({
                where: {
                    ipAddress: ip,
                    createdAt: { gte: oneHourAgo },
                },
            })
        } catch (e) {
            console.error('Rate limit check error:', e)
            // Continue — don't block legitimate users due to DB issues
        }
        if (recentCount >= MAX_REQUESTS) {
            throw new Error('Too many requests. Please try again later.')
        }

        // 2. Honeypot Check
        const honeypot = formData.get('website')
        if (honeypot) {
            return 'Received!'
        }

        // 3. Turnstile Verification
        if (!token) {
            throw new Error('Captcha validation failed (missing token).')
        }

        const secretKey = process.env.TURNSTILE_SECRET_KEY
        if (!secretKey) {
            console.error('TURNSTILE_SECRET_KEY is not set')
            throw new Error(COULD_NOT_SEND)
        }

        // A refused captcha keeps its own words: the throw used to sit inside this try, so the catch
        // rewrote it to "Failed to verify captcha." (P2-66). Only a check that couldn't run is that.
        let verifyData: { success?: boolean }
        try {
            const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    secret: secretKey,
                    response: token,
                    remoteip: ip,
                }),
            })
            verifyData = await verifyRes.json()
        } catch (err) {
            console.error('Turnstile verify error:', err)
            throw new Error("We couldn't check the captcha. Please try again.")
        }
        if (!verifyData.success) {
            console.error('Turnstile verification failed:', verifyData)
            throw new Error('Captcha validation failed. Please try again.')
        }

        const messageRaw = (formData.get('message') as string | null) ?? ''
        const messageTrimmed = messageRaw.trim()
        if (!messageTrimmed) {
            throw new Error('Please enter a message.')
        }
        // Hard cap to CONTACT_MESSAGE_MAX_LENGTH. Do not throw on overlong payloads: the UI uses
        // maxLength={CONTACT_MESSAGE_MAX_LENGTH}, but Server Action / FormData decoding can rarely
        // yield a string slightly longer than the browser’s value (UTF-16 / transport edge cases).
        const messageForStore = messageTrimmed.slice(0, CONTACT_MESSAGE_MAX_LENGTH)
        if (messageTrimmed.length > CONTACT_MESSAGE_MAX_LENGTH) {
            logger.warn('Contact message clamped to max length', 'submitContactForm', {
                receivedLength: messageTrimmed.length,
                max: CONTACT_MESSAGE_MAX_LENGTH,
            })
        }

        // 4. Persist via Prisma (table lives in system schema; PostgREST does not expose it on public)
        try {
            await prisma.contactSubmission.create({
                data: {
                    ipAddress: ip,
                    email: (formData.get('email') as string) || null,
                    role: (formData.get('role') as string) || null,
                    teamSize: (formData.get('teamSize') as string) || null,
                    inquiryType: (formData.get('inquiryType') as string) || null,
                    message: messageForStore,
                },
            })
        } catch (err) {
            console.error('Contact submission insert error:', err)
            throw new Error(COULD_NOT_SEND)
        }

        return 'Feedback received!'
    }, 'submitContactForm')
}
