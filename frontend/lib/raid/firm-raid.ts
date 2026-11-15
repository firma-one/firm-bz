import 'server-only'
import { prisma } from '@/lib/prisma'
import { loadPeople } from '@/lib/files/file-creator'
import { engagementPath } from '@/lib/navigation/firm-paths'
import { findClientInPermissions, findFirmInPermissions, findProjectInPermissions } from '@/lib/permission-helpers'
import type { UserPermissions } from '@/lib/user-settings-plus'
import { compareRaid, firstNameOf, priorityOf, type FirmRaidOverview, type FirmRaidRow, type RaidPriority, type RaidType } from './raid-shared'

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

/**
 * Rows sent at most: the section shows the first few and "Show all" opens the rest in place. Beyond this, a
 * line says how many more and where they are, so one firm far behind can't make the Overview slow.
 */
export const FIRM_RAID_MAX_ROWS = 100

/**
 * The open Risks and Issues across `engagementIds`, from every source, as mock A lists them: raised in
 * threads and memos, and status and health ones (an overdue deliverable, an engagement behind pace) too.
 * The engagement Overview leaves those out because its Action Center shows them; the firm's Action Center
 * doesn't, so here they're the point (Deepak, 2026-11-14).
 */
export async function firmRaidOverview(engagementIds: string[], maxRows = FIRM_RAID_MAX_ROWS): Promise<FirmRaidOverview> {
    if (engagementIds.length === 0) return { counts: { openIssues: 0, openRisks: 0, high: 0, engagements: 0 }, rows: [], more: 0 }
    const items = await prisma.engagementRaidItem.findMany({
        where: { engagementId: { in: engagementIds }, status: 'OPEN', type: { in: ['RISK', 'ISSUE'] } },
        select: { id: true, type: true, title: true, ownerUserId: true, raisedAt: true, engagementId: true, priority: true },
    })
    // The log's one order (compareRaid): High first, issues before risks, then newest.
    const graded = items.map((i) => ({
        ...i,
        type: i.type as RaidType,
        priority: priorityOf({ type: i.type as RaidType, priority: i.priority as RaidPriority | null }) ?? 'MEDIUM',
        at: i.raisedAt.toISOString(),
    }))
    const raised = graded.sort((a, b) => compareRaid({ ...a, raisedAt: a.at }, { ...b, raisedAt: b.at }))
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
            priority: i.priority,
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
            high: graded.filter((i) => i.priority === 'HIGH').length,
            engagements: new Set(items.map((i) => i.engagementId)).size,
        },
        rows,
        more: Math.max(0, raised.length - rows.length),
    }
}
