'use server'

import { prisma } from '@/lib/prisma'
import { createClient as createSupabaseClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { logger } from '@/lib/logger'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'
import type { ClientStatus } from '@prisma/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { upsertFollowUpReminder } from '@/lib/actions/user-reminders'
import { assertWithinClientCap, assertWithinClientContactCap } from '@/lib/billing/effective-billing-caps'

export type LwCrmClientStatus = 'PROSPECT' | 'ACTIVE' | 'ON_HOLD' | 'PAST'


export interface CreateClientData {
    name: string
    industry?: string
    sector?: string
    status?: LwCrmClientStatus
    website?: string
    description?: string
    tags?: string[]
    followUpDate?: string | null
    expectedCloseDate?: string | null
    leadSource?: string | null
    internalMemo?: string | null
    relationshipValue?: string | null
    clientSinceDate?: string | null
    linkedInUrl?: string | null
    companySizeBracket?: string | null
    billingAddress?: string | null
}

/**
 * Create a new client (V2)
 */
export async function createClient(organizationSlug: string, data: CreateClientData) {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error('Unauthorized')
    }

    // 1. Resolve firm & check permissions
    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } }
        }
    })

    if (!firm) {
        throw new Error('Firm not found')
    }

    const { requireAccess } = await import('@/lib/billing/subscription-gate')
    await requireAccess(firm.id, 'clients.create')
    await assertWithinClientCap(firm.id)

    const membership = firm.members[0]
    if (!membership) {
        throw new Error('Unauthorized')
    }

    // 2. Check for duplicate name
    const existingName = await prisma.client.findFirst({
        where: {
            firmId: firm.id,
            name: {
                equals: data.name,
                mode: 'insensitive'
            }
        }
    })

    if (existingName) {
        throw new Error('A client with this name already exists')
    }

    // 3. Generate slug and ensure uniqueness
    const { generateClientSlug } = await import('@/lib/slug-utils')
    const MAX_SLUG_ATTEMPTS = 10
    let slug = generateClientSlug(data.name)
    let attempts = 0
    while (attempts < MAX_SLUG_ATTEMPTS) {
        const existing = await prisma.client.findUnique({
            where: {
                firmId_slug: {
                    firmId: firm.id,
                    slug
                }
            }
        })
        if (!existing) break
        slug = generateClientSlug(data.name)
        attempts++
    }
    if (attempts >= MAX_SLUG_ATTEMPTS) {
        throw new Error('Could not generate a unique client slug. Please try again.')
    }

    // 4. Create client + ClientMember for creator; add Firm Admins as Client Admin (permission hierarchy)
    const clientAdminPersona = await prisma.persona.findUnique({
        where: { slug: 'client_admin' }
    })

    const newClient = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
            data: {
                firmId: firm.id,
                name: data.name,
                slug: slug,
                industry: data.industry,
                sector: data.sector,
                status: (data.status ?? 'ACTIVE') as ClientStatus,
                website: data.website?.trim() || null,
                description: data.description?.trim() || null,
                tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
                ownerId: user.id,
                followUpDate: data.followUpDate ? new Date(data.followUpDate) : null,
                expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
                leadSource: data.leadSource ?? null,
                internalMemo: data.internalMemo?.trim() || null,
                relationshipValue: data.relationshipValue?.trim() || null,
                clientSinceDate: data.clientSinceDate ? new Date(data.clientSinceDate) : null,
                linkedInUrl: data.linkedInUrl?.trim() || null,
                companySizeBracket: data.companySizeBracket ?? null,
                billingAddress: data.billingAddress?.trim() || null,
            }
        })

        if (clientAdminPersona) {
            await tx.clientMember.create({
                data: {
                    clientId: client.id,
                    userId: user.id,
                    personaId: clientAdminPersona.id
                }
            })

            // Permission hierarchy: add Firm Admins as Client Admin (skip if already a member)
            const firmAdmins = await tx.firmMember.findMany({
                where: { firmId: firm.id, role: 'firm_admin' },
                select: { userId: true }
            })
            for (const { userId: adminUserId } of firmAdmins) {
                if (adminUserId === user.id) continue
                const existing = await tx.clientMember.findFirst({
                    where: { clientId: client.id, userId: adminUserId }
                })
                if (!existing) {
                    await tx.clientMember.create({
                        data: {
                            clientId: client.id,
                            userId: adminUserId,
                            personaId: clientAdminPersona.id
                        }
                    })
                }
            }
        }

        return client
    })

    audit(AUDIT_EVENT.CLIENT_CREATED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firm.id)
        .client(newClient.id)
        .actor(user.id)
        .meta({ name: newClient.name, slug: newClient.slug })
        .fireAndForget()

    // 5. Create Drive folder structure if connected
    try {
        const { connectorId } = await resolveClientConnector(newClient.id)
        if (connectorId) {
            await googleDriveConnector.ensureAppFolderStructure(
                connectorId,
                newClient.name,
                newClient.slug,
                await googleDriveConnector.createGoogleDriveAdapter(connectorId),
                firm.id
            )
        }
    } catch (e) {
        logger.error("Failed to create Google Drive folder for client", e as Error)
    }

    // Upsert follow-up reminder if followUpDate was set
    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.clients.id',
        entityValue: newClient.id,
        action: 'Follow-up',
        dateKey: 'platform.clients.followUpDate',
        dateValue: data.followUpDate ?? null,
        entityName: newClient.name,
        firmId: firm.id,
        ctaUrl: `/d/f/${organizationSlug}/c/${newClient.slug}`,
        note: data.internalMemo ?? null,
    }).catch(() => {})
    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.clients.id',
        entityValue: newClient.id,
        action: 'Close deal',
        dateKey: 'platform.clients.expectedCloseDate',
        dateValue: data.expectedCloseDate ?? null,
        entityName: newClient.name,
        firmId: firm.id,
        ctaUrl: `/d/f/${organizationSlug}/c/${newClient.slug}`,
        note: data.internalMemo ?? null,
    }).catch(() => {})

    revalidatePath(`/d/f/${organizationSlug}`)
    return newClient
}

