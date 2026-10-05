import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Recent activity for one engagement, summarised from the audit log for the AI chat.
 *
 * ## What this sends, and what it deliberately does not
 *
 * Audit rows carry a `metadata` JSON blob whose keys include `fileName`, `name`, `description`,
 * `email` and `tags` — user-authored text and personal data. **None of it is sent.** Only the
 * `eventType` (a fixed vocabulary from `AUDIT_EVENT_TYPES`), timestamps, and counts leave this
 * module.
 *
 * That is the same boundary the engagement context already holds for comment bodies: everything
 * the model sees about an engagement is counts and statuses, never prose a user wrote. Audit
 * metadata is the larger risk of the two because it is written by whoever uploaded the file —
 * a document named "ignore previous instructions and ..." would otherwise reach the model as
 * apparent system text.
 *
 * So the chat can answer "has anything happened recently?", "when was the last activity?" and
 * "how much has changed this week?" — without being able to quote a filename.
 */

/**
 * How far back the chat may summarise engagement activity, in days.
 *
 * **The single place to change this window.** Exported so the value is adjustable from one spot
 * and assertable in tests, rather than being a number buried in a query.
 *
 * Deliberately short: "what has happened recently" is the question this answers, and a month is
 * long enough for it. Widening it costs context length on every question and makes the summary
 * less about *recent* activity, so raise it only with a reason.
 *
 * This is a CEILING, not the retention policy. The firm's own `entitledAuditDays` is enforced at
 * write time by `purgeStaleAuditEvents` (lib/audit/emit.ts), which deletes older rows on every
 * audit emit — so a firm entitled to less than this simply has no older rows for the query to
 * find, and one entitled to more still only gets this window here.
 */
export const ACTIVITY_LOOKBACK_DAYS = 30

/** Event types collapsed into plain-language groups, so the model is not reading enum keys. */
const EVENT_GROUPS: Array<{ match: RegExp; label: string }> = [
    { match: /^DOCUMENT_CREATED$/, label: 'documents added' },
    { match: /^DOCUMENT_DELETED$/, label: 'documents deleted' },
    { match: /^DOCUMENT_SHARE_(CREATED|CHANGED)$/, label: 'deliverable sharing changes' },
    { match: /^DOCUMENT_/, label: 'other document changes' },
    { match: /^ENGAGEMENT_CREATED$/, label: 'engagement created' },
    { match: /^ENGAGEMENT_/, label: 'engagement settings changed' },
    { match: /^CLIENT_/, label: 'client record changes' },
    { match: /^(MEMBER|INVITATION)_/, label: 'membership changes' },
    { match: /^STORAGE_CONNECTOR_/, label: 'storage connector changes' },
    { match: /^COMMENT_/, label: 'comment activity' },
]

function groupFor(eventType: string): string {
    return EVENT_GROUPS.find((g) => g.match.test(eventType))?.label ?? 'other activity'
}

function daysAgo(from: Date): number {
    const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
    const now = new Date()
    const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    return Math.round((b - a) / 86_400_000)
}

/**
 * Renders a short activity summary, or null when there is nothing to report.
 *
 * Returns null rather than throwing on a query failure: activity is enrichment, and the chat must
 * still answer from the rest of the snapshot if the audit table is unavailable.
 */
export async function buildEngagementActivity(engagementId: string): Promise<string | null> {
    try {
        // No entitlement check here: `purgeStaleAuditEvents` (lib/audit/emit.ts) deletes rows older
        // than the firm's `entitledAuditDays` on every write, so the table itself cannot hold
        // history the plan does not cover. Re-checking the entitlement would duplicate a guarantee
        // the data layer already makes, and would silently shrink to zero if that lookup failed.
        const windowDays = ACTIVITY_LOOKBACK_DAYS
        const since = new Date(Date.now() - windowDays * 86_400_000)

        const [grouped, latest, distinctActors] = await Promise.all([
            prisma.platformAuditEvent.groupBy({
                by: ['eventType'],
                where: { engagementId, eventAt: { gte: since } },
                _count: { _all: true },
            }),
            prisma.platformAuditEvent.findFirst({
                where: { engagementId },
                orderBy: { eventAt: 'desc' },
                // eventAt only — no metadata, no actor identity.
                select: { eventAt: true, eventType: true },
            }),
            prisma.platformAuditEvent.findMany({
                where: { engagementId, eventAt: { gte: since }, actorUserId: { not: null } },
                distinct: ['actorUserId'],
                select: { actorUserId: true },
            }),
        ])

        if (!latest) return null

        // Collapse event types into labelled groups and total them.
        const byGroup = new Map<string, number>()
        let total = 0
        for (const row of grouped) {
            const n = row._count._all
            total += n
            const label = groupFor(row.eventType)
            byGroup.set(label, (byGroup.get(label) ?? 0) + n)
        }

        const lines: string[] = ['Recent activity (from the engagement audit log):']

        const lastDays = daysAgo(latest.eventAt)
        lines.push(`  Last recorded activity: ${lastDays === 0 ? 'today' : `${lastDays} day${lastDays === 1 ? '' : 's'} ago`}`
            + ` (${groupFor(latest.eventType)}).`)

        if (total === 0) {
            lines.push(`  No recorded activity in the last ${windowDays} days.`)
        } else {
            const parts = Array.from(byGroup.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([label, n]) => `${n} ${label}`)
            lines.push(`  Last ${windowDays} days: ${total} recorded event${total === 1 ? '' : 's'} — ${parts.join(', ')}.`)
            if (distinctActors.length > 0) {
                lines.push(`  ${distinctActors.length} distinct ${distinctActors.length === 1 ? 'person' : 'people'} made those changes`
                    + ' (identities are not in this snapshot).')
            }
        }

        lines.push('  Event names and counts only — file names, descriptions and the people involved'
            + ' are NOT included, so describe what kind of activity happened, never what was named.')

        return lines.join('\n')
    } catch (error) {
        logger.error('Failed to build engagement activity summary:', error as Error)
        return null
    }
}
