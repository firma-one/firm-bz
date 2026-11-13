import { NextRequest, NextResponse } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { memoFailureResponse, memoRouteAccess } from '@/lib/memos/memo-access'
import { MEMO_NOT_FOUND, recordMemoApplied } from '@/lib/memos/memo-store'
import { isMemoDay } from '@/lib/memos/memo-shared'

export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[projectId]/memos/[documentId]/applied
 *
 * Notes on an internal memo that an action Brio found in it was applied (`settings.memo.applied`), so
 * the card can say "2 actions applied" and the next Find actions on that memo shows it as done. Called
 * by the card after the apply itself succeeded, through the same actions a person uses by hand.
 *
 * Body: { kind: "reminder" | "dueDate", target, date: "YYYY-MM-DD", quote, label }. Same people as the
 * memos route; refused once the engagement is completed, as applying is.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
    try {
        const { projectId, documentId } = await params
        const access = await memoRouteAccess(projectId)
        if (!access.ok) return access.response

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const body = await request.json().catch(() => null) as Record<string, unknown> | null
        const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
        const kind = body?.kind
        const target = text(body?.target, 200)
        if ((kind !== 'reminder' && kind !== 'dueDate') || !target || !isMemoDay(body?.date)) {
            return NextResponse.json({ error: "That action can't be noted on the memo." }, { status: 400 })
        }

        const appliedCount = await recordMemoApplied(projectId, documentId, {
            kind,
            target,
            date: body!.date as string,
            quote: text(body?.quote, 500),
            label: text(body?.label, 200),
        })
        if (appliedCount === null) return NextResponse.json({ error: MEMO_NOT_FOUND }, { status: 404 })

        return NextResponse.json({ data: { appliedCount } })
    } catch (error) {
        return memoFailureResponse(error, '[memos] applied POST failed:', "Something went wrong on our side, so the memo doesn't note this action. It was still applied.")
    }
}