export interface UpdateClientData {
    name?: string
    industry?: string
    sector?: string
    status?: LwCrmClientStatus
    website?: string | null
    description?: string | null
    tags?: string[]
    ownerId?: string | null
    followUpDate?: string | null
    expectedCloseDate?: string | null
    leadSource?: string | null
    internalMemo?: string | null
    relationshipValue?: string | null
    clientSinceDate?: string | null
    linkedInUrl?: string | null
    companySizeBracket?: string | null
    billingAddress?: string | null
}

/**
 * Update client details (V2)
 */
export async function updateClient(
    organizationSlug: string,
    clientSlug: string,
    data: UpdateClientData
): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true, name: true } }
        }
    })
    if (!firm || firm.members.length === 0) throw new Error('Unauthorized')
    const client = firm.clients[0]
    if (!client) throw new Error('Client not found')

    const { canManageClient } = await import('@/lib/permission-helpers')
    const canManage = await canManageClient(firm.id, client.id)
    if (!canManage) throw new Error('Insufficient permissions')

    if (data.ownerId !== undefined && data.ownerId !== null) {
        const ownerMember = await prisma.firmMember.findFirst({
            where: { firmId: firm.id, userId: data.ownerId },
        })
        if (!ownerMember) throw new Error('Owner must be a member of this firm')
    }

    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.industry !== undefined) updateData.industry = data.industry
    if (data.sector !== undefined) updateData.sector = data.sector
    if (data.status !== undefined) updateData.status = data.status as ClientStatus
    if (data.website !== undefined) updateData.website = data.website?.trim() || null
    if (data.description !== undefined) updateData.description = data.description?.trim() || null
    if (data.tags !== undefined) {
        updateData.tags = Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string' && t.trim()) : []
    }
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId
    if (data.followUpDate !== undefined) updateData.followUpDate = data.followUpDate ? new Date(data.followUpDate) : null
    if (data.expectedCloseDate !== undefined) updateData.expectedCloseDate = data.expectedCloseDate ? new Date(data.expectedCloseDate) : null
    if (data.leadSource !== undefined) updateData.leadSource = data.leadSource ?? null
    if (data.internalMemo !== undefined) updateData.internalMemo = data.internalMemo?.trim() || null
    if (data.relationshipValue !== undefined) updateData.relationshipValue = data.relationshipValue?.trim() || null
    if (data.clientSinceDate !== undefined) updateData.clientSinceDate = data.clientSinceDate ? new Date(data.clientSinceDate) : null
    if (data.linkedInUrl !== undefined) updateData.linkedInUrl = data.linkedInUrl?.trim() || null
    if (data.companySizeBracket !== undefined) updateData.companySizeBracket = data.companySizeBracket ?? null
    if (data.billingAddress !== undefined) updateData.billingAddress = data.billingAddress?.trim() || null
    if (Object.keys(updateData).length === 0) return

    await prisma.client.update({
        where: { id: client.id },
        data: updateData
    })

    audit(AUDIT_EVENT.CLIENT_CHANGED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firm.id)
        .client(client.id)
        .actor(user.id)
        .meta({ changedFields: Object.keys(updateData) })
        .fireAndForget()

    // Upsert/cancel reminders if relevant date fields or status changed
    const followUpChanged = data.followUpDate !== undefined
    const expectedCloseChanged = data.expectedCloseDate !== undefined
    const statusChanged = data.status !== undefined
    if (followUpChanged || expectedCloseChanged || statusChanged) {
        const latest = await (prisma as any).client.findUnique({
            where: { id: client.id },
            select: { followUpDate: true, expectedCloseDate: true, status: true, ownerId: true, slug: true, internalMemo: true },
        }) as { followUpDate: Date | null; expectedCloseDate: Date | null; status: string; ownerId: string | null; slug: string; internalMemo: string | null } | null
        const activeStatuses = ['PROSPECT', 'ACTIVE']
        const isActive = activeStatuses.includes(latest?.status ?? '')
        const effectiveOwnerId = latest?.ownerId ?? null
        const ctaUrl = `/d/f/${organizationSlug}/c/${latest?.slug ?? clientSlug}`
        const entityName = data.name ?? client.name
        if (effectiveOwnerId) {
            const memo = data.internalMemo !== undefined ? data.internalMemo : latest?.internalMemo ?? null
            upsertFollowUpReminder({
                userId: effectiveOwnerId,
                entityKey: 'platform.clients.id',
                entityValue: client.id,
                action: 'Follow-up',
                dateKey: 'platform.clients.followUpDate',
                dateValue: isActive && latest?.followUpDate ? latest.followUpDate.toISOString() : null,
                entityName,
                firmId: firm.id,
                ctaUrl,
                note: memo,
            }).catch(() => {})
            upsertFollowUpReminder({
                userId: effectiveOwnerId,
                entityKey: 'platform.clients.id',
                entityValue: client.id,
                action: 'Close deal',
                dateKey: 'platform.clients.expectedCloseDate',
                dateValue: isActive && latest?.expectedCloseDate ? latest.expectedCloseDate.toISOString() : null,
                entityName,
                firmId: firm.id,
                ctaUrl,
                note: memo,
            }).catch(() => {})
        }
    }

    revalidatePath(`/d/f/${organizationSlug}`)
    revalidatePath(`/d/f/${organizationSlug}/c/${clientSlug}`)
}

