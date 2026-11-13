import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isAiConfigured } from '@/lib/ai/client'
import { raidFailureResponse, raidRouteAccess } from '@/lib/raid/raid-access'
import { syncRaidSignals } from '@/lib/raid/raid-sync'
import { addRaidItem, lastCheckedAtOf, loadRaidLog, raidActor, raidOpenCountFor } from '@/lib/raid/raid-store'
import { conversationStateOf, loadConversationStamps } from '@/lib/raid/raid-fingerprint'
import type { RaidLogPayload } from '@/lib/raid/raid-shared'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[projectId]/raid
 *
 * The engagement's RAID log (.claude/plans/brio-features-round-2.md, §9): its entries, Brio's
 * suggestions, the people an entry can be given to, when Brio last read the conversation and whether it
 * has changed since (lib/raid/raid-fingerprint.ts). The free entries (status, health, the Board) are
 * brought up to date first (lib/raid/raid-sync.ts), except on a completed engagement, which is read
 * only. `?view=count` answers only the number of live entries, for the Discussions switch.
 *
 * POST /api/projects/[projectId]/raid
 *
 * Adds a person's entry. Body: { type: "RISK" | "ASSUMPTION" | "ISSUE" | "DECISION", title, notes?, ownerUserId? }.
 *
 * Both: a Lead or a Contributor · Full Access (lib/raid/raid-access.ts); Reviewers and Limited Access
 * contributors are refused. A completed engagement refuses the write.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params
        const access = await raidRouteAccess(projectId)
        if (!access.ok) return access.response

        const engagement = await prisma.engagement.findUnique({ where: { id: projectId }, select: { status: true, settings: true } })
        const readOnly = engagement?.status === 'COMPLETED'
        if (!readOnly) await syncRaidSignals(projectId, access.ctx.firmId)

        if (request.nextUrl.searchParams.get('view') === 'count') {
            return NextResponse.json({ data: { count: await raidOpenCountFor(projectId) } })
        }

        const [log, stamps] = await Promise.all([loadRaidLog(projectId), loadConversationStamps(projectId)])
        const data: RaidLogPayload = {
            ...log,
            lastCheckedAt: lastCheckedAtOf(engagement?.settings),
            conversation: conversationStateOf(stamps, engagement?.settings),
            readOnly,
            canCheck: isAiConfigured(),
        }
        return NextResponse.json({ data })
    } catch (error) {
        return raidFailureResponse(error, '[raid] GET failed:', "The RAID log didn't load. Try again.")
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params
        const access = await raidRouteAccess(projectId)
        if (!access.ok) return access.response

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const body = await request.json().catch(() => null) as Record<string, unknown> | null
        const created = await addRaidItem({
            engagementId: projectId,
            firmId: access.ctx.firmId,
            actor: raidActor(access.user),
            type: body?.type,
            title: body?.title,
            notes: body?.notes,
            ownerUserId: body?.ownerUserId,
        })
        return NextResponse.json({ data: created }, { status: 201 })
    } catch (error) {
        return raidFailureResponse(error, '[raid] POST failed:', "The entry wasn't added. Try again.")
    }
}
