import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getActiveSubscriptionForFirm } from '@/lib/billing/active-billing-subscription'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, isDefault: true, firm: { deletedAt: null } },
        select: { firmId: true },
    })
    if (!membership?.firmId) return NextResponse.json({ shouldShow: false })

    const anchorFirmId = await resolveBillingAnchorFirmId(membership.firmId)
    const anchor = await prisma.firm.findUnique({
        where: { id: anchorFirmId },
        select: {
            settings: true,
        },
    })
    if (!anchor) return NextResponse.json({ shouldShow: false })

    const activeSub = await getActiveSubscriptionForFirm(anchorFirmId)
    const settings = (anchor.settings as Record<string, unknown> | null) ?? {}
    const onboarding = (settings.onboarding as Record<string, unknown> | undefined) ?? {}
    const subscription = (onboarding.subscription as Record<string, unknown> | undefined) ?? {}
    const paidPlan = subscription.paidPlan
    const hasPaid =
        Boolean(activeSub?.active) && activeSub?.pricingModel === 'recurring_subscription'

    return NextResponse.json({
        shouldShow: paidPlan === 'skipped' && !hasPaid,
        paidPlan,
        hasPaid,
    })
}