export type ClientContactRecord = {
    id: string
    name: string
    email: string | null
    phone: string | null
    title: string | null
    notes: string | null
    tags: string[]
    isPrimary: boolean
    projectId: string | null
    projectName?: string | null
    createdAt: string
    updatedAt: string
}

async function assertCanManageClient(organizationSlug: string, clientSlug: string) {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true } }
        }
    })
    if (!firm || firm.members.length === 0) throw new Error('Unauthorized')
    const client = firm.clients[0]
    if (!client) throw new Error('Client not found')

    const { canManageClient } = await import('@/lib/permission-helpers')
    const canManage = await canManageClient(firm.id, client.id)
    if (!canManage) throw new Error('Insufficient permissions')

    return { firmId: firm.id, clientId: client.id }
}

export async function listClientContacts(organizationSlug: string, clientSlug: string): Promise<ClientContactRecord[]> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true } }
        }
    })
    if (!firm || firm.members.length === 0) throw new Error('Unauthorized')
    const client = firm.clients[0]
    if (!client) throw new Error('Client not found')

    const rows = await prisma.clientContact.findMany({
        where: { firmId: firm.id, clientId: client.id },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        select: {
            id: true, name: true, email: true, phone: true, title: true, notes: true, tags: true, isPrimary: true, engagementId: true,
            createdAt: true, updatedAt: true,
            engagement: { select: { name: true } }
        },
    })

    return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        title: r.title,
        notes: r.notes,
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        isPrimary: r.isPrimary,
        projectId: r.engagementId,
        projectName: r.engagement?.name ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
    }))
}

