'use server'

import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { logger } from '@/lib/logger'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

export interface DomainOrgOption {
    id: string
    name: string
    slug: string
}

export interface DomainOnboardingOptions {
    orgsToJoin: DomainOrgOption[]
    orgsAlreadyIn: DomainOrgOption[]
}

/**
 * Get domain onboarding options for current user (V2)
 */
export async function getDomainOnboardingOptionsForCurrentUser(): Promise<DomainOnboardingOptions | null> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user?.email) {
        redirect('/signin')
    }
    return getDomainOnboardingOptions(user.id, user.email)
}

function emailDomain(email: string): string | null {
    const part = email.split('@')[1]
    return part ? part.toLowerCase().trim() : null
}

/**
 * Get orgs by domain (V2)
 */
export async function getDomainOnboardingOptions(
    userId: string,
    userEmail: string
): Promise<DomainOnboardingOptions> {
    const domain = emailDomain(userEmail)
    if (!domain) return { orgsToJoin: [], orgsAlreadyIn: [] }

    const orgs = await prisma.firm.findMany({
        where: {
            allowDomainAccess: true,
            allowedEmailDomain: domain
        },
        select: { id: true, name: true, slug: true }
    })

    if (orgs.length === 0) return { orgsToJoin: [], orgsAlreadyIn: [] }

    const memberships = await prisma.firmMember.findMany({
        where: {
            userId,
            firmId: { in: orgs.map((o: { id: string }) => o.id) }
        },
        select: { firmId: true }
    })
    const inSet = new Set(memberships.map((m) => m.firmId))

    const orgsAlreadyIn: DomainOrgOption[] = []
    const orgsToJoin: DomainOrgOption[] = []
    for (const org of orgs) {
        const option = { id: org.id, name: org.name, slug: org.slug }
        if (inSet.has(org.id)) orgsAlreadyIn.push(option)
        else orgsToJoin.push(option)
    }

    return { orgsToJoin, orgsAlreadyIn }
}

/**
 * Join org by domain (V2)
 */
export async function joinOrganizationByDomain(
    organizationId: string
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user?.email) {
        return { ok: false, error: 'Unauthorized' }
    }
    const userId = user.id
    const domain = emailDomain(user.email)
    if (!domain) {
        return { ok: false, error: 'Invalid email' }
    }

    const org = await prisma.firm.findUnique({
        where: { id: organizationId },
        select: { id: true, slug: true, allowDomainAccess: true, allowedEmailDomain: true }
    })
    if (!org) {
        return { ok: false, error: 'Organization not found' }
    }
    if (!org.allowDomainAccess || (org.allowedEmailDomain || '').toLowerCase() !== domain) {
        return { ok: false, error: 'Domain not allowed' }
    }

    const existing = await prisma.firmMember.findFirst({
        where: { firmId: organizationId, userId }
    })
    if (existing) {
        return { ok: true, slug: org.slug }
    }

    const hasAnyOrg = await prisma.firmMember.findFirst({
        where: { userId },
        select: { id: true }
    })

    await prisma.firmMember.create({
        data: {
            userId,
            firmId: org.id,
            role: 'firm_member',
            membershipType: 'external',
            isDefault: !hasAnyOrg
        }
    })

    const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
    await invalidateUserSettingsPlus(userId)

    audit(AUDIT_EVENT.ONBOARDING_DOMAIN_JOINED)
      .scope(AUDIT_SCOPE.FIRM)
      .firm(org.id)
      .actor(userId)
      .meta({ domain: emailDomain(user.email!) })
      .fireAndForget()

    return { ok: true, slug: org.slug }
}
