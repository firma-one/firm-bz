import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { getActiveSubscriptionForGroup } from '@/lib/billing/active-billing-subscription'
import { resolveGroupId } from '@/lib/billing/billing-group'

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, isDefault: true, firm: { deletedAt: null } },
        select: { firmId: true, role: true },
    })
    if (!membership?.firmId) return NextResponse.json({ shouldShow: false })
    if (membership.role !== 'firm_admin') return NextResponse.json({ shouldShow: false, isFirmAdmin: false })

    const groupId = await resolveGroupId(membership.firmId)
    const sandboxFirm = await prisma.firm.findFirst({
        where: { groupId, sandboxOnly: true, deletedAt: null },
        select: { id: true, settings: true },
    })
    if (!sandboxFirm) return NextResponse.json({ shouldShow: false })

    const activeSub = await getActiveSubscriptionForGroup(groupId)
    const settings = (sandboxFirm.settings as Record<string, unknown> | null) ?? {}
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