export async function createClientContact(
    organizationSlug: string,
    clientSlug: string,
    data: { name: string; email?: string; phone?: string; title?: string; notes?: string; tags?: string[]; projectId?: string | null }
): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')
    const { firmId, clientId } = await assertCanManageClient(organizationSlug, clientSlug)
    if (!data.name?.trim()) throw new Error('Name is required')
    await assertWithinClientContactCap(firmId)

    const contact = await prisma.clientContact.create({
        data: {
            firmId,
            clientId,
            name: data.name.trim(),
            email: data.email?.trim() || null,
            phone: data.phone?.trim() || null,
            title: data.title?.trim() || null,
            notes: data.notes?.trim() || null,
            tags: Array.isArray(data.tags) ? data.tags : [],
            engagementId: data.projectId ?? null,
            createdBy: user.id,
            updatedBy: user.id,
        }
    })

    audit(AUDIT_EVENT.CLIENT_CONTACT_CREATED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firmId)
        .client(clientId)
        .actor(user.id)
        .meta({ contactId: contact.id, contactName: data.name.trim() })
        .fireAndForget()

    revalidatePath(`/d/f/${organizationSlug}/c/${clientSlug}`)
}

export async function updateClientContact(
    organizationSlug: string,
    clientSlug: string,
    contactId: string,
    data: { name?: string; email?: string; phone?: string; title?: string; notes?: string; tags?: string[]; projectId?: string | null }
): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')
    const { firmId: updateFirmId, clientId: updateClientId } = await assertCanManageClient(organizationSlug, clientSlug)

    await prisma.clientContact.update({
        where: { id: contactId },
        data: {
            ...(data.name !== undefined && { name: data.name.trim() }),
            ...(data.email !== undefined && { email: data.email.trim() || null }),
            ...(data.phone !== undefined && { phone: data.phone.trim() || null }),
            ...(data.title !== undefined && { title: data.title.trim() || null }),
            ...(data.notes !== undefined && { notes: data.notes.trim() || null }),
            ...(data.tags !== undefined && { tags: Array.isArray(data.tags) ? data.tags : [] }),
            ...(data.projectId !== undefined && { engagementId: data.projectId ?? null }),
            updatedBy: user.id,
        }
    })

    audit(AUDIT_EVENT.CLIENT_CONTACT_CHANGED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(updateFirmId)
        .client(updateClientId)
        .actor(user.id)
        .meta({ contactId, changedFields: Object.keys(data) })
        .fireAndForget()

    revalidatePath(`/d/f/${organizationSlug}/c/${clientSlug}`)
}

