'use server'

import { createClient } from '@/utils/supabase/server'
import { FirmService } from '@/lib/firm-service'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import {
    canCreateNonSandboxFirm,
    requireNonSandboxFirmCreationAccess,
    resolveBillingAnchorForNewSatelliteFirm,
} from '@/lib/billing/firm-creation-gate'
import { buildDefaultSandboxFirmName } from '@/lib/onboarding/sandbox-firm-name'
import { isWorkspaceOnboardingComplete } from '@/lib/onboarding/workspace-onboarding-complete'
import { SANDBOX_FIRM_NAME_FALLBACK } from '@/lib/services/sample-file-service'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

export interface FirmOption {
    id: string
    name: string
    slug: string
    isDefault: boolean
    createdAt: string
    sandboxOnly: boolean
}

export interface CreateFirmData {
    name: string
    allowDomainAccess?: boolean
    allowedEmailDomain?: string | null
}

/**
 * Get all firms that the current user belongs to
 */
export async function getUserFirms(): Promise<FirmOption[]> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
        redirect('/signin')
    }

    const user = session.user

    try {
        const firms = await FirmService.getUserFirms(user.id)
        const firstName =
            String(user.user_metadata?.first_name || '').trim() ||
            String(user.user_metadata?.full_name || '').trim().split(/\s+/).filter(Boolean)[0] ||
            String(user.email || '').split('@')[0] ||
            ''
        const desiredSandboxName = buildDefaultSandboxFirmName(firstName, SANDBOX_FIRM_NAME_FALLBACK)
        const isLegacySandboxName = (name: string) => {
            const normalized = String(name || '').trim().toLowerCase()
            return (
                normalized === 'pockett inc' ||
                normalized === 'sandbox firm' ||
                normalized === SANDBOX_FIRM_NAME_FALLBACK.trim().toLowerCase()
            )
        }

        for (const firm of firms as any[]) {
            const membership = firm.members?.find((m: any) => m.userId === user.id)
            if (!firm?.sandboxOnly) continue
            if (membership?.role !== 'firm_admin') continue
            if (!isLegacySandboxName(firm.name)) continue
            if ((firm.name || '').trim() === desiredSandboxName) continue
            try {
                await prisma.firm.update({
                    where: { id: firm.id },
                    data: { name: desiredSandboxName, updatedBy: user.id },
                })
                firm.name = desiredSandboxName
            } catch (e) {
                logger.warn('Could not normalize legacy sandbox firm name', {
                    firmId: firm.id,
                    message: e instanceof Error ? e.message : String(e),
                })
            }
        }

        return firms.map((firm: any) => {
            // Find the current user's membership to check isDefault
            const membership = firm.members.find((m: any) => m.userId === user.id)

            return {
                id: firm.id,
                name: firm.name,
                slug: firm.slug,
                isDefault: membership?.isDefault || false,
                createdAt: (firm.createdAt || new Date()).toISOString(),
                sandboxOnly: firm.sandboxOnly || false
            }
        })
    } catch (err) {
        logger.error('Error fetching user firms (V2)', err as Error)
        return []
    }
}

/**
 * Whether the signed-in user may create another non-sandbox firm
 * (at least one membership on a firm with active or trialing subscription).
 */
export async function getCanCreateAdditionalFirm(): Promise<boolean> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return false
    return canCreateNonSandboxFirm(user.id)
}

/**
 * Get the default firm slug for the current user
 */
export async function getDefaultFirmSlug(): Promise<string | null> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return null
    }

    const defaultFirm = await FirmService.getDefaultFirm(user.id)
    return defaultFirm?.slug || null
}

/**
 * Get default firm slug and whether its onboarding is complete.
 */
export async function getDefaultFirmWithOnboardingStatus(): Promise<{
    slug: string | null
    onboardingComplete: boolean
}> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { slug: null, onboardingComplete: false }

    const defaultFirm = await FirmService.getDefaultFirm(user.id)
    const slug = defaultFirm?.slug ?? null

    const onboardingComplete = defaultFirm
        ? await isWorkspaceOnboardingComplete({
              id: defaultFirm.id,
              settings: defaultFirm.settings,
              connectorId: defaultFirm.connectorId ?? null,
          })
        : false

    return { slug, onboardingComplete }
}

