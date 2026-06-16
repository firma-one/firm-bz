import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveGroupId } from '@/lib/billing/billing-group'

export async function POST() {
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
    if (!membership?.firmId) return NextResponse.json({ error: 'No default firm' }, { status: 400 })

    const groupId = await resolveGroupId(membership.firmId)
    const sandboxFirm = await prisma.firm.findFirst({
        where: { groupId, sandboxOnly: true, deletedAt: null },
        select: { id: true, settings: true },
    })
    if (!sandboxFirm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

    const settings = (sandboxFirm.settings as Record<string, unknown> | null) ?? {}
    const onboarding = (settings.onboarding as Record<string, unknown> | undefined) ?? {}
    const subscription = (onboarding.subscription as Record<string, unknown> | undefined) ?? {}

    await prisma.firm.update({
        where: { id: sandboxFirm.id },
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

    return NextResponse.json({ success: true })
}

