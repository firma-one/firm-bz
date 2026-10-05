import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canViewProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { recordAiFeedback, isValidReason } from '@/lib/ai/feedback'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[projectId]/ai-feedback
 *
 * Records a thumbs up/down on one AI answer. Same permission boundary as the chat itself: internal
 * firm roles only, since external collaborators never see the assistant.
 *
 * Always returns 200 once authorised. Feedback is diagnostics — a failed write is logged and
 * swallowed rather than shown to someone who was trying to help.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> },
) {
    try {
        const { projectId } = await params

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const ctx = await resolveProjectContext(projectId)
        if (!ctx) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

        const [canView, canViewInternal] = await Promise.all([
            canViewProject(ctx.firmId, ctx.clientId, ctx.projectId),
            canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId),
        ])
        if (!canView || !canViewInternal) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const body = await request.json().catch(() => null) as {
            helpful?: unknown
            reason?: unknown
            question?: unknown
        } | null

        if (typeof body?.helpful !== 'boolean') {
            return NextResponse.json({ error: 'helpful must be true or false' }, { status: 400 })
        }

        await recordAiFeedback({
            firmId: ctx.firmId,
            engagementId: projectId,
            userId: user.id,
            feature: 'chat',
            helpful: body.helpful,
            // An unrecognised reason is dropped rather than rejected: the rating is the signal that
            // matters, and failing the request would lose it over a stale enum value.
            reason: isValidReason(body.reason) ? body.reason : null,
            question: typeof body.question === 'string' ? body.question : null,
        })

        return NextResponse.json({ ok: true })
    } catch (error) {
        logger.error('AI feedback error:', error as Error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
