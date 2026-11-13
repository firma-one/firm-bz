import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isAiConfigured } from '@/lib/ai/client'
import { aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_RAID_FAILED } from '@/lib/ai/brio-failure'
import { ASSISTANT } from '@/lib/ai/assistant'
import { raidRouteAccess } from '@/lib/raid/raid-access'
import { runRaidCheck } from '@/lib/raid/raid-check'
import { syncRaidSignals } from '@/lib/raid/raid-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/projects/[projectId]/raid/check
 *
 * "Check now": Brio reads the engagement's comment messages and memos since the last check and saves
 * its suggestions for a person to accept or dismiss (lib/raid/raid-check.ts). One credit when there is
 * something new to read; nothing new costs nothing. The free entries are synced at the same time.
 *
 * A Lead or a Contributor · Full Access. A completed engagement is refused, since nothing found could
 * enter a read-only log. Over the credit allowance: 429 with the limit's own words.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params
        const access = await raidRouteAccess(projectId)
        if (!access.ok) return access.response

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        if (!isAiConfigured()) {
            return NextResponse.json({ error: `${ASSISTANT.name} isn't available right now.` }, { status: 503 })
        }

        await syncRaidSignals(projectId, access.ctx.firmId, { force: true })
        const outcome = await runRaidCheck({ engagementId: projectId, firmId: access.ctx.firmId, userId: access.user.id })
        if (!outcome.ok) {
            switch (outcome.reason) {
                case 'gone':
                    return NextResponse.json({ error: 'This engagement was not found, or you no longer have access.' }, { status: 404 })
                case 'completed':
                    return NextResponse.json({ error: "This engagement is completed, so it's read only." }, { status: 403 })
                case 'unconfigured':
                    return NextResponse.json({ error: `${ASSISTANT.name} isn't available right now.` }, { status: 503 })
                default:
                    return NextResponse.json({ error: BRIO_RAID_FAILED }, { status: 502 })
            }
        }

        const unread = outcome.status === 'checked' ? outcome.unreadMemos : []
        return NextResponse.json({
            data: {
                status: outcome.status,
                suggested: outcome.status === 'checked' ? outcome.suggested : 0,
                dropped: outcome.status === 'checked' ? outcome.dropped : 0,
                lastCheckedAt: outcome.lastCheckedAt,
            },
            ...(unread.length > 0
                ? { warning: `${ASSISTANT.name} couldn't read ${unread.length === 1 ? `the memo “${unread[0]}”` : `${unread.length} memos`} from storage, so ${unread.length === 1 ? 'it was' : 'they were'} left out.` }
                : {}),
        })
    } catch (error) {
        return aiFailureResponse(error, BRIO_RAID_FAILED, '[raid] check failed:')
    }
}
