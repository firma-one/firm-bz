/**
 * Firm-scoped API auth helper for global search.
 * New file — does not modify lib/api/engagement-auth.ts.
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthUser } from '@/lib/api/engagement-auth'
import type { User } from '@supabase/supabase-js'

export type FirmSearchAuthResult = {
    user: User
    firmId: string
}

/**
 * Require auth + firm membership (any role) for global search.
 * Access to individual documents is still scoped separately inside SearchService.searchGlobal
 * via computeGlobalSearchAccessScope — this only confirms the user belongs to the firm at all.
 */
export async function requireFirmSearch(
    request: NextRequest,
    firmId: string
): Promise<FirmSearchAuthResult | NextResponse> {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { id: true } })
    if (!firm) return NextResponse.json({ error: 'Firm not found' }, { status: 404 })

    const isFirmMember = await prisma.firmMember.findFirst({
        where: { userId: user.id, firmId },
        select: { id: true },
    })
    const hasEngagementMembership = isFirmMember || await prisma.engagementMember.findFirst({
        where: { userId: user.id, engagement: { firmId, isDeleted: false } },
        select: { id: true },
    })

    if (!hasEngagementMembership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return { user, firmId }
}
