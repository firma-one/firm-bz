'use server'

import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { logger } from '@/lib/logger'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { emailDomain, getDomainOnboardingOptions, type DomainOnboardingOptions } from '@/lib/onboarding/domain-options'

/*
 * Session-scoped domain-onboarding actions. The (userId, email) lookup they build on lives in
 * lib/onboarding/domain-options.ts (server-only), so it can't be called from the browser with
 * someone else's identity.
 */

export type { DomainOnboardingOptions, DomainOrgOption } from '@/lib/onboarding/domain-options'

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

    const { invalidateUserSettingsPlus } = await import('@/lib/permissions/invalidate-user-settings')
    await invalidateUserSettingsPlus(userId)

    audit(AUDIT_EVENT.ONBOARDING_DOMAIN_JOINED)
      .scope(AUDIT_SCOPE.FIRM)
      .firm(org.id)
      .actor(userId)
      .meta({ domain: emailDomain(user.email!) })
      .fireAndForget()

    return { ok: true, slug: org.slug }
}
