import 'server-only'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { canEditProject, canViewProjectInternalTabs } from '@/lib/permission-helpers'
import { ROLE_NAME } from '@/lib/persona-ui-groups'
import { StorageFailure } from '@/lib/connectors/storage-failure'
import { UserFacingError } from '@/lib/actions/action-result'
import { resolveNames } from '@/lib/auth/display-name'
import { logger } from '@/lib/logger'

/**
 * Who may see and add internal memos: a Lead or a Contributor · Full Access, as for the notes route
 * (`project:can_edit` together with `project:can_view_internal`). Edit alone would admit a Contributor
 * · Limited Access, and memos are internal; a Reviewer has neither.
 */
export async function memoRouteAccess(projectId: string): Promise<
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
    if (!canEdit || !canViewInternal) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: `Internal memos are for a ${ROLE_NAME.eng_admin} or a ${ROLE_NAME.eng_member} only.` },
                { status: 403 },
            ),
        }
    }
    return { ok: true, user, ctx: { firmId: ctx.firmId, clientId: ctx.clientId, projectId: ctx.projectId } }
}

/** The memo's byline: the person's name as the app shows it, and their first name for the card. */
export function memoAuthor(user: Pick<User, 'id' | 'email' | 'user_metadata'>): { userId: string; name: string; firstName: string } {
    const names = resolveNames(user.user_metadata as Record<string, unknown> | undefined, user.email)
    const name = names.displayName || user.email?.split('@')[0] || ''
    return { userId: user.id, name, firstName: names.firstName || name.split(' ')[0] || '' }
}

const STATUS_FOR_CODE: Record<string, number> = {
    plan_limit: 403,
    gone: 404,
    no_connector: 409,
    no_folder: 409,
    no_adapter: 409,
}

/** A failed memo request in words a person can act on: storage's reason, or ours. Never "Failed to X". */
export function memoFailureResponse(error: unknown, context: string, fallback: string): NextResponse {
    if (error instanceof StorageFailure) {
        return NextResponse.json({ error: error.message, code: error.reason }, { status: error.status })
    }
    if (error instanceof UserFacingError) {
        return NextResponse.json({ error: error.message, code: error.code }, { status: STATUS_FOR_CODE[error.code ?? ''] ?? 400 })
    }
    logger.error(context, error as Error)
    return NextResponse.json({ error: fallback }, { status: 500 })
}
