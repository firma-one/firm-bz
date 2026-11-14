import 'server-only'
import { prisma } from '@/lib/prisma'
import { loadPeople } from '@/lib/files/file-creator'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { findClientInPermissions, findFirmInPermissions, findProjectInPermissions } from '@/lib/permission-helpers'
import type { UserPermissions } from '@/lib/user-settings-plus'
import { firstNameOf, isConversationSource, type FirmRaidOverview, type FirmRaidRow } from './raid-shared'

/**
 * The Firm Overview's open risks and issues (.claude/plans/brio-features-round-2.md, §14): across the
 * firm's engagements, only those whose RAID log the person may see, as the RAID tab decides it.
 */

/**
 * Whether the person may read this engagement's RAID log, decided as the RAID tab decides it
 * (raidRouteAccess: `project:can_edit` with `project:can_view_internal`, through checkProjectPermission):
 * their role on the engagement when they have one, so a Lead and a Contributor · Full Access yes, a
 * Contributor · Limited Access and a Reviewer no; otherwise a firm admin or the client's manager, yes.
 * From the permissions already loaded, without checkProjectPermission's database fallback for a cache
 * that hasn't caught up: the list only ever shows less, never more.
 */
export function mayReadRaid(permissions: UserPermissions, firmId: string, clientId: string, engagementId: string): boolean {
    const project = findProjectInPermissions(permissions, firmId, clientId, engagementId)
    if (project) {
        const scopes = project.scopes['project'] ?? []
        return scopes.includes('can_edit') && scopes.includes('can_view_internal')
    }
    if (findFirmInPermissions(permissions, firmId)?.personas.includes('firm_admin')) return true
    return !!findClientInPermissions(permissions, firmId, clientId)?.scopes?.client?.includes('can_manage')
}

/**
 * The engagements in `firmId` whose RAID log the person may see (mayReadRaid). Completed and deleted ones
 * are left out: nothing in them is still to deal with.
 */
export async function firmRaidEngagementIds(firmId: string, permissions: UserPermissions): Promise<string[]> {
    if (!findFirmInPermissions(permissions, firmId)) return []
    const engagements = await prisma.engagement.findMany({
        where: { firmId, deletedAt: null, status: { not: 'COMPLETED' } },
        select: { id: true, clientId: true },
    })
    return engagements.filter((e) => mayReadRaid(permissions, firmId, e.clientId, e.id)).map((e) => e.id)
}

/** Issues before risks, then newest first: what a reader acts on first. */
const ORDER: Record<'ISSUE' | 'RISK', number> = { ISSUE: 0, RISK: 1 }

/**
 * The open Risks and Issues across `engagementIds`. All are counted; the rows are those raised in
 * conversation (threads and memos), as on the engagement Overview: status and health entries are what the
 * Action Center above already shows, and stay in each engagement's log.
 */
export async function firmRaidOverview(engagementIds: string[], maxRows = 5): Promise<FirmRaidOverview> {
    if (engagementIds.length === 0) return { counts: { openIssues: 0, openRisks: 0, engagements: 0 }, rows: [], more: 0 }
    const items = await prisma.engagementRaidItem.findMany({
        where: { engagementId: { in: engagementIds }, status: 'OPEN', type: { in: ['RISK', 'ISSUE'] } },
        select: { id: true, type: true, title: true, ownerUserId: true, sourceKind: true, raisedAt: true, engagementId: true },
    })
    const raised = items
        .filter((i) => isConversationSource(i.sourceKind))
        .sort((a, b) => (ORDER[a.type as 'ISSUE' | 'RISK'] - ORDER[b.type as 'ISSUE' | 'RISK']) || b.raisedAt.getTime() - a.raisedAt.getTime())
    const shown = raised.slice(0, maxRows)

    const [engagements, people] = await Promise.all([
        prisma.engagement.findMany({
            where: { id: { in: Array.from(new Set(shown.map((i) => i.engagementId))) } },
            select: {
                id: true,
                name: true,
                slug: true,
                client: { select: { name: true, slug: true, firm: { select: { slug: true, group: { select: { slug: true } } } } } },
            },
        }),
        loadPeople(shown.map((i) => i.ownerUserId).filter((id): id is string => !!id)),
    ])
    const byId = new Map(engagements.map((e) => [e.id, e]))

    const rows = shown.flatMap((i): FirmRaidRow[] => {
        const e = byId.get(i.engagementId)
        const groupSlug = e?.client?.firm?.group?.slug
        if (!e || !e.client || !groupSlug) return []
        return [{
            id: i.id,
            type: i.type as FirmRaidRow['type'],
            title: i.title,
            ownerFirstName: i.ownerUserId ? firstNameOf(people.get(i.ownerUserId)?.name) : null,
            raisedAt: i.raisedAt.toISOString(),
            engagement: {
                name: e.name,
                clientName: e.client.name,
                href: engagementPath(groupSlug, e.client.firm.slug, e.client.slug, e.slug, { tab: 'raid' }),
            },
        }]
    })

    return {
        counts: {
            openIssues: items.filter((i) => i.type === 'ISSUE').length,
            openRisks: items.filter((i) => i.type === 'RISK').length,
            engagements: new Set(items.map((i) => i.engagementId)).size,
        },
        rows,
        more: Math.max(0, raised.length - rows.length),
    }
}
