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
import { isWorkspaceOnboardingComplete } from '@/lib/onboarding/workspace-onboarding-complete'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

export interface FirmOption {
    id: string
    name: string
    slug: string
    isDefault: boolean
    createdAt: string
    sandboxOnly: boolean
    logoUrl?: string | null
    themeColor?: string | null
    groupId?: string | null
    groupName?: string | null
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
        const memberships = await (prisma as any).firmMember.findMany({
            where: { userId: user.id },
            include: {
                firm: {
                    include: {
                        members: true,
                        group: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { firm: { createdAt: 'asc' } },
        })

        return memberships.map((m: any) => {
            const firm = m.firm
            const membership = firm.members.find((mem: any) => mem.userId === user.id)
            const branding = (firm.settings as Record<string, any>)?.branding ?? {}
            return {
                id: firm.id,
                name: firm.name,
                slug: firm.slug,
                isDefault: membership?.isDefault || false,
                createdAt: (firm.createdAt || new Date()).toISOString(),
                sandboxOnly: firm.sandboxOnly || false,
                logoUrl: (branding.logoData as string | null | undefined) ?? (branding.logoUrl as string | null | undefined) ?? null,
                themeColor: (branding.primaryColor as string | null | undefined) ?? null,
                groupId: firm.groupId ?? null,
                groupName: firm.group?.name ?? null,
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

export async function getFirmCreationGateReasonForCurrentUser(): Promise<import('@/lib/billing/firm-creation-gate').FirmCreationGateResult> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { reason: 'free_sandbox', cap: null }
    const { getFirmCreationGateReason } = await import('@/lib/billing/firm-creation-gate')
    return getFirmCreationGateReason(user.id)
}

export async function getIsAdminOnAnyFirm(): Promise<boolean> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return false
    const membership = await prisma.firmMember.findFirst({
        where: { userId: user.id, role: 'firm_admin', firm: { deletedAt: null } },
        select: { id: true },
    })
    return membership !== null
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
              sandboxOnly: defaultFirm.sandboxOnly ?? false,
          })
        : false

    return { slug, onboardingComplete }
}

/**
 * Where to send the user when entering the app at `/d` (and when auth callback has no explicit `next`).
 *
 * Routing rules (in order):
 * 1. No firm memberships at all → `/d/onboarding` (new user)
 * 2. Multiple firm memberships → `/d/f/` (workspace picker)
 * 3. Single firm, non-admin → `/d/f/{slug}` (go straight in)
 * 4. Single firm, admin, onboarding incomplete → `/d/onboarding`
 * 5. Single firm, admin, onboarding complete, domain orgs available → `/d/f/` (workspace picker)
 * 6. Single firm, admin, onboarding complete, no domain orgs → `/d/f/{slug}`
 *
 * Returns `null` only if the resolved firm has no slug (malformed data).
 */
export async function resolveDefaultFirmLandingPath(userId: string): Promise<string | null> {
    const allFirms = await FirmService.getUserFirms(userId)

    logger.info('[resolveDefaultFirmLandingPath]', { userId, firmCount: allFirms.length, slugs: allFirms.map(f => f.slug) })

    if (allFirms.length === 0) return '/d/onboarding'

    // Multiple memberships → always show picker so user can choose the right workspace
    if (allFirms.length > 1) return '/d/f/'

    const targetFirm = allFirms[0]
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
        sandboxOnly: targetFirm.sandboxOnly ?? false,
    })

    if (!onboardingComplete) {
        return '/d/onboarding'
    }

    // Admin, onboarding done — check for joinable/already-joined domain orgs
    const { getDomainOnboardingOptions } = await import('@/lib/actions/domain-onboarding')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
        const domainOpts = await getDomainOnboardingOptions(userId, user.email)
        if ((domainOpts.orgsToJoin.length + domainOpts.orgsAlreadyIn.length) > 0) {
            return '/d/f/'
        }
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
        allowDomainAccess: data.allowDomainAccess,
        allowedEmailDomain: data.allowedEmailDomain,
        groupId: billingAnchorId,
    })

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
    name?: string | null
    logoData?: string | null
    logoUrl?: string | null
    logoAspectRatio?: string | null
    subtext?: string | null
    primaryColor?: string | null
    secondaryColor?: string | null
    website?: string | null
}

export interface FirmCurrency {
    symbol?: string | null
    code?: string | null
}

/**
 * Update firm. Firm admin only.
 */
