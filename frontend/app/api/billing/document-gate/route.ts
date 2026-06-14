import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveGroupId, listBillableFirmIdsInBillingGroup } from '@/lib/billing/billing-group'
import { getActiveSubscriptionMetadataForFirm, parseEntitledDocuments } from '@/lib/billing/subscription-metadata'

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')?.trim()
    const countParam = searchParams.get('count')
    const count = countParam ? parseInt(countParam, 10) : 1

    if (!projectId) {
        return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
    }
    if (isNaN(count) || count < 1) {
        return NextResponse.json({ error: 'Invalid count' }, { status: 400 })
    }

    const engagement = await prisma.engagement.findFirst({
        where: { id: projectId, deletedAt: null, isDeleted: false },
        select: { firmId: true },
    })
    if (!engagement) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // Verify membership
    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, firmId: engagement.firmId },
        select: { id: true },
    })
    if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const groupId = await resolveGroupId(engagement.firmId)
    const metadata = await getActiveSubscriptionMetadataForFirm(engagement.firmId)
    const cap = parseEntitledDocuments(metadata)

    // No cap configured — unlimited
    if (cap == null) {
        return NextResponse.json({ allowed: true, cap: null, current: null, count })
    }

    const firmIds = await listBillableFirmIdsInBillingGroup(groupId)
    const current = await prisma.engagementDocument.count({
        where: { firmId: { in: firmIds }, isFolder: false },
    })

    const available = Math.max(0, cap - current)
    const allowed = current + count <= cap
    return NextResponse.json({ allowed, cap, current, available, count })
}
