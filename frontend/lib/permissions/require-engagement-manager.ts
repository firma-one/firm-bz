import 'server-only'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'

/** Personas an engagement member or invitation may hold — never a firm or system persona. */
export const ENGAGEMENT_PERSONA_SLUGS = ['eng_admin', 'eng_member', 'eng_ext_collaborator', 'eng_viewer'] as const
export type EngagementPersonaSlug = (typeof ENGAGEMENT_PERSONA_SLUGS)[number]

export function isEngagementPersonaSlug(slug: string | null | undefined): slug is EngagementPersonaSlug {
    return !!slug && (ENGAGEMENT_PERSONA_SLUGS as readonly string[]).includes(slug)
}

/**
 * Gate for engagement member and invitation writes: invite, resend, revoke, change role, remove.
 *
 * Same rule as the engagement page's `canManage` (`project:can_manage`): the engagement's lead, a
 * manager of its client, or a firm admin. Every export of a 'use server' file is a callable
 * endpoint, so the actions resolve the engagement from the member or invitation they were given
 * and call this — the browser-side `canManage` only hides the buttons.
 *
 * Lives in a server-only module so it is never itself an endpoint.
 */
export async function requireEngagementManager(
    engagementId: string,
): Promise<{ userId: string; firmId: string; clientId: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const engagement = await prisma.engagement.findFirst({
        where: { id: engagementId, isDeleted: false },
        select: { clientId: true, client: { select: { firmId: true } } },
    })
    if (!engagement) throw new Error('Engagement not found')

    const { canManageProject } = await import('@/lib/permission-helpers')
    if (!(await canManageProject(engagement.client.firmId, engagement.clientId, engagementId))) {
        throw new Error('Insufficient permissions')
    }
    return { userId: user.id, firmId: engagement.client.firmId, clientId: engagement.clientId }
}
