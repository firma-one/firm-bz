import { NextRequest, NextResponse, after } from 'next/server'
import { prisma } from '@/lib/prisma'
import { blockIfEngagementCompleted, getEngagementStatus } from '@/lib/engagement-access'
import { providerOf } from '@/lib/connectors/content-failure'
import { memoAuthor, memoFailureResponse, memoRouteAccess } from '@/lib/memos/memo-access'
import { listMemos, saveMemo } from '@/lib/memos/memo-store'
import { reviewMemoOnAdd } from '@/lib/memos/memo-review'
import { MEMO_MAX_CHARS, cleanMemoTitle, isMemoDay } from '@/lib/memos/memo-shared'

export const dynamic = 'force-dynamic'
// Room for the review that runs after a save answers: two model calls and a read from storage.
export const maxDuration = 120

/**
 * GET /api/projects/[projectId]/memos
 *
 * The engagement's internal memos for the Overview card, newest call first, read from the database
 * alone (each memo file's row carries `settings.memo`). Also says whether the engagement is read only
 * (completed) and which storage the memos are kept in.
 *
 * POST /api/projects/[projectId]/memos
 *
 * Saves a memo: a Markdown file in the engagement's "Internal Memos" folder, made on the first save and
 * internal only (lib/memos/memo-store.ts). Body: { title, date: "YYYY-MM-DD", body, source?: "notes" |
 * "transcript", durationMinutes?, speakers? }.
 *
 * Both: a Lead or a Contributor · Full Access (lib/memos/memo-access.ts). A completed engagement is read
 * only, so saving is refused.
 *
 * After a save has answered, Brio identifies the memo's action items and suggests its RAID entries, which
 * wait on the memo (lib/memos/memo-review.ts, §13). Nothing is applied; a failure leaves the memo as saved.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params
        const access = await memoRouteAccess(projectId)
        if (!access.ok) return access.response

        const [memos, status, engagement] = await Promise.all([
            listMemos(projectId),
            getEngagementStatus(projectId),
            prisma.engagement.findUnique({
                where: { id: projectId },
                select: { client: { select: { connectorId: true, connector: { select: { type: true } } } } },
            }),
        ])
        const connected = !!engagement?.client?.connectorId

        return NextResponse.json({
            data: {
                memos,
                readOnly: status === 'COMPLETED',
                storage: connected ? providerOf(engagement?.client?.connector?.type) : null,
            },
        })
    } catch (error) {
        return memoFailureResponse(error, '[memos] GET failed:', "This engagement's memos didn't load. Try again.")
    }
}

const count = (v: unknown, max: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params
        const access = await memoRouteAccess(projectId)
        if (!access.ok) return access.response

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const body = await request.json().catch(() => null) as Record<string, unknown> | null
        const title = cleanMemoTitle(typeof body?.title === 'string' ? body.title : '')
        const text = typeof body?.body === 'string' ? body.body : ''
        if (!title) return NextResponse.json({ error: 'Give the memo a title.' }, { status: 400 })
        if (!isMemoDay(body?.date)) return NextResponse.json({ error: 'Choose the day of the call.' }, { status: 400 })
        if (!text.trim()) return NextResponse.json({ error: 'Paste or write the notes first.' }, { status: 400 })
        if (text.length > MEMO_MAX_CHARS) {
            return NextResponse.json(
                { error: `This memo is too long to save. Keep it under ${MEMO_MAX_CHARS.toLocaleString('en-US')} characters.` },
                { status: 413 },
            )
        }
        const source = body?.source === 'transcript' ? 'transcript' : 'notes'

        const saved = await saveMemo({
            engagementId: projectId,
            title,
            date: body!.date as string,
            body: text,
            source,
            durationMinutes: count(body?.durationMinutes, 24 * 60),
            speakers: count(body?.speakers, 500),
            author: memoAuthor(access.user),
        })

        // Once the answer has gone: the memo's action items and RAID suggestions, waiting on it (§13).
        const { firmId, clientId } = access.ctx
        const actorUserId = access.user.id
        after(() => reviewMemoOnAdd({ engagementId: projectId, firmId, clientId, actorUserId, memoId: saved.memo.id, trigger: 'added' }).then((outcome) => {
            if (outcome.status !== 'reviewed' && outcome.status !== 'off') console.info('[memos] new memo not reviewed:', outcome.status)
        }))

        return NextResponse.json(
            { data: { memo: saved.memo, fileName: saved.fileName }, ...(saved.warning ? { warning: saved.warning } : {}) },
            { status: 201 },
        )
    } catch (error) {
        return memoFailureResponse(error, '[memos] POST failed:', "Something went wrong on our side, so the memo wasn't saved. Try again.")
    }
}
