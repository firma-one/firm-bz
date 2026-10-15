import 'server-only'

import { prisma } from '@/lib/prisma'

/*
 * Domain-onboarding lookup for an explicit user. Server-only — as a server action it would let any
 * signed-in user pass another user's id and email and learn which firms that domain can join.
 * Callers: getDomainOnboardingOptionsForCurrentUser (session), the landing resolver, and
 * /api/onboarding/domain-options (session).
 */

export interface DomainOrgOption {
    id: string
    name: string
    slug: string
}

export interface DomainOnboardingOptions {
    orgsToJoin: DomainOrgOption[]
    orgsAlreadyIn: DomainOrgOption[]
}

export function emailDomain(email: string): string | null {
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
