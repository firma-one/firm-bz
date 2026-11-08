import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { refreshBillingPlanForFirmGroupUsers } from '@/lib/billing/billing-user-session-sync'
import { createPolarClient } from '@/lib/billing/polar-client'
import { polarFailureWords } from '@/lib/billing/polar-error-reason'
import { logger } from '@/lib/logger'

/**
 * Not called from the app today: canceling goes through the Polar customer portal. Kept (no deletion
 * until sign-off); if something calls it, a Polar refusal answers its reason and a failure after Polar
 * canceled still answers ok, with a warning.
 */
export async function POST(request: NextRequest) {
    const accessToken = process.env.POLAR_ACCESS_TOKEN?.trim()
    if (!accessToken) {
        return NextResponse.json({ error: 'Polar is not configured.' }, { status: 503 })
    }

    const supabase = await createClient()
    const {
        data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const firmId = typeof body.firmId === 'string' ? body.firmId.trim() : ''
    if (!firmId) {
        return NextResponse.json({ error: 'Missing firmId' }, { status: 400 })
    }

    const userId = session.user.id
    const adminMembership = await prisma.firmMember.findFirst({
        where: {
            firmId,
            userId,
            role: 'firm_admin',
            firm: { deletedAt: null },
        },
        select: { id: true },
    })
    if (!adminMembership) {
        return NextResponse.json({ error: 'Only firm admins can cancel subscriptions.' }, { status: 403 })
    }

    const groupId = await resolveGroupId(firmId)
    const activeSub = await getActiveSubscriptionForGroup(groupId)
    if (!activeSub?.polarSubscriptionId) {
        return NextResponse.json(
            { error: 'No active recurring subscription found for this workspace.' },
            { status: 409 }
        )
    }

    const polar = createPolarClient(accessToken)
    let updated: Awaited<ReturnType<typeof polar.subscriptions.update>>
    try {
        updated = await polar.subscriptions.update({
            id: activeSub.polarSubscriptionId,
            subscriptionUpdate: { cancelAtPeriodEnd: true },
        })
    } catch (e) {
        logger.error('Cancel subscription: Polar refused', e instanceof Error ? e : new Error(String(e)), 'billing', { groupId })
        return NextResponse.json(
            { error: `Couldn't cancel · ${polarFailureWords(e)} Your plan is unchanged.` },
            { status: 502 }
        )
    }

    // Polar has canceled by now, so a failure on our side must not answer as though nothing happened:
    // the subscription.canceled webhook brings the row up to date in any case.
    let warning: string | undefined
    try {
        await prisma.subscription.update({
            where: { id: activeSub.id },
            data: {
                currentPeriodEnd: updated.currentPeriodEnd ?? null,
            },
        })
        await refreshBillingPlanForFirmGroupUsers(groupId)
    } catch (e) {
        logger.error('Cancel subscription: canceled at Polar, but saving it here failed', e instanceof Error ? e : new Error(String(e)), 'billing', {
            groupId,
            subscriptionId: activeSub.id,
        })
        warning = 'Your plan ends when this billing period does. Billing may take a minute to show it.'
    }

    return NextResponse.json({
        ok: true,
        periodEndIso: updated.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        ...(warning ? { warning } : {}),
    })
}
