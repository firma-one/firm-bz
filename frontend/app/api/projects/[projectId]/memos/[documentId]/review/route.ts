import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { memoFailureResponse, memoRouteAccess } from '@/lib/memos/memo-access'
import { MEMO_NOT_FOUND, dismissMemoReview, findMemo } from '@/lib/memos/memo-store'
import { notesEngagementRef } from '@/lib/memos/memo-review'
import { openMinutes } from '@/lib/memos/memo-minutes'
import { anchorOf, appliedStoredIds, appliedStoredOn, type MemoAcceptedAction, type MemoRaidSuggestion, type MemoReviewPayload } from '@/lib/memos/memo-shared'
import { parseFollowUp, priorityOf, type RaidType } from '@/lib/raid/raid-shared'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const dayOf = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/**
 * GET /api/projects/[projectId]/memos/[documentId]/review
 *
 * What waits on a memo (.claude/plans/raid-actions-memo-minutes.md): its minutes, opened; its RAID
 * suggestions still waiting (each quote an anchor only, which the pane fills in from the memo it has
 * read); the Actions already accepted from it, for the minutes; and, on reviews from before minutes, the
 * action items as stored. From the database alone, so it's read fresh on every open and after every
 * action; the memo's text is never read here.
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
        const [engagement, raidRows, accepted] = await Promise.all([
            notesEngagementRef(projectId, access.ctx.firmId),
            prisma.engagementRaidItem.findMany({
                where: { engagementId: projectId, status: 'SUGGESTED', sourceKind: 'MEMO', sourceRef: found.id },
                orderBy: { raisedAt: 'asc' },
                select: { id: true, type: true, title: true, priority: true, quoteAt: true, dueDate: true, followUp: true },
            }),
            // Actions accepted from this memo and still in the log: the minutes list them with the waiting ones.
            prisma.engagementRaidItem.findMany({
                where: { engagementId: projectId, type: 'ACTION', status: { in: ['OPEN', 'CLOSED'] }, sourceKind: 'MEMO', sourceRef: found.id },
                orderBy: { raisedAt: 'asc' },
                select: { id: true, title: true, dueDate: true, followUp: true },
            }),
        ])
        const data: MemoReviewPayload = {
            review,
            alreadyApplied: review ? appliedStoredIds(review, found.memo.applied) : [],
            appliedOn: review ? appliedStoredOn(review, found.memo.applied) : {},
            // What an edit keeps (§14.3): the card's names for what was applied, never the memo's lines.
            applied: found.memo.applied.map((a) => ({ label: a.label, at: a.at })),
            engagement,
            raid: raidRows.map((r): MemoRaidSuggestion => ({
                id: r.id,
                type: r.type as MemoRaidSuggestion['type'],
                title: r.title,
                priority: priorityOf({ type: r.type as RaidType, priority: r.priority }),
                // Where its line sits in the memo, never the words: the pane shows them from the memo it has open.
                quoteAt: anchorOf(r.quoteAt),
                dueDate: r.type === 'ACTION' ? dayOf(r.dueDate) : null,
                followUp: r.type === 'ACTION' ? parseFollowUp(r.followUp) : null,
            })),
            // The minutes stay when the suggestions are dismissed: they're the meeting's, not a to-do.
            minutes: openMinutes(found.memo.review?.minutes),
            acceptedActions: accepted.map((a): MemoAcceptedAction => ({ id: a.id, title: a.title, dueDate: dayOf(a.dueDate), followUp: parseFollowUp(a.followUp) })),
        }
        return NextResponse.json({ data }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
        return memoFailureResponse(error, '[memos] review GET failed:', "Something went wrong on our side, so this memo's action items didn't load. Try again.")
    }
}

/**
 * DELETE /api/projects/[projectId]/memos/[documentId]/review
 *
 * Dismiss all: the memo's RAID suggestions still waiting are dismissed, kept hidden so the same lines
 * aren't suggested again, and any older action items no longer wait. Nothing else changes: what was
 * accepted stays in the log, and the minutes stay with the memo. Reading the memo again starts a new review.
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
        await prisma.engagementRaidItem.updateMany({
            where: { engagementId: projectId, status: 'SUGGESTED', sourceKind: 'MEMO', sourceRef: documentId },
            data: { status: 'DISMISSED', updatedBy: access.user.id },
        })
        return NextResponse.json({ data: { dismissed: true } })
    } catch (error) {
        return memoFailureResponse(error, '[memos] review DELETE failed:', "Something went wrong on our side, so the action items weren't dismissed. Try again.")
    }
}