export async function deleteClientContact(organizationSlug: string, clientSlug: string, contactId: string): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')
    const { firmId: delFirmId, clientId: delClientId } = await assertCanManageClient(organizationSlug, clientSlug)

    audit(AUDIT_EVENT.CLIENT_CONTACT_DELETED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(delFirmId)
        .client(delClientId)
        .actor(user.id)
        .meta({ contactId })
        .fireAndForget()

    await prisma.clientContact.delete({ where: { id: contactId } })
    revalidatePath(`/d/f/${organizationSlug}/c/${clientSlug}`)
}

export async function setClientContactPrimary(organizationSlug: string, clientSlug: string, contactId: string): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')
    const { clientId } = await assertCanManageClient(organizationSlug, clientSlug)

    await prisma.$transaction([
        prisma.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } }),
        prisma.clientContact.update({ where: { id: contactId }, data: { isPrimary: true } }),
    ])

    revalidatePath(`/d/f/${organizationSlug}/c/${clientSlug}`)
}

/**
 * Delete client (V2)
 */
export async function deleteClient(organizationSlug: string, clientSlug: string): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw new Error('Unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true } }
        }
    })

    if (!firm || firm.members.length === 0) throw new Error('Unauthorized')

    const memberRole = firm.members[0].role
    if (memberRole !== 'firm_admin') throw new Error('Only firm admins can delete a client')

    const client = firm.clients[0]
    if (!client) throw new Error('Client not found')

    audit(AUDIT_EVENT.CLIENT_DELETED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firm.id)
        .client(client.id)
        .actor(user.id)
        .meta({ clientSlug })
        .fireAndForget()

    await prisma.client.delete({
        where: { id: client.id }
    })

    revalidatePath(`/d/f/${organizationSlug}`)
}

// ── Connector sharing actions ──────────────────────────────────────────────

/** Return other clients (excluding the caller) that share the same connectorId. */
export async function getConnectorSiblingClients(clientId: string): Promise<{ id: string; name: string }[]> {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { connectorId: true },
    })
    if (!client?.connectorId) return []

    const siblings = await prisma.client.findMany({
        where: { connectorId: client.connectorId, id: { not: clientId }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    })
    return siblings
}

/** Link an existing firm connector to a client (shared row, no new connector created). */
export async function shareConnectorWithClient({
    clientId,
    connectorId,
}: {
    clientId: string
    connectorId: string
}) {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const [client, connector] = await Promise.all([
        prisma.client.findUnique({ where: { id: clientId }, select: { firmId: true, name: true, slug: true } }),
        prisma.connector.findUnique({ where: { id: connectorId }, select: { firmId: true } }),
    ])
    if (!client) throw new Error('Client not found')
    if (!connector) throw new Error('Connector not found')
    if (connector.firmId !== client.firmId) throw new Error('Cross-firm connector share not allowed')

    const { canManageClient } = await import('@/lib/permission-helpers')
    if (!(await canManageClient(client.firmId, clientId))) throw new Error('Unauthorized')

    await prisma.client.update({ where: { id: clientId }, data: { connectorId } })

    // Provision the client folder and all existing engagement folders in Drive.
    // Fire-and-forget — a failure here is non-fatal; folders will be created on first upload.
    try {
        const { googleDriveConnector } = await import('@/lib/google-drive-connector')
        const adapter = await googleDriveConnector.createGoogleDriveAdapter(connectorId)
        await googleDriveConnector.ensureAppFolderStructure(connectorId, client.name, client.slug, adapter, client.firmId)

        const engagements = await prisma.engagement.findMany({
            where: { clientId, isDeleted: false, connectorRootFolderId: null },
            select: { id: true, name: true, slug: true },
        })
        for (const eng of engagements) {
            try {
                const engResult = await googleDriveConnector.ensureAppFolderStructure(
                    connectorId, client.name, client.slug, adapter, client.firmId,
                    { projectName: eng.name, projectSlug: eng.slug }
                )
                if (engResult.projectId) {
                    await prisma.engagement.update({
                        where: { id: eng.id },
                        data: { connectorRootFolderId: engResult.projectId },
                    })
                }
            } catch (engErr) {
                const { logger } = await import('@/lib/logger')
                logger.error('[shareConnectorWithClient] Failed to provision engagement folder', engErr as Error, `engagementId:${eng.id}`)
            }
        }
    } catch (err) {
        const { logger } = await import('@/lib/logger')
        logger.warn('[shareConnectorWithClient] Failed to provision Drive folder — will retry on first upload', err as Error)
    }

    revalidatePath(`/d/f`)
}

