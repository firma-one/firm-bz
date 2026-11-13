import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isAiConfigured, AI_EFFORT } from '@/lib/ai/client'
import { getGuardedAnthropic, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_DRAFT_FAILED } from '@/lib/ai/brio-failure'
import { streamDraft } from '@/lib/ai/stream-draft'
import { NUDGE_SYSTEM_PROMPT, buildNudgePrompt } from '@/lib/ai/nudge-draft'

/**
 * POST /api/projects/[projectId]/documents/[documentId]/ai-nudge-draft  { recipientUserId }
 *
 * Streams Brio's draft of a nudge about one deliverable waiting in review, addressed to one
 * Reviewer or Limited Access contributor (newline-delimited JSON, lib/ai/stream-draft.ts). Sends
 * nothing: the Lead edits it and posts it as a comment on the deliverable. Leads only.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
    try {
        const { projectId, documentId } = await params

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const ctx = await resolveProjectContext(projectId)
        if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        if (!(await canManageProject(ctx.firmId, ctx.clientId, ctx.projectId))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const completed = await blockIfEngagementCompleted(projectId)
        if (completed) return completed

        if (!isAiConfigured()) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        const body = await request.json().catch(() => null)
        const recipientUserId = typeof body?.recipientUserId === 'string' ? body.recipientUserId : null
        if (!recipientUserId) return NextResponse.json({ error: 'Choose who to nudge.' }, { status: 400 })

        // Both read within THIS engagement, so a foreign document or person is simply not found.
        const [doc, recipient, engagement] = await Promise.all([
            prisma.engagementDocument.findFirst({
                where: { id: documentId, engagementId: projectId, isFolder: true, status: { not: 'ARCHIVED' } },
                select: { fileName: true, docId: true, dueDate: true, settings: true },
            }),
            prisma.engagementMember.findFirst({
                where: { engagementId: projectId, userId: recipientUserId, role: { in: ['eng_viewer', 'eng_ext_collaborator'] } },
                select: { userId: true },
            }),
            prisma.engagement.findUnique({ where: { id: projectId }, select: { name: true } }),
        ])
        const st = (doc?.settings as Record<string, any> | null) ?? {}
        if (!doc || !st.share?.createdAt) return NextResponse.json({ error: 'Deliverable not found' }, { status: 404 })
        if (st.activity?.status !== 'in_review') {
            return NextResponse.json({ error: 'This deliverable is no longer in review.' }, { status: 409 })
        }
        if (!recipient) {
            return NextResponse.json({ error: 'Nudges go to Reviewers and Limited Access contributors on this engagement.' }, { status: 400 })
        }

        const { createAdminClient } = await import('@/utils/supabase/admin')
        const { data } = await createAdminClient().auth.admin.getUserById(recipientUserId)
        const fullName = (data?.user?.user_metadata?.full_name as string | undefined) ?? data?.user?.email?.split('@')[0] ?? ''
        const firstName = fullName.split(/\s+/)[0] || 'there'

        const now = new Date()
        const since = st.activity?.updatedAt ? new Date(st.activity.updatedAt) : now
        const scope = { firmId: ctx.firmId, userId: user.id, feature: 'nudgeDraft' as const }
        const client = await getGuardedAnthropic(scope)
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        return await streamDraft({
            client,
            scope,
            system: NUDGE_SYSTEM_PROMPT,
            user: buildNudgePrompt({
                recipientFirstName: firstName,
                deliverableName: doc.fileName,
                docId: doc.docId,
                inReviewSince: since.toISOString(),
                daysWaiting: Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000)),
                dueDate: doc.dueDate ? doc.dueDate.toISOString() : null,
                engagementName: engagement?.name ?? '',
                today: now,
            }),
            effort: AI_EFFORT.draft,
            maxTokens: 2000,
            failure: BRIO_DRAFT_FAILED,
            label: 'nudge-draft',
        })
    } catch (error) {
        return aiFailureResponse(error, BRIO_DRAFT_FAILED, 'AI nudge draft error:')
    }
}