/**
 * Where to send the user when entering the app at `/d` (and when auth callback has no explicit `next`).
 * Invited non-admins go straight to `/d/f/{slug}`; firm admins must finish workspace onboarding
 * (connector `settings.onboarding` + org folder map; legacy `firm.settings.onboarding`) before landing
 * in the default workspace — same rules as `auth/callback`.
 * Returns `null` only if the resolved firm has no slug (malformed data); caller may show a firm picker.
 */
export async function resolveDefaultFirmLandingPath(userId: string): Promise<string | null> {
    let targetFirm = await FirmService.getDefaultFirm(userId)
    if (!targetFirm) {
        const all = await FirmService.getUserFirms(userId)
        if (all.length === 0) return '/d/onboarding'
        targetFirm = all[0]
    }

    if (!targetFirm?.slug) return null

    const membership = targetFirm.members.find((m) => m.userId === userId)
    const isFirmAdmin = membership?.role === 'firm_admin'

    if (!isFirmAdmin) {
        return `/d/f/${targetFirm.slug}`
    }

    const onboardingComplete = await isWorkspaceOnboardingComplete({
        id: targetFirm.id,
        settings: targetFirm.settings,
        connectorId: targetFirm.connectorId ?? null,
    })

    if (!onboardingComplete) {
        return '/d/onboarding'
    }

    return `/d/f/${targetFirm.slug}`
}

/**
 * True when the user is a firm admin who must finish workspace onboarding before billing flows.
 * Matches `resolveDefaultFirmLandingPath` → `/d/onboarding`.
 */
export async function firmAdminMustCompleteOnboarding(): Promise<boolean> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user?.id) return false
    const path = await resolveDefaultFirmLandingPath(user.id)
    return path === '/d/onboarding'
}

/**
 * Create a new firm for the current user
 */
export async function createFirm(data: CreateFirmData): Promise<FirmOption> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user || !user.email) {
        throw new Error('Unauthorized')
    }

    await requireNonSandboxFirmCreationAccess(user.id)

    const billingAnchorId = await resolveBillingAnchorForNewSatelliteFirm(user.id)
    if (!billingAnchorId) {
        throw new Error('Could not attach your new firm to a billing subscription. Please try again.')
    }

    const billingAnchor = await prisma.firm.findUnique({
        where: { id: billingAnchorId },
        select: {
            id: true,
            connectorId: true,
            connector: { select: { id: true, status: true, settings: true } },
        },
    })
    if (!billingAnchor?.connectorId || billingAnchor.connector?.status !== 'ACTIVE') {
        throw new Error('Billing anchor has no active Google Drive connector. Reconnect Drive in your sandbox firm first.')
    }

    const existingFirm = await prisma.firm.findFirst({
        where: {
            name: {
                equals: data.name,
                mode: 'insensitive'
            }
        }
    })

    if (existingFirm) {
        throw new Error('A firm with this name already exists')
    }

    const fullName = user.user_metadata?.full_name || ''
    const nameParts = fullName.split(' ')
    const firstName = nameParts[0] || user.email.split('@')[0]
    const lastName = nameParts.slice(1).join(' ') || ''

    // Create firm + membership (V2)
    const firm = await FirmService.createFirmWithMember({
        firmName: data.name,
        userId: user.id,
        email: user.email,
        firstName,
        lastName,
        connectorId: billingAnchor.connectorId,
        allowDomainAccess: data.allowDomainAccess,
        allowedEmailDomain: data.allowedEmailDomain,
        billingSharesSubscriptionFromFirmId: billingAnchorId,
    })

    const driveRootFolderId = await googleDriveConnector.resolveWorkspaceRootFolderId(billingAnchor.connectorId)
    try {
        await googleDriveConnector.setupOrgFolder(
            billingAnchor.connectorId,
            driveRootFolderId,
            firm.id,
            user.id
        )
    } catch (driveError) {
        logger.error('Failed to create Drive folder for new custom firm', driveError as Error)
        throw new Error('Created firm, but failed to create its Google Drive folder. Please retry.')
    }

    // Set as default
    await FirmService.setDefaultFirm(user.id, firm.id)

    audit(AUDIT_EVENT.FIRM_CREATED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firm.id)
        .actor(user.id)
        .meta({ name: firm.name, slug: firm.slug })
        .fireAndForget()

    // Invalidate cache
    const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
    await invalidateUserSettingsPlus(user.id)

    revalidatePath('/d')

    return {
        id: firm.id,
        name: firm.name,
        slug: firm.slug,
        isDefault: true,
        createdAt: new Date().toISOString(),
        sandboxOnly: false
    }
}

