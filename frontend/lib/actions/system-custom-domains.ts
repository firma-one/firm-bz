'use server'

import { asResult, type ActionResult } from '@/lib/actions/action-result'
import { requireSystemAdmin as requireSystemAdminRaw } from '@/lib/auth/require-system-admin'
import { userFacing } from '@/lib/actions/action-result'
import {
    addDomainForGroup, approveDomain, checkDomainNow, listDomainsForSystem, rejectDomain,
    type SystemDomainFilter, type SystemDomainRow,
} from '@/lib/custom-domains/group-domains'
import type { ReachabilityResult } from '@/lib/custom-domains/reachability'
import { listFirmGroups } from '@/lib/system/firm-group-list'
import { prisma } from '@/lib/prisma'
import { kindsForPlan, LIVE_STATUSES } from '@/lib/custom-domains/domain-rules'

export type DomainGroupOption = {
    slug: string
    name: string
    plan: string | null
    adminEmail: string | null
    /** The requested or approved domain it already has: such a group can't be given another. */
    liveHost: string | null
    /** What its plan includes, from /pricing. Shown, not enforced: a System Admin may assign either. */
    planIncludes: { SUBDOMAIN: boolean; CUSTOM: boolean }
}

/**
 * /system/custom-domains: System Admins review custom-domain requests, set each one up on Vercel by
 * hand, check it answers, and approve or reject it. Every action checks for itself: the /system layout
 * only checks in the browser.
 */

/** requireSystemAdmin, but its refusal reads as words rather than "Something went wrong". */
async function requireSystemAdmin(): Promise<{ userId: string }> {
    try {
        return await requireSystemAdminRaw()
    } catch {
        throw userFacing('Only Firma System Admins can manage custom domains. Sign in again if you are one.', 'forbidden')
    }
}

export async function listCustomDomains(filter: SystemDomainFilter): Promise<ActionResult<{ rows: SystemDomainRow[]; counts: Record<'waiting' | 'live' | 'unreachable', number> }>> {
    return asResult('listCustomDomains', async () => {
        await requireSystemAdmin()
        return listDomainsForSystem(filter)
    })
}

export async function checkCustomDomain(domainId: string): Promise<ActionResult<ReachabilityResult>> {
    return asResult('checkCustomDomain', async () => {
        await requireSystemAdmin()
        return checkDomainNow(domainId)
    })
}

export async function approveCustomDomain(domainId: string, note: string): Promise<ActionResult<void>> {
    return asResult('approveCustomDomain', async () => {
        const { userId } = await requireSystemAdmin()
        await approveDomain(userId, domainId, note)
    })
}

export async function rejectCustomDomain(domainId: string, note: string): Promise<ActionResult<void>> {
    return asResult('rejectCustomDomain', async () => {
        const { userId } = await requireSystemAdmin()
        await rejectDomain(userId, domainId, note)
    })
}

export async function addCustomDomainForGroup(groupSlug: string, kind: string, value: string): Promise<ActionResult<void>> {
    return asResult('addCustomDomainForGroup', async () => {
        const { userId } = await requireSystemAdmin()
        await addDomainForGroup(userId, groupSlug, kind === 'CUSTOM' ? 'CUSTOM' : 'SUBDOMAIN', value)
    })
}

/** Every workspace, for "Add for a group": name, slug, plan, admin and any domain it already has. */
export async function listGroupsForCustomDomains(): Promise<ActionResult<DomainGroupOption[]>> {
    return asResult('listGroupsForCustomDomains', async () => {
        await requireSystemAdmin()
        const [{ rows }, live] = await Promise.all([
            listFirmGroups(),
            prisma.groupDomain.findMany({ where: { status: { in: LIVE_STATUSES } }, select: { groupId: true, host: true } }),
        ])
        const hostByGroup = new Map(live.map((d) => [d.groupId, d.host]))
        return rows
            .map((g) => ({
                slug: g.slug,
                name: g.name,
                plan: g.plan,
                adminEmail: g.admin?.email ?? null,
                liveHost: hostByGroup.get(g.groupId) ?? null,
                planIncludes: kindsForPlan(g.plan),
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
    })
}