export async function removeClientConnector({ clientId }: { clientId: string }) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { connectorId: true },
    })
    if (!client) throw new Error('Client not found')
    if (!client.connectorId) throw new Error('Client has no connector')

    const { removeConnector } = await import('@/lib/actions/connectors')
    await removeConnector({ connectorId: client.connectorId })
}

export async function renameClientConnector({ connectorId, name }: { connectorId: string; name: string }) {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const connector = await prisma.connector.findUnique({
        where: { id: connectorId },
        select: { userId: true },
    })
    if (!connector) throw new Error('Connector not found')
    if (connector.userId !== user.id) throw new Error('Unauthorized')

    await prisma.connector.update({
        where: { id: connectorId },
        data: { name: name.trim() },
    })
    revalidatePath(`/d/f`)
}

export async function disconnectClientConnector({ clientId }: { clientId: string }) {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { firmId: true, connectorId: true },
    })
    if (!client) throw new Error('Client not found')
    if (!client.connectorId) throw new Error('Client has no connector')

    const { canManageClient } = await import('@/lib/permission-helpers')
    if (!(await canManageClient(client.firmId, clientId))) throw new Error('Unauthorized')

    // Revoke tokens but keep client.connectorId linked — the REVOKED card stays visible
    // so the user can immediately Reconnect or Remove without an extra click.
    await prisma.connector.update({
        where: { id: client.connectorId },
        data: { status: 'REVOKED', accessToken: '', refreshToken: null, tokenExpiresAt: null },
    })
    revalidatePath(`/d/f`)
}

export interface ClientBrandData {
    name?: string | null
    subtext?: string | null
    logoData?: string | null
    logoUrl?: string | null
    logoAspectRatio?: string | null
    primaryColor?: string | null
    secondaryColor?: string | null
}

export async function upsertClientBrand(clientId: string, data: ClientBrandData | null): Promise<void> {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { firmId: true, name: true, settings: true },
    })
    if (!client) throw new Error('Client not found')

    const currentSettings = (client.settings as Record<string, unknown>) ?? {}
    const brandId = currentSettings?.brandId as string | undefined

    if (data === null) {
        // Toggle OFF: delete brand record and remove brandId from settings
        if (brandId) {
            await (prisma as any).brand.delete({ where: { id: brandId } }).catch(() => {})
        }
        const { brandId: _removed, ...settingsWithout } = currentSettings
        await prisma.client.update({ where: { id: clientId }, data: { settings: settingsWithout } })
    } else if (brandId) {
        await (prisma as any).brand.update({
            where: { id: brandId },
            data: {
                ...(data.name != null ? { name: data.name } : {}),
                subtext: data.subtext ?? null,
                logoData: data.logoData ?? null,
                logoUrl: data.logoUrl ?? null,
                logoAspectRatio: data.logoAspectRatio ?? null,
                primaryColor: data.primaryColor ?? null,
                secondaryColor: data.secondaryColor ?? null,
            },
        })
    } else {
        const brand = await (prisma as any).brand.create({
            data: {
                name: data.name || client.name,
                subtext: data.subtext ?? null,
                logoData: data.logoData ?? null,
                logoUrl: data.logoUrl ?? null,
                logoAspectRatio: data.logoAspectRatio ?? null,
                primaryColor: data.primaryColor ?? null,
                secondaryColor: data.secondaryColor ?? null,
            },
        })
        await prisma.client.update({
            where: { id: clientId },
            data: { settings: { ...currentSettings, brandId: brand.id } },
        })
    }

    revalidatePath(`/d/f`)
}
