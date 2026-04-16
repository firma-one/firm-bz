import { createAdminClient } from '@/utils/supabase/admin'
import { prisma } from '@/lib/prisma'
import { isWorkspaceOnboardingComplete } from '@/lib/onboarding/workspace-onboarding-complete'
import { resolveBillingAnchorFirmId } from '@/lib/billing/billing-group'
import {
    getActiveSubscriptionForFirm,
    subscriptionAccessStatusLabel,
} from '@/lib/billing/active-billing-subscription'

const SYS_ADMIN_ROLE = 'SYS_ADMIN'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type DataMapSeverity = 'critical' | 'warning' | 'info'
export type DataMapActionType = 'repair' | 'stage-reset' | 'full-reset'

export type UserDataMapFinding = {
    id: string
    severity: DataMapSeverity
    title: string
    evidence: string
    recommendedActionType: DataMapActionType
    sqlPreview: string
}

type ResolvedAuthUser = {
    id: string
    email: string | null
    appMetadata: Record<string, unknown>
    userMetadata: Record<string, unknown>
}

export type UserDataMapFirmEntry = {
    id: string
    name: string
    slug: string
    role: string
    isDefault: boolean
    sandboxOnly: boolean
    connectorId: string | null
    onboardingStage: string | null
    onboardingIsCompleteFlag: boolean
    computedOnboardingComplete: boolean
    billing: {
        anchorFirmId: string
        anchorExists: boolean
        activeSubscription: {
            status: string | null
            plan: string | null
            pricingModel: string | null
            polarCustomerId: string | null
            couponCode: string | null
        } | null
    }
    counts: {
        clients: number
        engagements: number
        documents: number
        invitations: {
            firm: number
            client: number
            engagement: number
        }
        notificationsForFirm: number
    }
}

export type UserDataMapResult = {
    targetUser: {
        id: string
        email: string | null
        appMetadata: Record<string, unknown>
        userMetadata: Record<string, unknown>
    }
    summary: {
        memberships: number
        firmAdminMemberships: number
        defaultMemberships: number
        onboardingCompleteFirms: number
        discrepancyCount: number
    }
    operational: {
        userPersonalizationExists: boolean
        customerRequestsForUser: number
        notificationsForUser: number
        systemAdminEntryExists: boolean
    }
    firms: UserDataMapFirmEntry[]
    findings: UserDataMapFinding[]
}

export function looksLikeUuid(value: string): boolean {
    return UUID_RE.test(value.trim())
}

export async function isSysAdminUser(userId: string): Promise<boolean> {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user) return false
    const role = (data.user.app_metadata?.role as string | undefined) ?? null
    return role === SYS_ADMIN_ROLE
}

async function resolveTargetUser(identifier: string): Promise<ResolvedAuthUser | null> {
    const raw = identifier.trim()
    if (!raw) return null

    const admin = createAdminClient()
    if (looksLikeUuid(raw)) {
        const { data, error } = await admin.auth.admin.getUserById(raw)
        if (error || !data?.user) return null
        return {
            id: data.user.id,
            email: data.user.email ?? null,
            appMetadata: (data.user.app_metadata ?? {}) as Record<string, unknown>,
            userMetadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
        }
    }

    const targetEmail = raw.toLowerCase()
    const perPage = 200
    for (let page = 1; page <= 20; page += 1) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
        if (error) break
        const users = data?.users ?? []
        const found = users.find((u) => (u.email ?? '').toLowerCase() === targetEmail)
        if (found) {
            return {
                id: found.id,
                email: found.email ?? null,
                appMetadata: (found.app_metadata ?? {}) as Record<string, unknown>,
                userMetadata: (found.user_metadata ?? {}) as Record<string, unknown>,
            }
        }
        if (users.length < perPage) break
    }

    return null
}

function onboardingFromSettings(settings: unknown): { stage: string | null; isComplete: boolean } {
    const firmSettings = (settings as Record<string, unknown> | null) ?? {}
    const onboarding = (firmSettings.onboarding as Record<string, unknown> | undefined) ?? {}
    const stage = typeof onboarding.stage === 'string' ? onboarding.stage : null
    const isComplete = onboarding.isComplete === true
    return { stage, isComplete }
}

function buildFullResetSql(userId: string): string {
    return [
        "-- Full reset recommendation:",
        '-- Use script: frontend/scripts/sql/cascade-delete-platform-data-for-firm-admin.sql',
        "-- Set DO block variable v_user to the target user's UUID:",
        `--   v_user uuid := '${userId}'::uuid;`,
        '-- Then execute with COMMIT once validated.',
    ].join('\n')
}

