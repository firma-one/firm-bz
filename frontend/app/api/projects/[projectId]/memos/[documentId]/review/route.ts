import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { memoFailureResponse, memoRouteAccess } from '@/lib/memos/memo-access'
import { MEMO_NOT_FOUND, dismissMemoReview, findMemo } from '@/lib/memos/memo-store'
import { notesEngagementRef } from '@/lib/memos/memo-review'
import { appliedStoredIds, type MemoRaidSuggestion, type MemoReviewPayload } from '@/lib/memos/memo-shared'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[projectId]/memos/[documentId]/review
 *
 * What waits on a memo (§13): its action items as stored (each quote an anchor only, which the pane fills
 * in from the memo it has read), which were applied since, what a reminder needs to point back here, and
 * the memo's RAID suggestions still waiting. From the database alone, so it's read fresh on every open
 * and after every action; the memo's text is never read here.
 *
 * Who: a Lead or a Contributor · Full Access (lib/memos/memo-access.ts).
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
    try {
        const { projectId, documentId } = await params
        const access = await memoRouteAccess(projectId)
        if (!access.ok) return access.response

        const found = await findMemo(projectId, documentId)
        if (!found) return NextResponse.json({ error: MEMO_NOT_FOUND }, { status: 404 })

        const review = found.memo.review && !found.memo.review.dismissed ? found.memo.review : null
        const [engagement, raidRows] = await Promise.all([
            notesEngagementRef(projectId, access.ctx.firmId),
            prisma.engagementRaidItem.findMany({
                where: { engagementId: projectId, status: 'SUGGESTED', sourceKind: 'MEMO', sourceRef: found.id },
                orderBy: { raisedAt: 'asc' },
                select: { id: true, type: true, title: true },
            }),
        ])
        const data: MemoReviewPayload = {
            review,
            alreadyApplied: review ? appliedStoredIds(review, found.memo.applied) : [],
            engagement,
            raid: raidRows.map((r): MemoRaidSuggestion => ({ id: r.id, type: r.type as MemoRaidSuggestion['type'], title: r.title })),
        }
        return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
        return memoFailureResponse(error, '[memos] review GET failed:', "Something went wrong on our side, so this memo's action items didn't load. Try again.")
    }
}

/**
 * DELETE /api/projects/[projectId]/memos/[documentId]/review
 *
 * Dismiss all: the memo's waiting action items (§13) no longer wait. Nothing else changes: what was
 * applied stays applied, and the memo's RAID suggestions are accepted or dismissed in the RAID log's own
 * routes. Identifying the action items again starts a new review.
 *
 * Who: a Lead or a Contributor · Full Access (lib/memos/memo-access.ts). A completed engagement is read only.
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
    try {
        const { projectId, documentId } = await params
        const access = await memoRouteAccess(projectId)
        if (!access.ok) return access.response

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const done = await dismissMemoReview(projectId, documentId)
        if (!done) return NextResponse.json({ error: MEMO_NOT_FOUND }, { status: 404 })
        return NextResponse.json({ data: { dismissed: true } })
    } catch (error) {
        return memoFailureResponse(error, '[memos] review DELETE failed:', "Something went wrong on our side, so the action items weren't dismissed. Try again.")
    }
}
