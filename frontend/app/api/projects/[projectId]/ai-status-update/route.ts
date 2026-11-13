import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canManageProject } from '@/lib/permission-helpers'
import { blockIfEngagementCompleted } from '@/lib/engagement-access'
import { isAiConfigured, AI_EFFORT } from '@/lib/ai/client'
import { getGuardedAnthropic, aiFailureResponse } from '@/lib/ai/guarded-client'
import { BRIO_DRAFT_FAILED } from '@/lib/ai/brio-failure'
import { streamDraft } from '@/lib/ai/stream-draft'
import {
    STATUS_UPDATE_SYSTEM_PROMPT,
    buildStatusUpdatePrompt,
    loadStatusUpdateInputs,
} from '@/lib/ai/status-update'

/**
 * POST /api/projects/[projectId]/ai-status-update
 *
 * Streams Brio's draft of a status update to the client side (newline-delimited JSON, see
 * lib/ai/stream-draft.ts). Writes nothing and sends nothing: the Lead edits the draft and sends it
 * with `sendStatusUpdate`. Leads only, and not on a completed engagement, which is read only.
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params

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

        const inputs = await loadStatusUpdateInputs(projectId, ctx.firmId)
        if (!inputs) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
        if (!inputs.summary && inputs.changes.length === 0) {
            return NextResponse.json(
                { error: 'Nothing has changed since the last update, and no summary is published yet.' },
                { status: 409 },
            )
        }

        const scope = { firmId: ctx.firmId, userId: user.id, feature: 'statusUpdate' as const }
        const client = await getGuardedAnthropic(scope)
        if (!client) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

        return await streamDraft({
            client,
            scope,
            system: STATUS_UPDATE_SYSTEM_PROMPT,
            user: buildStatusUpdatePrompt(inputs),
            effort: AI_EFFORT.draft,
            maxTokens: 2500,
            failure: BRIO_DRAFT_FAILED,
            label: 'status-update',
        })
    } catch (error) {
        return aiFailureResponse(error, BRIO_DRAFT_FAILED, 'AI status update error:')
    }
}
