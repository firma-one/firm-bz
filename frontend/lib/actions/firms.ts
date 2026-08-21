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
    resolveGroupForNewFirm,
    resolveGroupForNewFirmInGroup,
} from '@/lib/billing/firm-creation-gate'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { firmPath, groupFirmListPath } from '@/lib/navigation/firm-paths'

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
    groupSlug?: string | null
    /** Whether the current user is `firm_admin` on this specific firm. */
    isFirmAdmin?: boolean
    /** Count of non-deleted clients in this firm. */
    clientCount?: number
}

export interface CreateFirmData {
    name: string
    allowDomainAccess?: boolean
    allowedEmailDomain?: string | null
    /**
     * The group whose picker page ("Add Firm") this was called from, if any. When provided,
     * the new firm is validated against and attached to THIS group specifically — never an
     * arbitrary "first eligible group" pick. Omit only when the caller has no specific group
     * in context (e.g. the top-level /d/ fallback view's own "Add Firm" entry point).
     */
    groupSlug?: string
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
            where: { userId: user.id, firm: { sandboxOnly: false } },
            include: {
                firm: {
                    include: {
                        members: true,
                        group: { select: { id: true, name: true, slug: true } },
                        _count: { select: { clients: { where: { deletedAt: null } } } },
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
                groupSlug: firm.group?.slug ?? null,
                isFirmAdmin: membership?.role === 'firm_admin',
                clientCount: firm._count?.clients ?? 0,
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
 * Whether the current user is this specific group's `GROUP_ADMIN` (its creator, in practice —
 * see getUserGroups()'s doc comment) — used for gating group-scoped actions like "Add Firm" on
 * /d/[groupSlug]/f. Deliberately checks GroupMember, not FirmMember.role === 'firm_admin' — a
 * firm-level admin on some firm in this group is not sufficient to add ANOTHER firm to the
 * group; only its GROUP_ADMIN may do that (adding a firm is a group-level action with its own
 * subscription-entitlement gate, checked separately by requireNonSandboxFirmCreationAccess /
 * resolveGroupForNewFirmInGroup inside createFirm()).
 */
export async function getIsGroupAdmin(groupSlug: string): Promise<boolean> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return false
    const membership = await (prisma as any).groupMember.findFirst({
        where: { userId: user.id, role: 'GROUP_ADMIN', group: { slug: groupSlug } },
        select: { id: true },
    })
    return membership !== null
}

export interface UserGroupOption {
    id: string
    slug: string
    name: string
    /** Whether the current user is this group's `GROUP_ADMIN` (its creator, in practice —
     * see lib/onboarding/auto-provision.ts and friends, which each write exactly one such
     * row per group at creation time). */
    isGroupAdmin: boolean
    firmCount: number
}

/**
 * Distinct groups the current user has any firm membership in, deduped from `getUserFirms()`,
 * each annotated with whether the user is that group's `GROUP_ADMIN` (checked via `GroupMember`,
 * not `FirmMember` — a user invited into someone else's firm has no `GroupMember` row in that
 * group at all, which correctly reads as "not admin" here).
 */
export async function getUserGroups(): Promise<UserGroupOption[]> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return []

    const firms = await getUserFirms()
    const groupsById = new Map<string, { slug: string; name: string; firmCount: number }>()
    for (const firm of firms) {
        if (!firm.groupId || !firm.groupSlug) continue
        const existing = groupsById.get(firm.groupId)
        if (existing) {
            existing.firmCount += 1
        } else {
            groupsById.set(firm.groupId, { slug: firm.groupSlug, name: firm.groupName || 'Firm Group', firmCount: 1 })
        }
    }

    const groupIds = Array.from(groupsById.keys())
    if (groupIds.length === 0) return []

    const adminRows = await (prisma as any).groupMember.findMany({
        where: { userId: user.id, groupId: { in: groupIds }, role: 'GROUP_ADMIN' },
        select: { groupId: true },
    })
    const adminGroupIds = new Set(adminRows.map((r: { groupId: string }) => r.groupId))

    return groupIds.map((id) => {
        const g = groupsById.get(id)!
        return { id, slug: g.slug, name: g.name, firmCount: g.firmCount, isGroupAdmin: adminGroupIds.has(id) }
    })
}

/**
 * Whether the "Switch Workspace" entry point (Profile menu) should be shown for the current
 * user — see .claude/plans/sandbox-firm-removal.md, Step 6. Always shown for any signed-in
 * user with at least one group, so there's a standing path to `/d/` — to switch between
 * multiple workspaces, to create an additional one as an existing admin, or (for an invited
 * firm member with no group of their own) to create their first one.
 */
export async function shouldShowSwitchWorkspace(): Promise<boolean> {
    const groups = await getUserGroups()
    return groups.length > 0
}

/**
 * Creates a brand-new Group + Firm + free-tier Subscription for the current user, from the
 * `/d/` group picker's "Create your own workspace" action — see
 * .claude/plans/sandbox-firm-removal.md, Step 6. Deliberately NOT the same action as "Add Firm"
 * on the firm-picker page (which adds a satellite firm to an EXISTING group/subscription): this
 * always creates a genuinely new, independent Group with its own Subscription, regardless of how
 * many firms/groups the user already belongs to. Reuses `autoProvisionFirstFirm` directly — that
 * function has no "zero firms" precondition of its own (the zero-firms gate lives in its caller,
 * `resolveDefaultFirmLandingPath`), so it's already safe to call here for a user who has firms.
 */
export async function createOwnWorkspace(): Promise<{ path: string } | { error: string }> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { error: 'Not signed in.' }

    try {
        const { autoProvisionFirstFirm } = await import('@/lib/onboarding/auto-provision')
        const { groupSlug, firmSlug } = await autoProvisionFirstFirm(user)
        return { path: firmPath(groupSlug, firmSlug) }
    } catch (err) {
        logger.error('[createOwnWorkspace] Failed to create workspace', err as Error, undefined, { userId: user.id })
        return { error: 'Failed to create your workspace. Please try again.' }
    }
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

    // Having any firm at all is now the onboarding-complete signal — see
    // resolveDefaultFirmLandingPath's identical reasoning above.
    return { slug, onboardingComplete: defaultFirm !== null }
}

/**
 * Where to send the user when entering the app at `/d` (and when auth callback has no explicit `next`).
 *
 * Groups are the top-level routing unit, firms are the second-level unit within a group
 * (see .claude/plans/sandbox-firm-removal.md, Step 6).
 *
 * Routing rules (in order):
 * 1. No firm memberships at all → silently auto-provision a real Group+Firm (see
 *    lib/onboarding/auto-provision.ts) and land directly in it — no onboarding wizard. The
 *    provisioning runs inline here (server-side redirect); `app/(app)/d/page.tsx`'s own
 *    inner Suspense boundary covers it, scoped to that one route only.
 * 2. 2+ distinct groups → `/d/` (group picker — one card per group)
 * 3. Exactly 1 group, 2+ firms in it → `/d/{groupSlug}/f/` (firm picker, scoped to that group)
 * 4. Exactly 1 group, exactly 1 firm → `/d/{groupSlug}/f/{firmSlug}` (go straight in) — having
 *    any firm at all is treated as onboarding-complete, no per-firm Drive/settings gate
 * 5. Admin with joinable/already-joined domain orgs → `/d/{groupSlug}/f/` instead of step 4
 *
 * Returns `null` only if the resolved firm/group has no slug (malformed data).
 */
export async function resolveDefaultFirmLandingPath(userId: string): Promise<string | null> {
    const allFirms = await FirmService.getUserFirms(userId)

    logger.info('[resolveDefaultFirmLandingPath]', { userId, firmCount: allFirms.length, slugs: allFirms.map(f => f.slug) })

    if (allFirms.length === 0) {
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return '/d/onboarding'

            const { autoProvisionFirstFirm } = await import('@/lib/onboarding/auto-provision')
            const { groupSlug, firmSlug } = await autoProvisionFirstFirm(user)
            // `?landed=new` lets the destination firm page show a one-time "just landed"
            // overlay (loading phase -> a closing welcome message) — the /d loader itself
            // can't show this (it renders before we know a fresh auto-provision even
            // happened, or even whether this is a first-time vs. returning landing at all),
            // so the closing message lives on arrival instead. See resolveDefaultFirmLandingPath's
            // other two `firmPath(...)` returns below for the `?landed=returning` counterpart.
            return `${firmPath(groupSlug, firmSlug)}?landed=new`
        } catch (err) {
            // Auto-provisioning failure (e.g. DB down) shouldn't crash landing-path resolution —
            // fall back to the old onboarding route, which will retry provisioning on next visit.
            logger.error('[resolveDefaultFirmLandingPath] Auto-provisioning failed', err as Error, undefined, { userId })
            return '/d/onboarding'
        }
    }