function buildFindings(params: {
    userId: string
    defaultMemberships: number
    memberships: number
    firms: UserDataMapFirmEntry[]
    operational: UserDataMapResult['operational']
}): UserDataMapFinding[] {
    const { userId, defaultMemberships, memberships, firms, operational } = params
    const findings: UserDataMapFinding[] = []

    if (memberships > 0 && defaultMemberships === 0) {
        findings.push({
            id: 'missing-default-membership',
            severity: 'critical',
            title: 'User has memberships but no default firm membership',
            evidence: `Memberships=${memberships}, defaultMemberships=0`,
            recommendedActionType: 'repair',
            sqlPreview: [
                '-- Pick one firm_id from this user memberships and set default',
                `UPDATE platform.firm_members SET "isDefault" = false WHERE "userId" = '${userId}'::uuid;`,
                `UPDATE platform.firm_members SET "isDefault" = true WHERE "userId" = '${userId}'::uuid AND "firmId" = '<firm_uuid>'::uuid;`,
            ].join('\n'),
        })
    }

    if (defaultMemberships > 1) {
        findings.push({
            id: 'multiple-default-memberships',
            severity: 'critical',
            title: 'User has multiple default firm memberships',
            evidence: `defaultMemberships=${defaultMemberships}`,
            recommendedActionType: 'repair',
            sqlPreview: [
                '-- Keep exactly one default membership',
                `UPDATE platform.firm_members SET "isDefault" = false WHERE "userId" = '${userId}'::uuid;`,
                `UPDATE platform.firm_members SET "isDefault" = true WHERE "userId" = '${userId}'::uuid AND "firmId" = '<firm_uuid>'::uuid;`,
            ].join('\n'),
        })
    }

    for (const firm of firms) {
        if (!firm.billing.anchorExists) {
            findings.push({
                id: `missing-anchor-${firm.id}`,
                severity: 'warning',
                title: `Billing anchor is missing for firm ${firm.slug}`,
                evidence: `anchorFirmId=${firm.billing.anchorFirmId} does not exist`,
                recommendedActionType: 'repair',
                sqlPreview: [
                    '-- Repoint to a valid anchor or clear broken anchor relationship',
                    `UPDATE platform.firms SET "anchorFirmId" = NULL, "billingSharesSubscriptionFromFirmId" = NULL WHERE "id" = '${firm.id}'::uuid;`,
                ].join('\n'),
            })
        }

        if (firm.role === 'firm_admin' && firm.onboardingStage === 'completed' && !firm.connectorId) {
            findings.push({
                id: `completed-missing-connector-${firm.id}`,
                severity: 'critical',
                title: `Firm ${firm.slug} marked completed without connector`,
                evidence: 'onboarding.stage=completed but connectorId is null',
                recommendedActionType: 'stage-reset',
                sqlPreview: [
                    '-- Reset onboarding stage so user can restart Drive connect flow',
                    `UPDATE platform.firms SET "settings" = jsonb_set(COALESCE("settings",'{}'::jsonb), '{onboarding}',`,
                    `'{"onboardingFlowVersion":3,"resumeAtStep":1,"stage":"awaiting_subscribe","isComplete":false,"driveConnected":false}'::jsonb, true)`,
                    `WHERE "id" = '${firm.id}'::uuid;`,
                ].join('\n'),
            })
        }
    }

    if (memberships === 0 && (operational.customerRequestsForUser > 0 || operational.notificationsForUser > 0)) {
        findings.push({
            id: 'orphan-user-operational-data',
            severity: 'warning',
            title: 'User has operational records but no workspace memberships',
            evidence: `customerRequests=${operational.customerRequestsForUser}, notifications=${operational.notificationsForUser}`,
            recommendedActionType: 'full-reset',
            sqlPreview: buildFullResetSql(userId),
        })
    }

    if (findings.length === 0) {
        findings.push({
            id: 'no-discrepancies',
            severity: 'info',
            title: 'No discrepancies detected by current rules',
            evidence: 'All baseline integrity checks passed',
            recommendedActionType: 'repair',
            sqlPreview: '-- No action required.',
        })
    }

    return findings
}

