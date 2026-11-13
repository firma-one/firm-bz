'use server'

import { createClient } from '@/utils/supabase/server'
import { resolveProjectContext } from '@/lib/resolve-project-context'
import { requireEngagementMember, isExternalEngagementRole } from '@/lib/engagement-access'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { loadReviewerView, type ExternalRole, type WaitingItem } from '@/lib/ai/reviewer-context'
import { reviewerBrioEnabled, reviewerAnswersToday, REVIEWER_DAILY_ANSWERS } from '@/lib/ai/reviewer-brio'

export interface WaitingOnMe {
    /** Whether the firm has turned Brio on for its portal: the Ask box shows only then. */
    brioEnabled: boolean
    answersLeftToday: number
    waiting: WaitingItem[]
}

/**
 * What is waiting on the signed-in Reviewer or Limited Access contributor, for the panel on their
 * Overview. No model call and no credit: the list is read straight from what they can see
 * (lib/ai/reviewer-context.ts). Null for firm roles, who have the engagement chat instead.
 */
export async function getWaitingOnMe(engagementId: string): Promise<ActionResult<WaitingOnMe | null>> {
    return asResult('getWaitingOnMe', async () => {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw userFacing('Sign in again to see this.', 'unauthorized')
        const ctx = await resolveProjectContext(engagementId)
        if (!ctx) throw userFacing('This engagement no longer exists.', 'not_found')
        const member = await requireEngagementMember(engagementId, user.id)
        if (!member) throw userFacing('This engagement no longer exists.', 'not_found')
        if (!isExternalEngagementRole(member.role)) return null

        const [view, enabled, used] = await Promise.all([
            loadReviewerView(engagementId, member.role as ExternalRole),
            reviewerBrioEnabled(ctx.firmId),
            reviewerAnswersToday(user.id),
        ])
        if (!view) throw userFacing('This engagement no longer exists.', 'not_found')
        return {
            brioEnabled: enabled,
            answersLeftToday: Math.max(0, REVIEWER_DAILY_ANSWERS - used),
            waiting: view.waiting,
        }
    })
}
