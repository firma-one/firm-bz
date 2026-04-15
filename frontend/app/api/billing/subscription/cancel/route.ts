import { NextRequest, NextResponse } from 'next/server'
import { Polar } from '@polar-sh/sdk'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { getActiveSubscriptionForFirm } from '@/lib/billing/active-billing-subscription'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import { refreshBillingPlanForFirmGroupUsers } from '@/lib/billing/billing-user-session-sync'
function polarServer(): 'production' | 'sandbox' {
    return process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox'
}

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

    const anchorId = await resolveBillingAnchorFirmId(firmId)
    const activeSub = await getActiveSubscriptionForFirm(anchorId)
    if (!activeSub?.polarSubscriptionId) {
        return NextResponse.json(
            { error: 'No active recurring subscription found for this workspace.' },
            { status: 409 }
        )
    }

    const polar = new Polar({ accessToken, server: polarServer() })
    const updated = await polar.subscriptions.update({
        id: activeSub.polarSubscriptionId,
        subscriptionUpdate: { cancelAtPeriodEnd: true },
    })

    await prisma.subscription.update({
        where: { id: activeSub.id },
        data: {
            currentPeriodEnd: updated.currentPeriodEnd ?? null,
        },
    })

    await refreshBillingPlanForFirmGroupUsers(anchorId)

    return NextResponse.json({
        ok: true,
        periodEndIso: updated.currentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    })
}
