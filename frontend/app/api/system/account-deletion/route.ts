import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { DELETION_REQUEST_KIND } from '@/lib/account/deletion-plan'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/account-deletion
 *
 * Open account deletion requests, oldest first.
 *
 * These do not appear in the support queue and they cannot: that page is scoped by firm, and a
 * deletion request deliberately carries no firmId so it never surfaces inside a customer's own
 * ticket list. Without this endpoint the requests exist only as rows nobody looks at, which is how
 * a 45-day commitment quietly becomes an unkept one.
 *
 * Oldest first because the commitment is a deadline, so the one closest to breaching it is the one
 * to work next.
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        if (!(await isSysAdminUser(user.id))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const requests = await prisma.customerRequest.findMany({
            where: {
                status: { in: ['NEW', 'IN_PROGRESS'] },
                metadata: { path: ['kind'], equals: DELETION_REQUEST_KIND },
            },
            select: {
                ticketNumber: true, status: true, description: true,
                userId: true, userEmail: true, createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
        })

        const now = Date.now()
        return NextResponse.json({
            data: {
                requests: requests.map((r) => ({
                    ...r,
                    // Days since asking, against the 45 the privacy policy promises. Computed here
                    // so the number a reader acts on is the same one everywhere it is shown.
                    daysOpen: Math.floor((now - r.createdAt.getTime()) / 86_400_000),
                })),
                /** What the privacy policy commits to. */
                responseDeadlineDays: 45,
            },
        })
    } catch (error) {
        logger.error('[system/account-deletion] failed:', error as Error)
        return NextResponse.json({ error: 'Could not list requests' }, { status: 500 })
    }
}
