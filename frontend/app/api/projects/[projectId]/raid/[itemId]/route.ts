import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { raidFailureResponse, raidRouteAccess } from '@/lib/raid/raid-access'
import {
    acceptRaidSuggestion,
    closeRaidItem,
    dismissRaidSuggestion,
    editRaidItem,
    raidActor,
    reopenRaidItem,
} from '@/lib/raid/raid-store'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/projects/[projectId]/raid/[itemId]
 *
 * A person's change to one entry of the RAID log. Body: { action, ... }:
 * - "accept": { priority? } a suggestion joins the log (Open, Recorded for a decision), or merges into the entry it adds to.
 * - "dismiss": a suggestion is turned down.
 * - "edit": { title?, notes?, ownerUserId?, priority? }. Titles only for entries a person or Brio wrote; a priority
 *   (HIGH, MEDIUM, LOW) only on a Risk or an Issue, and the sync keeps it from then on.
 * - "close" / "reopen".
 *
 * A Lead or a Contributor · Full Access (lib/raid/raid-access.ts). A completed engagement is read only.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; itemId: string }> },
) {
    try {
        const { projectId, itemId } = await params
        const access = await raidRouteAccess(projectId)
        if (!access.ok) return access.response

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const body = (await request.json().catch(() => null) ?? {}) as Record<string, unknown>
        const actor = raidActor(access.user)
        switch (body.action) {
            case 'accept':
                return NextResponse.json({ data: await acceptRaidSuggestion(projectId, actor, itemId, 'priority' in body ? { priority: body.priority } : {}) })
            case 'dismiss':
                await dismissRaidSuggestion(projectId, actor, itemId)
                return NextResponse.json({ data: { id: itemId } })
            case 'edit':
                await editRaidItem(projectId, actor, itemId, {
                    ...('title' in body ? { title: body.title } : {}),
                    ...('notes' in body ? { notes: body.notes } : {}),
                    ...('ownerUserId' in body ? { ownerUserId: body.ownerUserId } : {}),
                    ...('priority' in body ? { priority: body.priority } : {}),
                })
                return NextResponse.json({ data: { id: itemId } })
            case 'close':
                await closeRaidItem(projectId, actor, itemId)
                return NextResponse.json({ data: { id: itemId } })
            case 'reopen':
                await reopenRaidItem(projectId, actor, itemId)
                return NextResponse.json({ data: { id: itemId } })
            default:
                return NextResponse.json({ error: 'Say what to do with the entry: accept, dismiss, edit, close or reopen.' }, { status: 400 })
        }
    } catch (error) {
        return raidFailureResponse(error, '[raid] PATCH failed:', "The entry wasn't changed. Try again.")
    }
}
