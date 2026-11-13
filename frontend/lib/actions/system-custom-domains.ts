'use server'

import { asResult, type ActionResult } from '@/lib/actions/action-result'
import { requireSystemAdmin } from '@/lib/auth/require-system-admin'
import {
    addDomainForGroup, approveDomain, checkDomainNow, listDomainsForSystem, rejectDomain,
    type SystemDomainFilter, type SystemDomainRow,
} from '@/lib/custom-domains/group-domains'
import type { ReachabilityResult } from '@/lib/custom-domains/reachability'

/**
 * /system/custom-domains: System Admins review custom-domain requests, set each one up on Vercel by
 * hand, check it answers, and approve or reject it. Every action checks for itself: the /system layout
 * only checks in the browser.
 */

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
