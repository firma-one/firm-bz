import { NextRequest, NextResponse, after } from 'next/server'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { memoAuthor, memoFailureResponse, memoRouteAccess } from '@/lib/memos/memo-access'
import { editMemo } from '@/lib/memos/memo-store'
import { reviewMemoOnAdd } from '@/lib/memos/memo-review'
import { MEMO_MAX_CHARS, cleanMemoTitle, isMemoDay } from '@/lib/memos/memo-shared'

export const dynamic = 'force-dynamic'
// Room for Brio reading new notes after the edit has answered, as when a memo is added.
export const maxDuration = 120

const count = (v: unknown, max: number): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null

/**
 * PATCH /api/projects/[projectId]/memos/[documentId]
 *
 * Edits a memo (.claude/plans/brio-features-round-2.md, §14.3): a new title, day or notes. Body:
 * { title, date: "YYYY-MM-DD", body?: string (omitted: the notes stay as they are), source?, durationMinutes?,
 * speakers? (when a file replaced the notes), identify?: boolean }.
 *
 * The file in storage is rewritten and renamed (lib/memos/memo-store.ts, editMemo). New notes stop what
 * Brio found in the old ones from waiting; with `identify`, Brio reads the new notes once the edit has
 * answered, for 1 credit from the firm, as when a memo is added. A new title or day costs nothing and
 * changes no action item. Nothing applied is undone. Recorded in the audit trail.
 *
 * Who: a Lead or a Contributor · Full Access (lib/memos/memo-access.ts). A completed engagement is read only.
 */
export async function PATCH(
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
        const title = cleanMemoTitle(typeof body?.title === 'string' ? body.title : '')
        if (!title) return NextResponse.json({ error: 'Give the memo a title.' }, { status: 400 })
        if (!isMemoDay(body?.date)) return NextResponse.json({ error: 'Choose the day of the call.' }, { status: 400 })
        const text = typeof body?.body === 'string' ? body.body : null
        if (text !== null && !text.trim()) return NextResponse.json({ error: 'A memo needs its notes. Paste or write them first.' }, { status: 400 })
        if (text !== null && text.length > MEMO_MAX_CHARS) {
            return NextResponse.json(
                { error: `This memo is too long to save. Keep it under ${MEMO_MAX_CHARS.toLocaleString('en-US')} characters.` },
                { status: 413 },
            )
        }

        const author = memoAuthor(access.user)
        const edited = await editMemo({
            engagementId: projectId,
            documentId,
            title,
            date: body!.date as string,
            body: text,
            ...(body?.source === 'transcript' || body?.source === 'notes' ? { source: body.source } : {}),
            durationMinutes: count(body?.durationMinutes, 24 * 60),
            speakers: count(body?.speakers, 500),
            actor: { userId: author.userId, name: author.name },
        })
        if (!edited.ok) return NextResponse.json({ error: edited.error }, { status: edited.status })

        // New notes, and the box ticked: Brio reads them once the answer has gone (§13, §14.3).
        const identifying = edited.notesChanged && body?.identify === true
        if (identifying) {
            const { firmId, clientId } = access.ctx
            const memoId = edited.memo.id
            after(() => reviewMemoOnAdd({
                engagementId: projectId, firmId, clientId, memoId, actorUserId: author.userId, trigger: 'edited', requested: true,
            }).then((outcome) => {
                if (outcome.status !== 'reviewed') console.info('[memos] edited memo not reviewed:', outcome.status)
            }))
        }

        return NextResponse.json({
            data: { memo: edited.memo, fileName: edited.fileName, notesChanged: edited.notesChanged, identifying },
            ...(edited.warning ? { warning: edited.warning } : {}),
        })
    } catch (error) {
        return memoFailureResponse(error, '[memos] PATCH failed:', "Something went wrong on our side, so the memo wasn't saved. Try again.")
    }
}