export async function buildUserDataMap(identifier: string): Promise<UserDataMapResult | null> {
    const targetUser = await resolveTargetUser(identifier)
    if (!targetUser) return null

    const memberships = await prisma.firmMember.findMany({
        where: { userId: targetUser.id },
        include: {
            firm: {
                select: {
                    id: true,
                    name: true,
                    slug: true,
                    settings: true,
                    sandboxOnly: true,
                    connectorId: true,
                    deletedAt: true,
                },
            },
        },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    })

    const firmIds = memberships.map((m) => m.firmId)
    const uniqueFirmIds = Array.from(new Set(firmIds))

    const firms: UserDataMapFirmEntry[] = []
    for (const membership of memberships) {
        const firm = membership.firm
        const onboardingBits = onboardingFromSettings(firm.settings)
        const onboardingComplete = await isWorkspaceOnboardingComplete({
            id: firm.id,
            settings: firm.settings,
            connectorId: firm.connectorId,
        })
        const anchorFirmId = await resolveBillingAnchorFirmId(firm.id)
        const anchorExists = Boolean(
            await prisma.firm.findUnique({
                where: { id: anchorFirmId },
                select: { id: true },
            })
        )
        const activeSubscription = anchorExists ? await getActiveSubscriptionForFirm(anchorFirmId) : null

        const [clients, engagements, documents, firmInvites, clientInvites, engagementInvites, notifForFirm] =
            await Promise.all([
                prisma.client.count({ where: { firmId: firm.id, deletedAt: null } }),
                prisma.engagement.count({ where: { firmId: firm.id, deletedAt: null, isDeleted: false } }),
                prisma.engagementDocument.count({ where: { firmId: firm.id } }),
                prisma.firmInvitation.count({ where: { firmId: firm.id } }),
                prisma.clientInvitation.count({ where: { client: { firmId: firm.id } } }),
                prisma.engagementInvitation.count({ where: { engagement: { firmId: firm.id } } }),
                prisma.notification.count({ where: { firmId: firm.id } }),
            ])

        firms.push({
            id: firm.id,
            name: firm.name,
            slug: firm.slug,
            role: membership.role,
            isDefault: membership.isDefault,
            sandboxOnly: firm.sandboxOnly,
            connectorId: firm.connectorId,
            onboardingStage: onboardingBits.stage,
            onboardingIsCompleteFlag: onboardingBits.isComplete,
            computedOnboardingComplete: onboardingComplete,
            billing: {
                anchorFirmId,
                anchorExists,
                activeSubscription: activeSubscription
                    ? {
                          status: subscriptionAccessStatusLabel(activeSubscription),
                          plan: activeSubscription.plan,
                          pricingModel: activeSubscription.pricingModel,
                          polarCustomerId: activeSubscription.polarCustomerId,
                          couponCode: activeSubscription.couponCode,
                      }
                    : null,
            },
            counts: {
                clients,
                engagements,
                documents,
                invitations: {
                    firm: firmInvites,
                    client: clientInvites,
                    engagement: engagementInvites,
                },
                notificationsForFirm: notifForFirm,
            },
        })
    }

    const [userPersonalization, customerRequestsForUser, notificationsForUser, systemAdminEntryExists] =
        await Promise.all([
            prisma.userPersonalization.findUnique({ where: { userId: targetUser.id }, select: { userId: true } }),
            (prisma as any).customerRequest.count({
                where: {
                    OR: [{ userId: targetUser.id }, { firmId: { in: uniqueFirmIds } }],
                },
            }),
            prisma.notification.count({ where: { userId: targetUser.id } }),
            prisma.systemAdmin.findFirst({ where: { userId: targetUser.id }, select: { id: true } }),
        ])

    const defaultMemberships = memberships.filter((m) => m.isDefault).length
    const firmAdminMemberships = memberships.filter((m) => m.role === 'firm_admin').length
    const onboardingCompleteFirms = firms.filter((f) => f.computedOnboardingComplete).length

    const operational = {
        userPersonalizationExists: Boolean(userPersonalization),
        customerRequestsForUser,
        notificationsForUser,
        systemAdminEntryExists: Boolean(systemAdminEntryExists),
    }

    const findings = buildFindings({
        userId: targetUser.id,
        defaultMemberships,
        memberships: memberships.length,
        firms,
        operational,
    })

    return {
        targetUser: {
            id: targetUser.id,
            email: targetUser.email,
            appMetadata: targetUser.appMetadata,
            userMetadata: targetUser.userMetadata,
        },
        summary: {
            memberships: memberships.length,
            firmAdminMemberships,
            defaultMemberships,
            onboardingCompleteFirms,
            discrepancyCount: findings.filter((f) => f.severity !== 'info').length,
        },
        operational,
        firms,
        findings,
    }
}
