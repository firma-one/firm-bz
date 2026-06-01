'use server'

import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { userSettingsPlus, type UserPermissions } from '@/lib/user-settings-plus'
import { findProjectInPermissions } from '@/lib/permission-helpers'
import { logger } from '@/lib/logger'

export type HierarchyClient = {
    id: string
    name: string
    slug: string
    firmId?: string
    industry: string | null
    sector: string | null
    status: string | null
    website: string | null
    description: string | null
    tags: string[]
    ownerId: string | null
    followUpDate: Date | null
    expectedCloseDate: Date | null
    leadSource: string | null
    internalMemo: string | null
    relationshipValue: string | null
    clientSinceDate: Date | null
    linkedInUrl: string | null
    companySizeBracket: string | null
    billingAddress: string | null
    createdAt: Date
    updatedAt: Date
    engagements: {
        id: string
        clientId: string
        name: string
        slug: string
        description: string | null
        updatedAt: Date
        connectorRootFolderId: string | null
        /** Engagement lifecycle (lw-crm). */
        status: string
        contractType: string | null
        rateOrValue: string | null
        tags: string[]
        kickoffDate: string | null
        dueDate: string | null
        settings: Record<string, unknown>
        /** True when engagement status is COMPLETED (view-only details). */
        isClosed: boolean
        members: {
            userId: string
            canView: boolean
            canEdit: boolean
            canManage: boolean
        }[]
    }[]
}

function tagsFromJson(j: unknown): string[] {
    if (!Array.isArray(j)) return []
    return j.filter((x): x is string => typeof x === 'string')
}

/**
 * Fetch Firm Hierarchy (V2)
 * Pure membership-based: a user sees exactly what their ClientMember and ProjectMember rows grant.
 */
export async function getFirmHierarchy(firmSlug: string): Promise<HierarchyClient[]> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) {
        redirect('/signin')
    }

    const user = session.user

    // Phase 1: firm lookup + userSettingsPlus in parallel (userSettings doesn't need firmId).
    const [firm, settingsResult] = await Promise.all([
        prisma.firm.findUnique({
            where: { slug: firmSlug },
            select: { id: true }
        }),
        userSettingsPlus.getUserSettingsPlus(user.id).catch((e: Error) => {
            logger.debug('Could not get cached permissions for hierarchy check', e)
            return null
        }),
    ])

    if (!firm) {
        redirect('/d')
    }

    const firmId = firm.id

    // Phase 2: member check + client.findMany in parallel (both need firmId from phase 1).
    const [anyMembership, clients] = await Promise.all([
        prisma.firmMember.findFirst({
            where: { userId: user.id, firmId }
        }),
        prisma.client.findMany({
        where: {
            firmId,
            OR: [
                { members: { some: { userId: user.id } } },
                { engagements: { some: { isDeleted: false, members: { some: { userId: user.id } } } } }
            ]
        },
        include: {
            engagements: {
                where: { isDeleted: false, members: { some: { userId: user.id } } },
                include: {
                    members: {
                        where: { userId: user.id }
                    }
                },
                orderBy: { updatedAt: 'desc' }
            }
        },
        orderBy: { name: 'asc' }
        }),
    ])

    if (!anyMembership) {
        logger.warn('User has no firm membership, returning empty hierarchy', { userId: user.id, firmId })
        return []
    }

    const permissions: UserPermissions = settingsResult?.permissions || { firms: [] }

    return clients.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        firmId,
        industry: c.industry,
        sector: c.sector,
        status: c.status,
        website: c.website ?? null,
        description: c.description ?? null,
        tags: tagsFromJson(c.tags),
        ownerId: c.ownerId ?? null,
        followUpDate: c.followUpDate ?? null,
        expectedCloseDate: c.expectedCloseDate ?? null,
        leadSource: c.leadSource ?? null,
        internalMemo: c.internalMemo ?? null,
        relationshipValue: c.relationshipValue != null ? String(c.relationshipValue) : null,
        clientSinceDate: c.clientSinceDate ?? null,
        linkedInUrl: c.linkedInUrl ?? null,
        companySizeBracket: c.companySizeBracket ?? null,
        billingAddress: c.billingAddress ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        engagements: c.engagements.map((p: any) => {
            const engagementPerms = findProjectInPermissions(
                permissions,
                firmId,
                c.id,
                p.id
            )

            const canView = engagementPerms?.scopes.project?.includes('can_view') || false
            const canEdit = engagementPerms?.scopes.project?.includes('can_edit') || false
            const canManage = engagementPerms?.scopes.project?.includes('can_manage') || false

            const engStatus = p.status ?? 'ACTIVE'
            return {
                id: p.id,
                clientId: p.clientId,
                name: p.name,
                slug: p.slug,
                description: p.description,
                updatedAt: p.updatedAt,
                connectorRootFolderId: p.connectorRootFolderId,
                status: engStatus,
                contractType: p.contractType ?? null,
                rateOrValue: p.rateOrValue != null ? String(p.rateOrValue) : null,
                tags: tagsFromJson(p.tags),
                kickoffDate: p.kickoffDate ? new Date(p.kickoffDate).toISOString() : null,
                dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
                settings: (p.settings as Record<string, unknown>) ?? {},
                isClosed: engStatus === 'COMPLETED',
                members: [{
                    userId: user.id,
                    canView: canView || canManage,
                    canEdit: canEdit || canManage,
                    canManage
                }]
            }
        })
    }))
}

