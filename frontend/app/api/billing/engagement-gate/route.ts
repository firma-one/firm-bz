import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveBillingAnchorFirmId, listBillableFirmIdsInBillingGroup } from '@/lib/billing/billing-group'
import { getEntitledEngagementsCapForFirm } from '@/lib/billing/subscription-metadata'

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const firmSlug = new URL(request.url).searchParams.get('firmSlug')?.trim()
    if (!firmSlug) {
        return NextResponse.json({ error: 'Missing firmSlug' }, { status: 400 })
    }

    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, firm: { slug: firmSlug, deletedAt: null } },
        select: { firmId: true },
    })
    if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const cap = await getEntitledEngagementsCapForFirm(membership.firmId)
    const anchorFirmId = await resolveBillingAnchorFirmId(membership.firmId)
    const firmIds = await listBillableFirmIdsInBillingGroup(anchorFirmId)
    const count = await prisma.engagement.count({
        where: {
            firmId: { in: firmIds },
            deletedAt: null,
            isDeleted: false,
        },
    })

    const allowed = cap == null ? true : count < cap
    return NextResponse.json({
        allowed,
        cap,
        count,
        anchorFirmId,
    })
}

