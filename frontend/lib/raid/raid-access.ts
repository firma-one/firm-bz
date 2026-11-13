import 'server-only'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canEditProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { ROLE_NAME } from '@/lib/persona-ui-groups'
import { UserFacingError } from '@/lib/actions/action-result'
import { logger } from '@/lib/logger'

export const RAID_FORBIDDEN = `The RAID log is for a ${ROLE_NAME.eng_admin} or a ${ROLE_NAME.eng_member} only.`

/**
 * Who may read and change the RAID log: a Lead or a Contributor · Full Access, as for internal memos
 * (`project:can_edit` together with `project:can_view_internal`). Edit alone would admit a Contributor ·
 * Limited Access, and the log is internal; a Reviewer has neither. Every RAID route asks here first.
 */
export async function raidRouteAccess(projectId: string): Promise<
    | { ok: true; user: User; ctx: { firmId: string; clientId: string; projectId: string } }
    | { ok: false; response: NextResponse }
> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, response: NextResponse.json({ error: 'Your session has ended. Sign in again.' }, { status: 401 }) }

    const ctx = await resolveProjectContext(projectId)
    if (!ctx) {
        return { ok: false, response: NextResponse.json({ error: 'This engagement was not found, or you no longer have access.' }, { status: 404 }) }
    }

    const [canEdit, canViewInternal] = await Promise.all([
        canEditProject(ctx.firmId, ctx.clientId, ctx.projectId),
        canViewProjectInternalTabs(ctx.firmId, ctx.clientId, ctx.projectId),
    ])
    if (!canEdit || !canViewInternal) return { ok: false, response: NextResponse.json({ error: RAID_FORBIDDEN }, { status: 403 }) }
    return { ok: true, user, ctx: { firmId: ctx.firmId, clientId: ctx.clientId, projectId: ctx.projectId } }
}

/** A failed RAID request in words a person can act on: ours when we wrote them, never a raw error. */
export function raidFailureResponse(error: unknown, context: string, fallback: string): NextResponse {
    if (error instanceof UserFacingError) {
        const status = error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : 400
        return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    logger.error(context, error as Error)
    return NextResponse.json({ error: fallback }, { status: 500 })
}