/** Lightweight client summary used by the firm page — engagements only carried for count. */
export type ClientSummary = Omit<HierarchyClient, 'engagements'> & {
    engagements: { id: string }[]
}

export type ClientsWithFirmMeta = {
    clients: ClientSummary[]
    firmId: string | null
    firmSandboxOnly: boolean
}

/**
 * Fetch the client list for the firm page.
 * Only loads engagement IDs (for count badges) — avoids fetching full engagement details.
 */
export async function getClients(firmSlug: string): Promise<ClientsWithFirmMeta> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) redirect('/signin')
    const user = session.user

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true, sandboxOnly: true }
    })

    if (!firm) return { clients: [], firmId: null, firmSandboxOnly: false }

    // Phase 2: member check + clients in parallel.
    const [anyMembership, rawClients] = await Promise.all([
        prisma.firmMember.findFirst({ where: { userId: user.id, firmId: firm.id } }),
        prisma.client.findMany({
            where: {
                firmId: firm.id,
                OR: [
                    { members: { some: { userId: user.id } } },
                    { engagements: { some: { isDeleted: false, members: { some: { userId: user.id } } } } }
                ]
            },
            select: {
                id: true, name: true, slug: true, firmId: true,
                industry: true, sector: true, status: true, website: true,
                description: true, tags: true, ownerId: true, followUpDate: true,
                expectedCloseDate: true, leadSource: true, internalMemo: true,
                relationshipValue: true, clientSinceDate: true, linkedInUrl: true,
                companySizeBracket: true, billingAddress: true,
                createdAt: true, updatedAt: true,
                engagements: {
                    where: { isDeleted: false, members: { some: { userId: user.id } } },
                    select: { id: true }
                }
            },
            orderBy: { name: 'asc' }
        }),
    ])

    if (!anyMembership) return { clients: [], firmId: firm.id, firmSandboxOnly: firm.sandboxOnly ?? false }

    const clients: ClientSummary[] = rawClients.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        firmId: firm.id,
        industry: c.industry,
        sector: c.sector,
        status: c.status,
        website: c.website ?? null,
        description: c.description ?? null,
        tags: tagsFromJson(c.tags),
        ownerId: c.ownerId ?? null,
        followUpDate: c.followUpDate ?? null,
        expectedCloseDate: c.expectedCloseDate ?? null,
        leadSource: c.leadSource ?? null,
        internalMemo: c.internalMemo ?? null,
        relationshipValue: c.relationshipValue != null ? String(c.relationshipValue) : null,
        clientSinceDate: c.clientSinceDate ?? null,
        linkedInUrl: c.linkedInUrl ?? null,
        companySizeBracket: c.companySizeBracket ?? null,
        billingAddress: c.billingAddress ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        engagements: c.engagements,
    }))

    return { clients, firmId: firm.id, firmSandboxOnly: firm.sandboxOnly ?? false }
}

export type ClientWithFirmMeta = {
    client: HierarchyClient | null
    firmId: string | null
    firmName: string | null
    firmSandboxOnly: boolean
}

/**
 * Fetch a single client with its engagements for the client detail page.
 * Only queries the one requested client — avoids loading the full firm hierarchy.
 */
