import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canEditProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isAiConfigured } from '@/lib/ai/client'
import { aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_PROPOSALS_FAILED } from '@/lib/ai/brio-failure'
import { ASSISTANT } from '@/lib/ai/assistant'
import { ROLE_NAME } from '@/lib/persona-ui-groups'
import {
    MAX_MEMO_CHARS,
    MAX_NOTES_CHARS,
    findNotesActions,
    loadNotesDeliverables,
    resolveToday,
} from '@/lib/ai/notes-proposals'
import { readMemoText } from '@/lib/memos/memo-store'
import { auditMemoRead, notesEngagementRef, readMemoWithBrio } from '@/lib/memos/memo-review'
import { alreadyAppliedIds, alreadyAppliedOn, type MemoAppliedAction } from '@/lib/memos/memo-shared'
import { vaultForEngagement } from '@/lib/ai/known-entities'

export const dynamic = 'force-dynamic'
/** A memo's read is two model calls side by side (minutes and RAID), each allowed 55 seconds. */
export const maxDuration = 90

/**
 * POST /api/projects/[projectId]/ai-notes-proposals
 *
 * Reads the engagement's internal memo and answers with proposed actions: reminders, due-date
 * moves and new deliverables, each with the line of the notes that asked for it. Changes nothing
 * and stores nothing; the panel applies what the person picks through the existing reminder and
 * due-date actions (.claude/plans/brio-features-round-2.md, §3.5).
 *
 * Body: { notes: string, today?: "YYYY-MM-DD" }. The notes are the text in the memo field as the
 * person sees it, saved or not: their own words. Everything else Brio sees (the deliverables) is
 * read here, from this engagement.
 *
 * Or { memoDocumentId: string, today? }: one of the engagement's internal memos (lib/memos), whose
 * text is read here from storage, never taken from the browser. Only a memo file of this engagement
 * qualifies; anything else is not found. Memos may be longer (MAX_MEMO_CHARS, for transcripts), and
 * the answer says which proposals were already applied from that memo (`alreadyApplied`).
 *
 * ## Who
 *
 * A Lead or a Contributor · Full Access: `project:can_edit` together with
 * `project:can_view_internal`. Edit alone would admit a Contributor · Limited Access, and the memo
 * is internal; a Reviewer has neither. A completed engagement is refused, since nothing proposed
 * could be applied to it.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 })

        const ctx = await resolveProjectContext(projectId)
        if (!ctx) return NextResponse.json({ error: 'This engagement was not found, or you no longer have access.' }, { status: 404 })

        const [canEdit, canViewInternal] = await Promise.all([
            canEditProject(ctx.firmId, ctx.clientId, ctx.projectId),
            canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId),
        ])
        if (!canEdit || !canViewInternal) {
            return NextResponse.json(
                { error: `Only a ${ROLE_NAME.eng_admin} or a ${ROLE_NAME.eng_member} can identify action items in the notes.` },
                { status: 403 },
            )
        }

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        if (!isAiConfigured()) {
            return NextResponse.json({ error: `${ASSISTANT.name} isn't available right now.` }, { status: 503 })
        }

        const body = await request.json().catch(() => null) as { notes?: unknown; memoDocumentId?: unknown; today?: unknown } | null

        let notes: string
        const applied: MemoAppliedAction[] | null = null
        if (body?.memoDocumentId !== undefined) {
            // An internal memo: its text comes from storage, read for this one request.
            const memo = await readMemoText(projectId, body.memoDocumentId)
            if (!memo.ok) return NextResponse.json({ error: memo.error }, { status: memo.status })
            notes = memo.text.trim()
            if (!notes) return NextResponse.json({ error: 'This memo is empty, so there is nothing to read.' }, { status: 400 })
            if (notes.length > MAX_MEMO_CHARS) {
                return NextResponse.json(
                    { error: `This memo is too long for ${ASSISTANT.name} to read at once. Memos up to ${MAX_MEMO_CHARS.toLocaleString('en-US')} characters can be read; split this one into shorter memos.` },
                    { status: 413 },
                )
            }
            // A memo is read for its minutes and its RAID suggestions, every commitment an Action
            // (.claude/plans/raid-actions-memo-minutes.md), as when it was added: two credits, the person's.
            // Both wait on the memo; the panel loads them again from its review.
            const read = await readMemoWithBrio({
                engagementId: projectId,
                firmId: ctx.firmId,
                memo: { id: memo.memo.id, title: memo.memo.title, date: memo.memo.date, text: notes },
                userId: user.id,
                by: 'person',
                now: new Date(),
            })
            if (read.status === 'over_limit') return aiFailureResponse(read.error, BRIO_PROPOSALS_FAILED, '[ai-notes-proposals] memo read over limit:')
            if (read.status === 'unconfigured') return NextResponse.json({ error: `${ASSISTANT.name} isn't available right now.` }, { status: 503 })
            auditMemoRead({
                firmId: ctx.firmId, clientId: ctx.clientId, engagementId: projectId, memoId: memo.memo.id, fileName: memo.memo.fileName,
                actorUserId: user.id, trigger: 'person',
                minutes: read.status === 'reviewed' && read.minutes,
                raidSuggested: read.status === 'reviewed' ? read.raidSuggested : null,
            })
            if (read.status === 'no_answer') return NextResponse.json({ error: BRIO_PROPOSALS_FAILED }, { status: 502 })
            return NextResponse.json({ data: { memoRead: { minutes: read.minutes, raidSuggested: read.raidSuggested } } })
        } else {
            notes = typeof body?.notes === 'string' ? body.notes.trim() : ''
            if (!notes) {
                return NextResponse.json({ error: 'Write or paste some notes first.' }, { status: 400 })
            }
            if (notes.length > MAX_NOTES_CHARS) {
                return NextResponse.json(
                    { error: `These notes are too long for ${ASSISTANT.name} to read at once. Keep them under ${MAX_NOTES_CHARS.toLocaleString('en-US')} characters.` },
                    { status: 413 },
                )
            }
        }
        const today = resolveToday(body?.today)

        const [deliverables, engagement] = await Promise.all([
            loadNotesDeliverables(projectId),
            notesEngagementRef(projectId, ctx.firmId),
        ])

        // Notes typed in place (not a memo): their action items, as before memos had minutes and RAID.
        const outcome = await findNotesActions({
            notes,
            deliverables,
            today,
            scope: { firmId: ctx.firmId, userId: user.id, feature: 'notesProposals' },
            vault: await vaultForEngagement(projectId, ctx.firmId),
        })
        if (!outcome.ok) {
            if (outcome.reason === 'unconfigured') {
                return NextResponse.json({ error: `${ASSISTANT.name} isn't available right now.` }, { status: 503 })
            }
            return NextResponse.json({ error: BRIO_PROPOSALS_FAILED }, { status: 502 })
        }

        return NextResponse.json({
            data: {
                proposals: outcome.proposals,
                skipped: outcome.skipped,
                dropped: outcome.dropped,
                ...(applied ? { alreadyApplied: alreadyAppliedIds(outcome.proposals, applied), appliedOn: alreadyAppliedOn(outcome.proposals, applied) } : {}),
                // What a reminder needs to point back here: the panel creates it with the same action a
                // person uses by hand, which takes these from its caller.
                engagement,
            },
        })
    } catch (error) {
        return aiFailureResponse(error, BRIO_PROPOSALS_FAILED, '[ai-notes-proposals] POST failed:')
    }
}
