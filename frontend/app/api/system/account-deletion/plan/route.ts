import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { buildDeletionPlan } from '@/lib/account/deletion-plan'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/account-deletion/plan?userId=...
 *
 * What deleting an account would touch, computed without touching anything.
 *
 * Read before fulfilling a deletion request. The counts answer "what am I about to change?", and
 * the warnings name the cases with no safe default — chiefly a workspace the user is the last
 * member of, which deletion would strand along with every firm beneath it.
 *
 * Sysadmin only: it reads one user's footprint across every firm, which is a platform-operations
 * view rather than anything a customer should see of another customer.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        if (!(await isSysAdminUser(user.id))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const userId = request.nextUrl.searchParams.get('userId')?.trim()
        if (!userId) {
            return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
        }

        // The email comes from auth rather than the request, so the plan names the account that
        // will actually be deleted rather than one the caller typed.
        const admin = createAdminClient()
        const { data } = await admin.auth.admin.getUserById(userId)

        const plan = await buildDeletionPlan(userId, data?.user?.email ?? null)
        return NextResponse.json({ data: plan })
    } catch (error) {
        logger.error('[system/account-deletion/plan] failed:', error as Error)
        return NextResponse.json({ error: 'Could not build the plan' }, { status: 500 })
    }
}