export async function getClientWithEngagements(
    firmSlug: string,
    clientSlug: string
): Promise<ClientWithFirmMeta> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) redirect('/signin')
    const user = session.user

    // Phase 1: firm lookup + user settings in parallel.
    const [firm, settingsResult] = await Promise.all([
        prisma.firm.findUnique({
            where: { slug: firmSlug },
            select: { id: true, name: true, sandboxOnly: true }
        }),
        userSettingsPlus.getUserSettingsPlus(user.id).catch((e: Error) => {
            logger.debug('Could not get cached permissions for client hierarchy check', e)
            return null
        }),
    ])

    if (!firm) return { client: null, firmId: null, firmName: null, firmSandboxOnly: false }

    // Phase 2: single targeted client query — auth is embedded in the WHERE clause.
    const c = await prisma.client.findFirst({
        where: {
            slug: clientSlug,
            firmId: firm.id,
            OR: [
                { members: { some: { userId: user.id } } },
                { engagements: { some: { isDeleted: false, members: { some: { userId: user.id } } } } }
            ]
        },
        include: {
            engagements: {
                where: { isDeleted: false, members: { some: { userId: user.id } } },
                include: { members: { where: { userId: user.id } } },
                orderBy: { updatedAt: 'desc' }
            }
        }
    })

    if (!c) return { client: null, firmId: firm.id, firmName: firm.name, firmSandboxOnly: firm.sandboxOnly ?? false }

    const permissions = settingsResult?.permissions || { firms: [] }

    const client: HierarchyClient = {
        id: c.id,
        name: c.name,
        slug: c.slug,
        firmId: firm.id,
        industry: c.industry,
        sector: c.sector,
        status: c.status,
        website: c.website ?? null,
        description: c.description ?? null,
        tags: tagsFromJson(c.tags),
        ownerId: (c as any).ownerId ?? null,
        followUpDate: (c as any).followUpDate ?? null,
        expectedCloseDate: (c as any).expectedCloseDate ?? null,
        leadSource: (c as any).leadSource ?? null,
        internalMemo: (c as any).internalMemo ?? null,
        relationshipValue: (c as any).relationshipValue != null ? String((c as any).relationshipValue) : null,
        clientSinceDate: (c as any).clientSinceDate ?? null,
        linkedInUrl: (c as any).linkedInUrl ?? null,
        companySizeBracket: (c as any).companySizeBracket ?? null,
        billingAddress: (c as any).billingAddress ?? null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        engagements: (c.engagements as any[]).map((p: any) => {
            const engagementPerms = findProjectInPermissions(permissions, firm.id, c.id, p.id)
            const canView = engagementPerms?.scopes.project?.includes('can_view') || false
            const canEdit = engagementPerms?.scopes.project?.includes('can_edit') || false
            const canManage = engagementPerms?.scopes.project?.includes('can_manage') || false
            const engStatus = p.status ?? 'ACTIVE'
            return {
                id: p.id,
                clientId: p.clientId,
                name: p.name,
                slug: p.slug,
                description: p.description,
                updatedAt: p.updatedAt,
                connectorRootFolderId: p.connectorRootFolderId,
                status: engStatus,
                contractType: p.contractType ?? null,
                rateOrValue: p.rateOrValue != null ? String(p.rateOrValue) : null,
                tags: tagsFromJson(p.tags),
                kickoffDate: p.kickoffDate ? new Date(p.kickoffDate).toISOString() : null,
                dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
                settings: (p.settings as Record<string, unknown>) ?? {},
                isClosed: engStatus === 'COMPLETED',
                members: [{ userId: user.id, canView: canView || canManage, canEdit: canEdit || canManage, canManage }]
            }
        })
    }

    return { client, firmId: firm.id, firmName: firm.name, firmSandboxOnly: firm.sandboxOnly ?? false }
}

/**
 * Whether the current user is an org internal member (V2)
 */
export async function getIsOrgInternal(firmSlug: string): Promise<boolean> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return false
    const user = session.user

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true }
    })
    if (!firm) return false

    const membership = await prisma.firmMember.findFirst({
        where: { firmId: firm.id, userId: user.id }
    })

    if (!membership) return false

    const role = membership.role
    return role === 'firm_admin' || role === 'firm_member'
}

/**
 * Get firm name (V2)
 */
export async function getFirmName(firmSlug: string): Promise<string> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session?.user) return 'Firm'

    const user = session.user

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true, name: true }
    })

    if (!firm) return 'Firm'

    const membership = await prisma.firmMember.findFirst({
        where: { firmId: firm.id, userId: user.id }
    })

    if (!membership) return 'Firm'

    return firm.name
}
