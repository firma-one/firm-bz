'use server'

import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { serverActionWrapper, ActionResponse } from '@/lib/server-action-wrapper'
import { sendEmail } from '@/lib/email'
import { waitlistConfirmationEmail, referrerNotificationEmail } from '@/lib/email-templates/waitlist'
import { getPlatformSiteOrigin } from '@/config/platform-domain'

const WINDOW_SIZE = 60 * 60 * 1000 // 1 hour
const MAX_REQUESTS = 3 // 3 requests per hour per IP

interface WaitlistResponse {
    message: string
    isDuplicate?: boolean
    status?: {
        position: number
        ahead: number
        behind: number
        plan: string
    }
    referralCode?: string
}

export async function submitWaitlistForm(formData: FormData, token: string, campaignId: string): Promise<ActionResponse<WaitlistResponse>> {
    return serverActionWrapper(async () => {
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown'

        // 1. Database-based Rate Limit Check
        const oneHourAgo = new Date(Date.now() - WINDOW_SIZE)

        const recentSubmissions = await (prisma as any).waitlist.count({
            where: {
                ipAddress: ip,
                campaignId,
                createdAt: {
                    gte: oneHourAgo
                }
            }
        })

        if (recentSubmissions >= MAX_REQUESTS) {
            throw new Error('Too many requests. Please try again later.')
        }

        // 2. Honeypot Check
        const honeypot = formData.get('website')
        if (honeypot) {
            // Silently fail for bots
            return { message: 'Thank you for joining!' }
        }

        // 3. Turnstile Verification
        if (!token) {
            throw new Error('Captcha validation failed (missing token).')
        }

        const secretKey = process.env.TURNSTILE_SECRET_KEY
        if (!secretKey) {
            console.error('TURNSTILE_SECRET_KEY is not set')
            throw new Error('Server configuration error.')
        }

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

            const verifyData = await verifyRes.json()
            if (!verifyData.success) {
                console.error('Turnstile verification failed:', verifyData)
                throw new Error('Captcha validation failed.')
            }
        } catch (err) {
            console.error('Turnstile verify error:', err)
            throw new Error('Failed to verify captcha.')
        }

        // 4. Check for duplicate email
        const email = formData.get('email') as string
        if (!email || !email.includes('@')) {
            throw new Error('Valid email is required.')
        }

        const existing = await (prisma as any).waitlist.findFirst({
            where: { email: email.toLowerCase().trim(), campaignId },
            select: {
                id: true,
                email: true,
                createdAt: true,
                plan: true,
            },
        })

        if (existing) {
            // Calculate position
            const aheadCount = await (prisma as any).waitlist.count({
                where: {
                    campaignId,
                    createdAt: {
                        lt: existing.createdAt,
                    },
                },
            })

            const behindCount = await (prisma as any).waitlist.count({
                where: {
                    campaignId,
                    createdAt: {
                        gt: existing.createdAt,
                    },
                },
            })

            const position = aheadCount + 1

            return {
                message: 'You\'re already on the waitlist!',
                isDuplicate: true,
                status: {
                    position,
                    ahead: aheadCount,
                    behind: behindCount,
                    plan: existing.plan,
                },
            }
        }

        // 5. Process referral if present
        const referralCode = formData.get('referralCode') as string | null
        let referrerEmail: string | null = null
        let referrerId: string | null = null
        let isReferralSignup = false

        if (referralCode) {
            // Validate referral code exists and is not self-referral
            const referrer = await (prisma as any).waitlist.findUnique({
                where: { referralCode: referralCode.trim().toUpperCase() },
                select: { email: true, id: true },
            })

            if (referrer && referrer.email.toLowerCase() !== email.toLowerCase().trim()) {
                referrerEmail = referrer.email
                referrerId = referrer.id
                isReferralSignup = true
            }
            // If invalid referral code, just ignore it (don't fail signup)
        }

        // 6. Insert waitlist entry
        const plan = (formData.get('plan') as string) || 'Standard'
        const normalizedEmail = email.toLowerCase().trim()

        // Generate unique referral code (8 characters, uppercase alphanumeric)
        const generateReferralCode = (): string => {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Exclude confusing chars (0, O, I, 1)
            let code = ''
            for (let i = 0; i < 8; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length))
            }
            return code
        }

        let referralCodeForNewUser = generateReferralCode()
        // Ensure uniqueness (very unlikely collision, but check anyway)
        let exists = await (prisma as any).waitlist.findUnique({
            where: { referralCode: referralCodeForNewUser },
        })
        while (exists) {
            referralCodeForNewUser = generateReferralCode()
            exists = await (prisma as any).waitlist.findUnique({
                where: { referralCode: referralCodeForNewUser },
            })
        }

        const newEntry = await (prisma as any).waitlist.create({
            data: {
                email: normalizedEmail,
                plan: plan,
                companyName: formData.get('companyName') as string || null,
                companySize: formData.get('companySize') as string || null,
                role: formData.get('role') as string || null,
                comments: formData.get('comments') as string || null,
                ipAddress: ip,
                referralCode: referralCodeForNewUser,
                referredBy: referralCode || null,
                campaignId,
                status: 'WAITING',
            }
        })

        // 7. Process referral benefits
        if (isReferralSignup && referrerId) {
            // Track referral count for referrer (5 referrals = Pro upgrade)
            await (prisma as any).waitlist.update({
                where: { id: referrerId },
                data: {
                    referralCount: { increment: 1 },
                },
            })

            // Give referee priority access by moving their createdAt earlier
            const boostMinutes = 10
            await (prisma as any).waitlist.update({
                where: { id: newEntry.id },
                data: {
                    createdAt: new Date(newEntry.createdAt.getTime() - boostMinutes * 60 * 1000),
                },
            })
        }

        // Send transactional emails (fire-and-forget — don't block the response)
        const siteOrigin = process.env.NEXT_PUBLIC_APP_URL || getPlatformSiteOrigin()

        sendEmail(
            normalizedEmail,
            "You're on the Firma waitlist — here's your referral link",
            waitlistConfirmationEmail({ referralCode: referralCodeForNewUser, campaignId, siteOrigin, email: normalizedEmail })
        ).catch((err: unknown) => console.error('Failed to send waitlist confirmation:', err))

        if (isReferralSignup && referrerEmail && referrerId) {
            const updatedReferrer = await (prisma as any).waitlist.findUnique({
                where: { id: referrerId },
                select: { referralCount: true, referralCode: true }
            })
            const maskedJoiner = `${normalizedEmail.split('@')[0].substring(0, 3)}***@${normalizedEmail.split('@')[1]}`
            sendEmail(
                referrerEmail,
                "Someone joined Firma using your referral link 🎉",
                referrerNotificationEmail({
                    referralCount: updatedReferrer.referralCount,
                    newJoinerEmail: maskedJoiner,
                    referralCode: updatedReferrer.referralCode,
                    campaignId,
                    siteOrigin,
                    email: referrerEmail,
                })
            ).catch((err: unknown) => console.error('Failed to send referrer notification:', err))
        }

        const successMessage = isReferralSignup
            ? "You're on the list! As a referred member, you've received priority early access and a free 3-month Standard plan."
            : "You're on the list! You've secured a free 3-month Standard subscription as an Early Adopter. Refer 5 friends to unlock a free Pro upgrade."

        return {
            message: successMessage,
            isDuplicate: false,
            referralCode: referralCodeForNewUser,
        }
    }, 'submitWaitlistForm')
}