    const distinctGroupSlugs = Array.from(new Set(allFirms.map((f) => f.groupSlug).filter((s): s is string => Boolean(s))))
    if (distinctGroupSlugs.length === 0) return null

    // 2+ distinct groups → group picker. Nothing about which firm to land in is decided yet.
    if (distinctGroupSlugs.length > 1) return '/d/'

    const groupSlug = distinctGroupSlugs[0]
    const firmsInGroup = allFirms.filter((f) => f.groupSlug === groupSlug)

    // Exactly 1 group, but 2+ firms in it → firm picker, scoped to this group.
    if (firmsInGroup.length > 1) return groupFirmListPath(groupSlug)

    const targetFirm = firmsInGroup[0]
    if (!targetFirm?.slug) return null

    const membership = targetFirm.members.find((m) => m.userId === userId)
    const isFirmAdmin = membership?.role === 'firm_admin'

    if (!isFirmAdmin) {
        return `${firmPath(groupSlug, targetFirm.slug)}?landed=returning`
    }

    // Belonging to a group at all (checked at the top of this function) is now the only
    // "onboarding complete" signal — no per-firm Drive/settings gate. A user who already has a
    // firm never gets routed into /d/onboarding again.
    const { getDomainOnboardingOptions } = await import('@/lib/actions/domain-onboarding')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
        const domainOpts = await getDomainOnboardingOptions(userId, user.email)
        if ((domainOpts.orgsToJoin.length + domainOpts.orgsAlreadyIn.length) > 0) {
            return groupFirmListPath(groupSlug)
        }
    }

    return `${firmPath(groupSlug, targetFirm.slug)}?landed=returning`
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

    let billingAnchorId: string | null
    if (data.groupSlug) {
        const targetGroup = await prisma.group.findUnique({ where: { slug: data.groupSlug }, select: { id: true } })
        billingAnchorId = targetGroup ? await resolveGroupForNewFirmInGroup(user.id, targetGroup.id) : null
    } else {
        billingAnchorId = await resolveGroupForNewFirm(user.id)
    }
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

    const group = await prisma.group.findUnique({ where: { id: billingAnchorId }, select: { name: true, slug: true } })

    return {
        id: firm.id,
        name: firm.name,
        slug: firm.slug,
        isDefault: true,
        createdAt: new Date().toISOString(),
        sandboxOnly: false,
        groupId: billingAnchorId,
        groupName: group?.name ?? null,
        groupSlug: group?.slug ?? null,
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
    data: { name?: string; branding?: FirmBranding; currency?: FirmCurrency; betaFeatures?: Record<string, boolean>; internalMemo?: string | null; industry?: string | null; companySizeBracket?: string | null; companyWebsite?: string | null; linkedInUrl?: string | null; billingAddress?: string | null; notes?: string | null; allowDomainAccess?: boolean; allowedEmailDomain?: string | null; reminderEmailConfig?: FirmReminderEmailConfig; externalSections?: { engagementHealth: boolean; fileOrganization: boolean; documentActivity: boolean } }
): Promise<void> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true, settings: true, group: { select: { slug: true } } }
    })
    if (!firm) throw new Error('Firm not found')

    let payload: any = {}
    if (data.name !== undefined) payload.name = data.name

    if (data.branding !== undefined || data.currency !== undefined || data.betaFeatures !== undefined || data.reminderEmailConfig !== undefined || data.internalMemo !== undefined || data.industry !== undefined || data.companySizeBracket !== undefined || data.companyWebsite !== undefined || data.linkedInUrl !== undefined || data.billingAddress !== undefined || data.notes !== undefined || data.externalSections !== undefined) {
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
        if (data.betaFeatures !== undefined) {
            payload.settings = { ...(payload.settings ?? current), betaFeatures: data.betaFeatures }
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
        if (data.externalSections !== undefined) {
            payload.settings = { ...(payload.settings ?? current), externalSections: data.externalSections }
        }
    }

    if (data.allowDomainAccess !== undefined) payload.allowDomainAccess = data.allowDomainAccess
    if (data.allowedEmailDomain !== undefined) payload.allowedEmailDomain = data.allowedEmailDomain

    await FirmService.updateFirm(firm.id, user.id, payload)

    if (data.betaFeatures !== undefined) {
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

    revalidatePath(firmPath(firm.group.slug, firmSlug))
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
    type: string
    name: string
    email: string
    status: string
    workspaceRootLocation: string | null
    rootFolderId: string | null
    attachedClients: { id: string; name: string }[]
    /** Count of EngagementDocument rows tracked against this connector (isFolder: false).
     * Removing the connector orphans these — nulls their connectorId rather than deleting them
     * or the underlying provider file, but Firma loses its own tracking link to them. Surfaced
     * as a fatal-style warning before removal (see FirmDriveSection's Remove confirm dialogs). */
    documentCount: number
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
    const [clients, documentCounts] = await Promise.all([
        prisma.client.findMany({
            where: { firmId, connectorId: { in: connectorIds }, deletedAt: null },
            select: { id: true, name: true, connectorId: true },
            orderBy: { name: 'asc' },
        }),
        prisma.engagementDocument.groupBy({
            by: ['connectorId'],
            where: { connectorId: { in: connectorIds }, isFolder: false },
            _count: { _all: true },
        }),
    ])

    const clientsByConnector: Record<string, { id: string; name: string }[]> = {}
    for (const c of clients) {
        if (!c.connectorId) continue
        if (!clientsByConnector[c.connectorId]) clientsByConnector[c.connectorId] = []
        clientsByConnector[c.connectorId].push({ id: c.id, name: c.name })
    }

    const documentCountByConnector: Record<string, number> = {}
    for (const row of documentCounts) {
        if (!row.connectorId) continue
        documentCountByConnector[row.connectorId] = row._count._all
    }

    return connectors.map(c => {
        const settings = (c.settings ?? {}) as Record<string, unknown>
        const email = (settings.accountEmail as string | undefined) ?? c.externalAccountId ?? ''
        const rootFolderId = (settings.rootFolderId as string | undefined) ?? null
        const workspaceRootLocation = (settings.workspaceRootLocation as string | undefined) ?? null
        return {
            id: c.id,
            type: c.type,
            name: c.name ?? '',
            email,
            status: c.status,
            workspaceRootLocation,
            rootFolderId,
            attachedClients: clientsByConnector[c.id] ?? [],
            documentCount: documentCountByConnector[c.id] ?? 0,
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
