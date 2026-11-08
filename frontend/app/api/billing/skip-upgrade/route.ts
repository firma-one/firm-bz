import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * "Skip for now" on Billing's upgrade notice: remember the skip on the person's default firm, where
 * `upgrade-nudge-status` reads it. It used to look for the group's `sandboxOnly` firm, which no longer
 * exists (`Firm.sandboxOnly` is always false), so every skip answered 404.
 */
export async function POST() {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ error: 'Your session has ended. Sign in again, then try again.' }, { status: 401 })
    }

    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, isDefault: true, firm: { deletedAt: null } },
        select: { firmId: true, role: true, firm: { select: { settings: true } } },
    })
    if (!membership?.firmId) {
        return NextResponse.json({ error: "You don't have a workspace to save this to yet." }, { status: 400 })
    }
    if (membership.role !== 'firm_admin') {
        return NextResponse.json({ error: 'Only a firm admin can change billing settings.' }, { status: 403 })
    }

    const settings = (membership.firm.settings as Record<string, unknown> | null) ?? {}
    const onboarding = (settings.onboarding as Record<string, unknown> | undefined) ?? {}
    const subscription = (onboarding.subscription as Record<string, unknown> | undefined) ?? {}

    try {
        await prisma.firm.update({
            where: { id: membership.firmId },
            data: {
                settings: {
                    ...settings,
                    onboarding: {
                        ...onboarding,
                        subscription: {
                            ...subscription,
                            paidPlan: 'skipped',
                            skippedAt: new Date().toISOString(),
                        },
                    },
                },
                updatedBy: user.id,
            },
        })
    } catch (e) {
        logger.error('skip-upgrade: saving the skip failed', e instanceof Error ? e : new Error(String(e)), 'billing', {
            firmId: membership.firmId,
        })
        return NextResponse.json({ error: "Couldn't save that just now. Try again." }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
