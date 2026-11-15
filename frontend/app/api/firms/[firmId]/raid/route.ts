import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { findFirmInPermissions } from '@/lib/permission-helpers'
import { firmRaidEngagementIds, firmRaidOverview } from '@/lib/raid/firm-raid'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/firms/[firmId]/raid
 *
 * The Firm Overview's open risks and issues (lib/raid/firm-raid.ts): across the engagements whose RAID log
 * the person may see, as the RAID tab decides it (mayReadRaid, after lib/raid/raid-access.ts): a Lead or a
 * Contributor · Full Access on the engagement, or a firm admin or the client's manager. Someone with none
 * is refused (403), so the section isn't shown to them at all: a Contributor · Limited Access and a
 * Reviewer never have one. Reads only; Completed engagements are left out.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ firmId: string }> },
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 })

        const { firmId } = await params
        const settings = await userSettingsPlus.getUserSettingsPlus(user.id)
        const firm = findFirmInPermissions(settings.permissions, firmId)
        if (!firm) return NextResponse.json({ error: "You aren't a member of this firm." }, { status: 404 })

        const engagementIds = await firmRaidEngagementIds(firmId, settings.permissions)
        if (engagementIds.length === 0) {
            return NextResponse.json(
                { error: 'The RAID log is for Leads and Full Access contributors, and you are neither on any engagement here.' },
                { status: 403 },
            )
        }
        const data = await firmRaidOverview(engagementIds)
        return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
        logger.error('[firm-raid] GET failed', error as Error)
        return NextResponse.json({ error: "Something went wrong on our side, so the risks and issues didn't load. Try again." }, { status: 500 })
    }
}
