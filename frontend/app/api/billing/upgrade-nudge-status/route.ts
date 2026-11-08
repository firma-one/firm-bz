import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // The skip lives on the person's default firm (see skip-upgrade). This used to read the group's
    // `sandboxOnly` firm, which no longer exists, so the nudge never showed.
    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, isDefault: true, firm: { deletedAt: null } },
        select: { firmId: true, role: true, firm: { select: { groupId: true, settings: true } } },
    })
    if (!membership?.firmId) return NextResponse.json({ shouldShow: false })
    if (membership.role !== 'firm_admin') return NextResponse.json({ shouldShow: false, isFirmAdmin: false })

    const groupId = membership.firm.groupId
    const activeSub = await getActiveSubscriptionForGroup(groupId)
    const settings = (membership.firm.settings as Record<string, unknown> | null) ?? {}
    const onboarding = (settings.onboarding as Record<string, unknown> | undefined) ?? {}
    const subscription = (onboarding.subscription as Record<string, unknown> | undefined) ?? {}
    const paidPlan = subscription.paidPlan
    const hasPaid =
        Boolean(activeSub?.active) && activeSub?.pricingModel === 'recurring_subscription'

    return NextResponse.json({
        shouldShow: paidPlan === 'skipped' && !hasPaid,
        isFirmAdmin: true,
        paidPlan,
        hasPaid,
    })
}

