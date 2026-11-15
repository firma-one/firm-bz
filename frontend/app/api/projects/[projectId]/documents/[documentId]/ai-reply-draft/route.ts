import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject } from '@/lib/permission-helpers'
import { getProjectDocumentContext } from '@/lib/file-utils'
import { blockIfEngagementCompleted, isExternalEngagementRole, requireEngagementMember } from '@/lib/engagement-access'
import { isAiConfigured, AI_EFFORT } from '@/lib/ai/client'
import { getGuardedAnthropic, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_DRAFT_FAILED } from '@/lib/ai/brio-failure'
import { streamDraft } from '@/lib/ai/stream-draft'
import { REPLY_DRAFT_SYSTEM_PROMPT, buildReplyDraftPrompt, loadReplyDraftContext } from '@/lib/ai/reply-draft'
import { vaultForEngagement } from '@/lib/ai/known-entities'

/** Room for thinking as well as a reply of ~120 words: thinking counts toward it. */
const REPLY_DRAFT_MAX_TOKENS = 2000

/**
 * POST /api/projects/[projectId]/documents/[documentId]/ai-reply-draft
 *
 * Streams Brio's draft of the firm's reply on a document's discussion (newline-delimited JSON, see
 * lib/ai/stream-draft.ts). Writes nothing and sends nothing: the draft lands in the composer, and a
 * person sends it with the ordinary doc-comments POST.
 *
 * Leads and Full Access contributors only: the people who reply to the client for the firm, never a
 * Reviewer or Limited Access contributor. Not on a completed engagement, where comments are refused.
 * Only on a discussion whose latest shared comment is the client side's. The thread is read here from
 * the database (shared comments only, never an internal note); the request body is ignored.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { projectId, documentId: documentIdParam } = await params
        const ctx = await resolveProjectContext(projectId)
        if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        if (!(await canViewProject(ctx.firmId, ctx.clientId, ctx.projectId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const member = await requireEngagementMember(projectId, user.id)
        if (!member) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (isExternalEngagementRole(member.role)) {
            return NextResponse.json({ error: 'Only Leads and Full Access contributors can draft replies.' }, { status: 403 })
        }

        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        const docCtx = await getProjectDocumentContext(projectId, documentIdParam)
        if (!docCtx) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })

        if (!isAiConfigured()) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const thread = await loadReplyDraftContext(projectId, docCtx.id)
        if (!thread) return NextResponse.json({ error: 'Document not found in this project' }, { status: 404 })
        if (!thread.awaitingReply) {
            return NextResponse.json({ error: "This discussion isn't awaiting a reply, so there's nothing to draft." }, { status: 409 })
        }

        const scope = { firmId: ctx.firmId, userId: user.id, feature: 'replyDraft' as const }
        const client = await getGuardedAnthropic(scope, { vault: await vaultForEngagement(projectId, ctx.firmId) })
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        return await streamDraft({
            client,
            scope,
            system: REPLY_DRAFT_SYSTEM_PROMPT,
            user: buildReplyDraftPrompt(thread),
            effort: AI_EFFORT.draft,
            maxTokens: REPLY_DRAFT_MAX_TOKENS,
            failure: BRIO_DRAFT_FAILED,
            label: 'reply-draft',
        })
    } catch (error) {
        return aiFailureResponse(error, BRIO_DRAFT_FAILED, 'AI reply draft error:')
    }
}
