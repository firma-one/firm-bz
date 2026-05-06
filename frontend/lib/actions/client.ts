'use server'

import { prisma } from '@/lib/prisma'
import { createClient as createSupabaseClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { logger } from '@/lib/logger'
import type { ClientStatus } from '@prisma/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

export type LwCrmClientStatus = 'PROSPECT' | 'ACTIVE' | 'ON_HOLD' | 'PAST'

export interface CreateClientData {
    name: string
    industry?: string
    sector?: string
    status?: LwCrmClientStatus
    website?: string
    description?: string
    tags?: string[]
    ownerId?: string | null
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

    const membership = firm.members[0]
    if (!membership) {
        throw new Error('Unauthorized')
    }

    if (data.ownerId) {
        const ownerMember = await prisma.firmMember.findFirst({
            where: { firmId: firm.id, userId: data.ownerId },
        })
        if (!ownerMember) throw new Error('Owner must be a member of this firm')
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
                ownerId: data.ownerId ?? null,
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
        const connectorId = firm.connectorId
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
        orderBy: { createdAt: 'desc' },
        select: {
            id: true, name: true, email: true, phone: true, title: true, notes: true, tags: true, engagementId: true,
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