export type FirmReminderEmailConfig = {
    immediateOnCreate: boolean
    recurring: {
        enabled: boolean
        frequencyDays: number
        startDaysBeforeDue: number
    }
    mentionEmailOnCreate?: boolean
}

export async function getFirmReminderConfig(firmId: string): Promise<FirmReminderEmailConfig> {
    const firm = await prisma.firm.findUnique({ where: { id: firmId }, select: { settings: true } })
    const raw = (firm?.settings as any)?.reminderEmailConfig ?? {}
    return {
        immediateOnCreate: raw.immediateOnCreate ?? true,
        recurring: {
            enabled: raw.recurring?.enabled ?? true,
            frequencyDays: raw.recurring?.frequencyDays ?? 1,
            startDaysBeforeDue: raw.recurring?.startDaysBeforeDue ?? 7,
        },
    }
}

export async function updateFirm(
    firmSlug: string,
    data: { name?: string; branding?: FirmBranding; currency?: FirmCurrency; enableBetaFeatures?: boolean; internalMemo?: string | null; industry?: string | null; companySizeBracket?: string | null; companyWebsite?: string | null; linkedInUrl?: string | null; billingAddress?: string | null; notes?: string | null; allowDomainAccess?: boolean; allowedEmailDomain?: string | null; reminderEmailConfig?: FirmReminderEmailConfig }
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

    if (data.branding !== undefined || data.currency !== undefined || data.enableBetaFeatures !== undefined || data.reminderEmailConfig !== undefined || data.internalMemo !== undefined || data.industry !== undefined || data.companySizeBracket !== undefined || data.companyWebsite !== undefined || data.linkedInUrl !== undefined || data.billingAddress !== undefined || data.notes !== undefined) {
        const current = (firm.settings as Record<string, unknown>) || {}
        if (data.branding !== undefined) {
            const existing = (current.branding as Record<string, unknown>) ?? {}
            const branding = {
                ...existing,
                ...(data.branding.name !== undefined && { name: data.branding.name ?? null }),
                ...(data.branding.logoData !== undefined && { logoData: data.branding.logoData ?? null }),
                ...(data.branding.logoUrl !== undefined && { logoUrl: data.branding.logoUrl ?? null }),
                ...(data.branding.logoAspectRatio !== undefined && { logoAspectRatio: data.branding.logoAspectRatio ?? null }),
                ...(data.branding.subtext !== undefined && { subtext: data.branding.subtext ?? null }),
                ...(data.branding.primaryColor !== undefined && { primaryColor: data.branding.primaryColor ?? null }),
                ...(data.branding.secondaryColor !== undefined && { secondaryColor: data.branding.secondaryColor ?? null }),
                ...(data.branding.website !== undefined && { website: data.branding.website ?? null }),
            }
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
        if (data.enableBetaFeatures !== undefined) {
            payload.settings = { ...(payload.settings ?? current), enableBetaFeatures: data.enableBetaFeatures }
        }
        if (data.internalMemo !== undefined) {
            payload.settings = { ...(payload.settings ?? current), internalMemo: data.internalMemo }
        }
        if (data.industry !== undefined) {
            payload.settings = { ...(payload.settings ?? current), industry: data.industry }
        }
        if (data.companySizeBracket !== undefined) {
            payload.settings = { ...(payload.settings ?? current), companySizeBracket: data.companySizeBracket }
        }
        if (data.companyWebsite !== undefined) {
            payload.settings = { ...(payload.settings ?? current), companyWebsite: data.companyWebsite }
        }
        if (data.linkedInUrl !== undefined) {
            payload.settings = { ...(payload.settings ?? current), linkedInUrl: data.linkedInUrl }
        }
        if (data.billingAddress !== undefined) {
            payload.settings = { ...(payload.settings ?? current), billingAddress: data.billingAddress }
        }
        if (data.notes !== undefined) {
            payload.settings = { ...(payload.settings ?? current), notes: data.notes }
        }
        if (data.reminderEmailConfig !== undefined) {
            payload.settings = { ...(payload.settings ?? current), reminderEmailConfig: data.reminderEmailConfig }
        }
    }

    if (data.allowDomainAccess !== undefined) payload.allowDomainAccess = data.allowDomainAccess
    if (data.allowedEmailDomain !== undefined) payload.allowedEmailDomain = data.allowedEmailDomain

    await FirmService.updateFirm(firm.id, user.id, payload)

    if (data.enableBetaFeatures !== undefined) {
        const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
        await invalidateUserSettingsPlus(user.id)
    }

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

// ── Connector management (firm level) ──────────────────────────────────────

export interface FirmConnectorRecord {
    id: string
    name: string
    email: string
    status: string
    workspaceRootLocation: string | null
    rootFolderId: string | null
    attachedClients: { id: string; name: string }[]
}

export async function getFirmConnectors(firmId: string): Promise<FirmConnectorRecord[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const connectors = await prisma.connector.findMany({
        where: { firmId },
        orderBy: { createdAt: 'asc' },
    })
    if (connectors.length === 0) return []

    const connectorIds = connectors.map(c => c.id)
    const clients = await prisma.client.findMany({
        where: { firmId, connectorId: { in: connectorIds }, deletedAt: null },
        select: { id: true, name: true, connectorId: true },
        orderBy: { name: 'asc' },
    })

    const clientsByConnector: Record<string, { id: string; name: string }[]> = {}
    for (const c of clients) {
        if (!c.connectorId) continue
        if (!clientsByConnector[c.connectorId]) clientsByConnector[c.connectorId] = []
        clientsByConnector[c.connectorId].push({ id: c.id, name: c.name })
    }

    return connectors.map(c => {
        const settings = (c.settings ?? {}) as Record<string, unknown>
        const email = (settings.accountEmail as string | undefined) ?? c.externalAccountId ?? ''
        const rootFolderId = (settings.rootFolderId as string | undefined) ?? null
        const workspaceRootLocation = (settings.workspaceRootLocation as string | undefined) ?? null
        return {
            id: c.id,
            name: c.name ?? '',
            email,
            status: c.status,
            workspaceRootLocation,
            rootFolderId,
            attachedClients: clientsByConnector[c.id] ?? [],
        }
    })
}

export async function disconnectFirmConnector({ connectorId, firmId }: { connectorId: string; firmId: string }): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const connector = await prisma.connector.findUnique({
        where: { id: connectorId },
        select: { firmId: true },
    })
    if (!connector) throw new Error('Connector not found')
    if (connector.firmId !== firmId) throw new Error('Unauthorized')

    await prisma.connector.update({
        where: { id: connectorId },
        data: { status: 'REVOKED', accessToken: '', refreshToken: null, tokenExpiresAt: null },
    })

    audit(AUDIT_EVENT.STORAGE_CONNECTOR_DETACHED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firmId)
        .actor(user.id)
        .meta({ connectorId, action: 'disconnect' })
        .fireAndForget()

    revalidatePath('/d/f')
}

export async function removeFirmConnector({ connectorId }: { connectorId: string; firmId?: string }): Promise<void> {
    const { removeConnector } = await import('@/lib/actions/connectors')
    await removeConnector({ connectorId })
}

export async function renameFirmConnector({ connectorId, firmId, name }: { connectorId: string; firmId: string; name: string }): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const connector = await prisma.connector.findUnique({
        where: { id: connectorId },
        select: { firmId: true },
    })
    if (!connector) throw new Error('Connector not found')
    if (connector.firmId !== firmId) throw new Error('Unauthorized')

    await prisma.connector.update({
        where: { id: connectorId },
        data: { name: name.trim() },
    })
    revalidatePath('/d/f')
}

