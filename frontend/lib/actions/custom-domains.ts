'use server'

import { asResult, type ActionResult } from '@/lib/actions/action-result'
import { signedOut } from '@/lib/actions/action-reasons'
import { getSessionUser } from '@/lib/auth/session-user'
import {
    cancelRequest, checkAvailability, getGroupDomainState, groupOfFirm, isGroupAdmin, removeDomain, requestDomain,
    type Availability, type DomainRow, type GroupDomainState,
} from '@/lib/custom-domains/group-domains'
import type { DomainKind } from '@/lib/custom-domains/domain-rules'

/**
 * Billing's "Custom domain" section (components/billing/custom-domain-section.tsx). Each action names a
 * firm, as Billing does, and works on that firm's Group; only its GROUP_ADMIN may see or change the
 * domain. The user always comes from the session (server actions take no user id).
 */

async function sessionUserId(): Promise<string> {
    const user = await getSessionUser()
    if (!user) throw signedOut()
    return user.id
}

export type CustomDomainView = { canManage: false } | ({ canManage: true } & GroupDomainState)

export async function getCustomDomainState(firmId: string): Promise<ActionResult<CustomDomainView>> {
    return asResult('getCustomDomainState', async () => {
        const userId = await sessionUserId()
        const group = await groupOfFirm(firmId)
        if (!(await isGroupAdmin(userId, group.id))) return { canManage: false as const }
        return { canManage: true as const, ...(await getGroupDomainState(group.id)) }
    })
}

function asKind(kind: string): DomainKind {
    return kind === 'CUSTOM' ? 'CUSTOM' : 'SUBDOMAIN'
}

export async function checkCustomDomainName(firmId: string, kind: string, value: string): Promise<ActionResult<Availability>> {
    return asResult('checkCustomDomainName', async () => {
        const userId = await sessionUserId()
        const group = await groupOfFirm(firmId)
        if (!(await isGroupAdmin(userId, group.id))) return { ok: false as const, reason: 'format' as const, message: 'Only the workspace admin can change its domain.' }
        return checkAvailability(group.id, asKind(kind), value)
    })
}

export async function requestCustomDomain(firmId: string, kind: string, value: string): Promise<ActionResult<DomainRow>> {
    return asResult('requestCustomDomain', async () => {
        const userId = await sessionUserId()
        const group = await groupOfFirm(firmId)
        return requestDomain(userId, group.id, asKind(kind), value)
    })
}

export async function cancelCustomDomainRequest(firmId: string): Promise<ActionResult<void>> {
    return asResult('cancelCustomDomainRequest', async () => {
        const userId = await sessionUserId()
        const group = await groupOfFirm(firmId)
        await cancelRequest(userId, group.id)
    })
}

export async function removeCustomDomain(firmId: string): Promise<ActionResult<void>> {
    return asResult('removeCustomDomain', async () => {
        const userId = await sessionUserId()
        const group = await groupOfFirm(firmId)
        await removeDomain(userId, group.id)
    })
}
