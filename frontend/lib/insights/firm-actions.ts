import type { FirmInsightsResponse, IdleClientItem, PendingInviteItem, ProspectDecisionItem, UnansweredThreadItem } from '@/app/api/firms/[firmId]/insights/route'
import type { FirmEngagementRow } from './firm-engagement-pace'

/*
 * The firm Action Center's work (.claude/plans/firm-overview-redesign.md): only what the firm level
 * can act on, each item a thing to do. File checks live on each engagement's Action Center, and
 * personal reminders in the Inbox.
 */

export type SetupGap = 'lead' | 'due date' | 'deliverables'

export interface FirmActionEngagement {
    engagementId: string
    name: string
    slug: string
    clientName: string
    clientSlug: string
}

export interface FirmActionsData {
    /** Active engagements past their due date: extend it, or close the engagement. */
    overdueEngagements: Array<FirmActionEngagement & { daysOverdue: number }>
    /** Threads where the client wrote last: reply. */
    threads: UnansweredThreadItem[]
    /** Active engagements missing a lead, a due date or deliverables: finish setting them up. */
    setupGaps: Array<FirmActionEngagement & { missing: SetupGap[] }>
    /** Engagement invitations expired lately or expiring within 3 days: resend. */
    invitations: PendingInviteItem[]
    /** Active clients with no active engagement: start work, or mark the client past. */
    idleClients: IdleClientItem[]
    /** Prospects past their expected close date, or with none: convert, let go, or set a date. */
    prospects: ProspectDecisionItem[]
    currencySymbol: string
}

/** What an engagement still needs before it can be tracked. */
export function setupGapsOf(row: FirmEngagementRow): SetupGap[] {
    const missing: SetupGap[] = []
    if (!row.lead) missing.push('lead')
    if (!row.dueDate) missing.push('due date')
    if (row.deliverables.total === 0) missing.push('deliverables')
    return missing
}

/** The setup gaps of a list of engagements, the most incomplete first. */
export function setupGapsFrom(rows: FirmEngagementRow[]): FirmActionsData['setupGaps'] {
    return rows
        .map((r) => ({ engagementId: r.engagementId, name: r.name, slug: r.slug, clientName: r.clientName, clientSlug: r.clientSlug, missing: setupGapsOf(r) }))
        .filter((r) => r.missing.length > 0)
        .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name))
}

/** The Action Center's work, from the firm insights route. */
export function firmActionsFromInsights(d: FirmInsightsResponse): FirmActionsData {
    return {
        overdueEngagements: (d.engagementsDueSoon ?? [])
            .filter((e) => e.daysUntil < 0)
            .map((e) => ({ engagementId: e.engagementId, name: e.engagementName, slug: e.engagementSlug, clientName: e.clientName, clientSlug: e.clientSlug, daysOverdue: -e.daysUntil }))
            .sort((a, b) => b.daysOverdue - a.daysOverdue),
        threads: d.unansweredThreads ?? [],
        setupGaps: setupGapsFrom(d.engagementRows ?? []),
        invitations: d.invitationsToResend ?? [],
        idleClients: d.clientsWithoutEngagement ?? [],
        prospects: d.prospectsToDecide ?? [],
        currencySymbol: d.currencySymbol ?? '',
    }
}

/** How many kinds of work need doing: the plain number beside "Action Center". */
export function firmActionCount(a: FirmActionsData): number {
    return [a.overdueEngagements, a.threads, a.setupGaps, a.invitations, a.idleClients, a.prospects].filter((l) => l.length > 0).length
}
