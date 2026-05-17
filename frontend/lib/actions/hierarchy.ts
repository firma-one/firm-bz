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

    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        select: { id: true }
    })

    if (!firm) {
        redirect('/d')
    }

    const firmId = firm.id

    const anyMembership = await prisma.firmMember.findFirst({
        where: { userId: user.id, firmId }
    })

    if (!anyMembership) {
        logger.warn('User has no firm membership, returning empty hierarchy', { userId: user.id, firmId })
        return []
    }

    // getUserSettingsPlus and client.findMany are independent — run in parallel.
    const [settingsResult, clients] = await Promise.all([
        userSettingsPlus.getUserSettingsPlus(user.id).catch((e: Error) => {
            logger.debug('Could not get cached permissions for hierarchy check', e)
            return null
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