/**
 * Switch to a different firm
 */
export async function switchFirm(firmSlug: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error('Unauthorized')
    }

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        include: {
            members: {
                where: { userId: user.id }
            }
        }
    })

    if (!firm || firm.members.length === 0) {
        throw new Error('You do not have access to this firm')
    }

    await FirmService.setDefaultFirm(user.id, firm.id)

    try {
        const { createAdminClient } = await import('@/utils/supabase/admin')
        const admin = createAdminClient()

        const personaSlug = firm.members[0]?.role || 'firm_member'

        logger.info('Updating JWT metadata for firm switch', { userId: user.id, firmId: firm.id, persona: personaSlug })

        await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
                ...user.user_metadata,
            },
            app_metadata: mergeLeanAppMetadata(user.app_metadata as Record<string, unknown>, {
                active_firm_id: firm.id,
                active_firm_slug: firmSlug,
                active_persona: personaSlug,
            }),
        })
    } catch (jwtError) {
        logger.error('Failed to update JWT metadata during org switch', jwtError as Error)
        // We don't throw here to avoid blocking the switch if metadata update fails, 
        // but the user might experience stale permissions until next refresh.
    }

    // Invalidate cache
    const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
    await invalidateUserSettingsPlus(user.id)
}

export interface FirmBranding {
    logoUrl?: string | null
    subtext?: string | null
    themeColor?: string | null
}

export interface FirmCurrency {
    symbol?: string | null
    code?: string | null
}

/**
 * Update firm. Firm admin only.
 */
export async function updateFirm(
    firmSlug: string,
    data: { name?: string; branding?: FirmBranding; currency?: FirmCurrency }
): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true, settings: true }
    })
    if (!firm) throw new Error('Firm not found')

    let payload: any = {}
    if (data.name !== undefined) payload.name = data.name

    if (data.branding !== undefined || data.currency !== undefined) {
        const current = (firm.settings as Record<string, unknown>) || {}
        if (data.branding !== undefined) {
            const branding = {
                ...(current.branding as Record<string, unknown>),
                ...(data.branding.logoUrl !== undefined && { logoUrl: data.branding.logoUrl ?? null }),
                ...(data.branding.subtext !== undefined && { subtext: data.branding.subtext ?? null }),
                ...(data.branding.themeColor !== undefined && { themeColor: data.branding.themeColor ?? null }),
            }
            if (data.branding.themeColor !== undefined) (branding as any).brandColor = data.branding.themeColor ?? undefined
            payload.settings = { ...(payload.settings ?? current), branding }
        }
        if (data.currency !== undefined) {
            const currency = {
                ...(current.currency as Record<string, unknown>),
                ...(data.currency.symbol !== undefined && { symbol: data.currency.symbol ?? null }),
                ...(data.currency.code !== undefined && { code: data.currency.code ?? null }),
            }
            payload.settings = { ...(payload.settings ?? current), currency }
        }
    }

    await FirmService.updateFirm(firm.id, user.id, payload)

    const eventType = data.branding !== undefined && data.name === undefined
        ? AUDIT_EVENT.FIRM_BRANDING_CHANGED
        : AUDIT_EVENT.FIRM_CHANGED
    audit(eventType)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firm.id)
        .actor(user.id)
        .meta({ changedFields: Object.keys(data) })
        .fireAndForget()

    revalidatePath(`/d/f/${firmSlug}`)
}

/**
 * Delete firm.
 */
export async function deleteFirm(firmSlug: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true }
    })
    if (!firm) throw new Error('Firm not found')

    audit(AUDIT_EVENT.FIRM_DELETED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firm.id)
        .actor(user.id)
        .meta({ firmSlug })
        .fireAndForget()

    await FirmService.deleteFirm(firm.id, user.id)
    revalidatePath('/d')
}