export interface FirmClientRecord {
    id: string
    name: string
    connectorId: string | null
}

export async function getFirmAllClients(firmId: string): Promise<FirmClientRecord[]> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const clients = await prisma.client.findMany({
        where: { firmId, deletedAt: null },
        select: { id: true, name: true, connectorId: true },
        orderBy: { name: 'asc' },
    })
    return clients.map(c => ({ id: c.id, name: c.name, connectorId: c.connectorId ?? null }))
}

export async function detachConnectorFromClient({ clientId, firmId }: { clientId: string; firmId: string }): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { firmId: true, connectorId: true },
    })
    if (!client) throw new Error('Client not found')
    if (client.firmId !== firmId) throw new Error('Unauthorized')

    // Clear engagement + document connector references so re-linking uses the new workspace
    const engagements = await prisma.engagement.findMany({
        where: { clientId },
        select: { id: true },
    })
    const engagementIds = engagements.map(e => e.id)

    if (engagementIds.length > 0) {
        await prisma.engagementDocument.updateMany({
            where: { engagementId: { in: engagementIds } },
            data: { connectorId: null },
        })
        await prisma.engagement.updateMany({
            where: { id: { in: engagementIds } },
            data: { connectorRootFolderId: null },
        })
    }

    await prisma.client.update({
        where: { id: clientId },
        data: { connectorId: null, driveFolderId: null },
    })
    revalidatePath('/d/f')
}
