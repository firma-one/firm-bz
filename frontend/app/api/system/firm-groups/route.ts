import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { listFirmGroups } from '@/lib/system/firm-group-list'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/system/firm-groups?search=
 *
 * Directory of firm groups with their group admin, for the system-admin tools. Exists so an admin
 * can browse rather than having to already know the email of the account they want to inspect.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!(await isSysAdminUser(user.id))) {
            return NextResponse.json(
                { error: 'Forbidden: System admin access required' },
                { status: 403 },
            )
        }

        const search = request.nextUrl.searchParams.get('search') ?? undefined
        const data = await listFirmGroups(search)
        return NextResponse.json({ data })
    } catch (error) {
        logger.error('[system/firm-groups] GET failed:', error as Error)
        return NextResponse.json({ error: 'Could not load firm groups' }, { status: 500 })
    }
}
