'use server'

import { prisma } from '@/lib/prisma'
import { createClient as createSupabaseClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/logger'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'
import { ensureAppFolderStructure, setupFirmFolder } from '@/lib/connectors/pockett-structure.service'
import { getStorageAdapter } from '@/lib/connectors/registry'
import type { ClientStatus } from '@prisma/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { upsertFollowUpReminder } from '@/lib/reminders/reminder-service'
import { assertWithinClientCap, assertWithinClientContactCap } from '@/lib/billing/effective-billing-caps'
import { clientPath, firmPath } from '@/lib/navigation/firm-paths'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { asResultWithWarning, connectorProviderName, gone, notAllowed, readableReason, signedOut } from '@/lib/actions/action-reasons'
import { takeBackEngagementAccess, type EngagementAccessLeft } from '@/lib/connectors/firm-folder-access'
import { accessLeftAfterDelete, storageProviderName } from '@/lib/storage-access-notice'

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

export type CreatedClient = { id: string; name: string; slug: string }

/**
 * Create a new client (V2). Answers a `warning` when the client was created but its folder in storage
 * couldn't be made yet (it's made again with its first engagement, or Set up storage folder in Files).
 */
export async function createClient(organizationSlug: string, data: CreateClientData): Promise<ActionResult<CreatedClient>> {
    return asResultWithWarning('createClient', () => createClientOrThrow(organizationSlug, data))
}

async function createClientOrThrow(organizationSlug: string, data: CreateClientData): Promise<{ data: CreatedClient; warning?: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw signedOut()
    }

    // 1. Resolve firm & check permissions
    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            group: { select: { slug: true } }
        }
    })

    if (!firm || firm.members.length === 0) {
        throw notAllowed('add clients to this firm')
    }

    const { requireAccess } = await import('@/lib/billing/subscription-gate')
    await requireAccess(firm.id, 'clients.create')
    await assertWithinClientCap(firm.id)

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
        throw userFacing('A client with this name already exists', 'name_taken')
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
        throw userFacing("Couldn't make a unique link for this client. Try again.", 'slug_taken')
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

    // 5. Create storage folder structure if connected (Google Drive or OneDrive). The client stands
    // without it (its first engagement, or Set up storage folder in Files, makes it again), but the
    // person is told it isn't there yet.
    let folderWarning: string | undefined
    let folderConnectorId: string | null = null
    try {
        const { connectorId } = await resolveClientConnector(newClient.id)
        folderConnectorId = connectorId
        if (connectorId) {
            const adapter = await getStorageAdapter(connectorId)
            await ensureAppFolderStructure(
                connectorId,
                newClient.name,
                newClient.slug,
                adapter,
                firm.id
            )
        }
    } catch (e) {
        logger.error("Failed to create storage connector folder for client", e as Error)
        const provider = await connectorProviderName(folderConnectorId)
        const why = readableReason(e)
        folderWarning = `Client added, but its folder in ${provider} couldn't be created yet${why ? ` · ${why}` : ''}. It's made again with its first engagement.`
    }

    // Upsert follow-up reminder if followUpDate was set.
    // KEEP: client follow-up dates are paused, not retired — hidden from the UI on 2026-10-17 and to be revived. Don't remove this as unused.
    await upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.clients.id',
        entityValue: newClient.id,
        action: 'Follow-up',
        dateKey: 'platform.clients.followUpDate',
        dateValue: data.followUpDate ?? null,
        entityName: newClient.name,
        firmId: firm.id,
        ctaUrl: clientPath(firm.group.slug, organizationSlug, newClient.slug),
        note: data.internalMemo ?? null,
    }).catch(() => {})
    await upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.clients.id',
        entityValue: newClient.id,
        action: 'Close deal',
        dateKey: 'platform.clients.expectedCloseDate',
        dateValue: data.expectedCloseDate ?? null,
        entityName: newClient.name,
        firmId: firm.id,
        ctaUrl: clientPath(firm.group.slug, organizationSlug, newClient.slug),
        note: data.internalMemo ?? null,
    }).catch(() => {})

    revalidatePath(firmPath(firm.group.slug, organizationSlug))
    return {
        data: { id: newClient.id, name: newClient.name, slug: newClient.slug },
        ...(folderWarning ? { warning: folderWarning } : {}),
    }
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
): Promise<ActionResult> {
    return asResult('updateClient', () => updateClientOrThrow(organizationSlug, clientSlug, data))
}

async function updateClientOrThrow(
    organizationSlug: string,
    clientSlug: string,
    data: UpdateClientData
): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true, name: true } },
            group: { select: { slug: true } }
        }
    })
    if (!firm || firm.members.length === 0) throw notAllowed('change this client')
    const client = firm.clients[0]
    if (!client) throw gone('This client was deleted.')

    const { canManageClient } = await import('@/lib/permission-helpers')
    const canManage = await canManageClient(firm.id, client.id)
    if (!canManage) throw notAllowed('change this client')

    if (data.ownerId !== undefined && data.ownerId !== null) {
        const ownerMember = await prisma.firmMember.findFirst({
            where: { firmId: firm.id, userId: data.ownerId },
        })
        if (!ownerMember) throw userFacing('The owner must be a member of this firm.', 'invalid_owner')
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
        const ctaUrl = clientPath(firm.group.slug, organizationSlug, latest?.slug ?? clientSlug)
        const entityName = data.name ?? client.name
        if (effectiveOwnerId) {
            const memo = data.internalMemo !== undefined ? data.internalMemo : latest?.internalMemo ?? null
            // KEEP: client follow-up dates are paused, not retired — hidden from the UI on 2026-10-17 and to be revived. Don't remove this as unused.
            await upsertFollowUpReminder({
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
            await upsertFollowUpReminder({
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

    revalidatePath(firmPath(firm.group.slug, organizationSlug))
    revalidatePath(clientPath(firm.group.slug, organizationSlug, clientSlug))
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
    if (error || !user) throw signedOut()

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true } },
            group: { select: { slug: true } }
        }
    })
    if (!firm || firm.members.length === 0) throw notAllowed("change this client's contacts")
    const client = firm.clients[0]
    if (!client) throw gone('This client was deleted.')

    const { canManageClient } = await import('@/lib/permission-helpers')
    const canManage = await canManageClient(firm.id, client.id)
    if (!canManage) throw notAllowed("change this client's contacts")

    return { firmId: firm.id, clientId: client.id, groupSlug: firm.group.slug }
}

/** A contact of this client, or a not-found the person can read. Contacts are addressed by id. */
async function requireClientContact(clientId: string, contactId: string): Promise<void> {
    const contact = await prisma.clientContact.findFirst({ where: { id: contactId, clientId }, select: { id: true } })
    if (!contact) throw gone('This contact was deleted.')
}

export async function listClientContacts(organizationSlug: string, clientSlug: string): Promise<ActionResult<ClientContactRecord[]>> {
    return asResult('listClientContacts', () => listClientContactsOrThrow(organizationSlug, clientSlug))
}

async function listClientContactsOrThrow(organizationSlug: string, clientSlug: string): Promise<ClientContactRecord[]> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true } }
        }
    })
    if (!firm || firm.members.length === 0) throw notAllowed("see this client's contacts")
    const client = firm.clients[0]
    if (!client) throw gone('This client was deleted.')

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
): Promise<ActionResult> {
    return asResult('createClientContact', () => createClientContactOrThrow(organizationSlug, clientSlug, data))
}

async function createClientContactOrThrow(
    organizationSlug: string,
    clientSlug: string,
    data: { name: string; email?: string; phone?: string; title?: string; notes?: string; tags?: string[]; projectId?: string | null }
): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()
    const { firmId, clientId, groupSlug } = await assertCanManageClient(organizationSlug, clientSlug)
    if (!data.name?.trim()) throw userFacing('A contact needs a name.', 'name_required')
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

    revalidatePath(clientPath(groupSlug, organizationSlug, clientSlug))
}

export async function updateClientContact(
    organizationSlug: string,
    clientSlug: string,
    contactId: string,
    data: { name?: string; email?: string; phone?: string; title?: string; notes?: string; tags?: string[]; projectId?: string | null }
): Promise<ActionResult> {
    return asResult('updateClientContact', () => updateClientContactOrThrow(organizationSlug, clientSlug, contactId, data))
}

async function updateClientContactOrThrow(
    organizationSlug: string,
    clientSlug: string,
    contactId: string,
    data: { name?: string; email?: string; phone?: string; title?: string; notes?: string; tags?: string[]; projectId?: string | null }
): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()
    const { firmId: updateFirmId, clientId: updateClientId, groupSlug: updateGroupSlug } = await assertCanManageClient(organizationSlug, clientSlug)
    await requireClientContact(updateClientId, contactId)
    if (data.name !== undefined && !data.name.trim()) throw userFacing('A contact needs a name.', 'name_required')

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

    revalidatePath(clientPath(updateGroupSlug, organizationSlug, clientSlug))
}

export async function deleteClientContact(organizationSlug: string, clientSlug: string, contactId: string): Promise<ActionResult> {
    return asResult('deleteClientContact', () => deleteClientContactOrThrow(organizationSlug, clientSlug, contactId))
}

async function deleteClientContactOrThrow(organizationSlug: string, clientSlug: string, contactId: string): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()
    const { firmId: delFirmId, clientId: delClientId, groupSlug: delGroupSlug } = await assertCanManageClient(organizationSlug, clientSlug)
    await requireClientContact(delClientId, contactId)

    await prisma.clientContact.delete({ where: { id: contactId } })

    // After the delete, so the audit never records one that didn't happen.
    audit(AUDIT_EVENT.CLIENT_CONTACT_DELETED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(delFirmId)
        .client(delClientId)
        .actor(user.id)
        .meta({ contactId })
        .fireAndForget()

    revalidatePath(clientPath(delGroupSlug, organizationSlug, clientSlug))
}

export async function setClientContactPrimary(organizationSlug: string, clientSlug: string, contactId: string): Promise<ActionResult> {
    return asResult('setClientContactPrimary', () => setClientContactPrimaryOrThrow(organizationSlug, clientSlug, contactId))
}

async function setClientContactPrimaryOrThrow(organizationSlug: string, clientSlug: string, contactId: string): Promise<void> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw signedOut()
    const { clientId, groupSlug } = await assertCanManageClient(organizationSlug, clientSlug)
    await requireClientContact(clientId, contactId)

    await prisma.$transaction([
        prisma.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } }),
        prisma.clientContact.update({ where: { id: contactId }, data: { isPrimary: true } }),
    ])

    revalidatePath(clientPath(groupSlug, organizationSlug, clientSlug))
}

/**
 * Delete client (V2)
 *
 * Deleting the client deletes its engagements, their members and sharing rows with it (FK cascade), so
 * the storage access they gave is taken back first, engagement by engagement (takeBackEngagementAccess):
 * file permissions, then the engagements' folders restricted to their owner. What storage still allows
 * is answered as the result's `warning`.
 */
export async function deleteClient(organizationSlug: string, clientSlug: string): Promise<ActionResult> {
    const result = await asResult('deleteClient', () => deleteClientAndAccess(organizationSlug, clientSlug))
    if (!result.ok) return result
    return { ok: true, data: undefined, ...(result.data.warning ? { warning: result.data.warning } : {}) }
}

async function deleteClientAndAccess(organizationSlug: string, clientSlug: string): Promise<{ warning?: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) throw userFacing('Your session has ended. Sign in again.', 'unauthorized')

    const firm = await prisma.firm.findUnique({
        where: { slug: organizationSlug },
        include: {
            members: { where: { userId: user.id } },
            clients: { where: { slug: clientSlug }, select: { id: true } },
            group: { select: { slug: true } }
        }
    })

    if (!firm || firm.members.length === 0) throw userFacing("You don't have permission to delete this client.", 'forbidden')

    const memberRole = firm.members[0].role
    if (memberRole !== 'firm_admin') throw userFacing('Only firm admins can delete a client', 'forbidden')

    const client = firm.clients[0]
    if (!client) throw userFacing('This client was already deleted.', 'not_found')

    // Storage access first: the delete takes the rows that record it.
    const engagements = await prisma.engagement.findMany({
        where: { clientId: client.id, isDeleted: false },
        select: { id: true },
    })
    const provider = engagements.length > 0 ? await storageProviderName(engagements[0].id) : 'Storage'
    const left: EngagementAccessLeft = { files: [], folderAccess: [], foldersUnchecked: false }
    for (const engagement of engagements) {
        const one = await takeBackEngagementAccess(engagement.id)
        left.files.push(...one.files)
        left.folderAccess.push(...one.folderAccess)
        left.foldersUnchecked ||= one.foldersUnchecked
        left.reason ??= one.reason
    }
    left.folderAccess = Array.from(new Set(left.folderAccess))

    await prisma.client.delete({
        where: { id: client.id }
    })

    // After the delete, so the audit never records one that didn't happen.
    audit(AUDIT_EVENT.CLIENT_DELETED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firm.id)
        .client(client.id)
        .actor(user.id)
        .meta({ clientSlug })
        .fireAndForget()

    revalidatePath(firmPath(firm.group.slug, organizationSlug))

    const warning = accessLeftAfterDelete({ done: 'Client deleted', provider, left })
    return warning ? { warning } : {}
}

/**
 * Caller may manage this client (client or firm can_manage) — the gate the client Settings tab and
 * disconnectClientConnector already use. For actions addressed only by clientId: the firm is read
 * from the client row, never taken from the caller. Returns the client's firm.
 */
async function requireClientManager(clientId: string, toDoWhat = 'change this client'): Promise<{ firmId: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { firmId: true } })
    if (!client) throw gone('This client was deleted.')
    const { canManageClient } = await import('@/lib/permission-helpers')
    if (!(await canManageClient(client.firmId, clientId))) throw notAllowed(toDoWhat)
    return { firmId: client.firmId }
}

// ── Connector sharing actions ──────────────────────────────────────────────

/** Return other clients (excluding the caller) that share the same connectorId. */
export async function getConnectorSiblingClients(clientId: string): Promise<ActionResult<{ id: string; name: string }[]>> {
    return asResult('getConnectorSiblingClients', async () => {
        await requireClientManager(clientId, "see this client's storage")
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { connectorId: true },
        })
        if (!client?.connectorId) return []

        return prisma.client.findMany({
            where: { connectorId: client.connectorId, id: { not: clientId }, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        })
    })
}

/** What attaching a client to a connector did, beyond the link itself. */
export type ShareConnectorOutcome = {
    /** The client's own folder couldn't be set up. The link stands; the folder is retried on its next use. */
    folderFailed: boolean
    /** Engagements still without a folder after this attach. */
    engagementsWithoutFolder: string[]
}

/**
 * Link an existing firm connector to a client (shared row, no new connector created).
 *
 * The link is the action; the folders are its follow-on. When the link is saved but the client's folder
 * (or an engagement's) can't be set up, the answer is still ok, with a `warning` that says what's
 * missing and why, and the auto-filed support ticket's number. A thrown error class can't reach the
 * browser, so "linked, with a problem" has to travel in the result.
 */
export async function shareConnectorWithClient(input: { clientId: string; connectorId: string }): Promise<ActionResult<ShareConnectorOutcome>> {
    return asResultWithWarning('shareConnectorWithClient', () => shareConnectorWithClientOrThrow(input))
}

async function shareConnectorWithClientOrThrow({
    clientId,
    connectorId,
}: {
    clientId: string
    connectorId: string
}): Promise<{ data: ShareConnectorOutcome; warning?: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const [client, connector] = await Promise.all([
        prisma.client.findUnique({ where: { id: clientId }, select: { firmId: true, name: true, slug: true } }),
        prisma.connector.findUnique({ where: { id: connectorId }, select: { firmId: true, settings: true, type: true } }),
    ])
    if (!client) throw gone('This client was deleted.')
    if (!connector) throw gone('This storage connection was removed.')
    if (connector.firmId !== client.firmId) throw notAllowed('attach this storage to that client')

    const { canManageClient } = await import('@/lib/permission-helpers')
    if (!(await canManageClient(client.firmId, clientId))) throw notAllowed("change this client's storage")

    await prisma.client.update({ where: { id: clientId }, data: { connectorId } })

    const firm = await prisma.firm.findUnique({ where: { id: client.firmId }, select: { slug: true } })
    audit(AUDIT_EVENT.STORAGE_CONNECTOR_ATTACHED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(client.firmId)
        .client(clientId)
        .actor(user.id)
        .meta({ connectorId })
        .fireAndForget()

    const provider = connector.type === 'GOOGLE_DRIVE' ? 'Google Drive' : connector.type === 'ONEDRIVE' ? 'OneDrive' : 'storage'

    // Provision the client folder and all existing engagement folders. ensureAppFolderStructure
    // is provider-agnostic (built against IConnectorStorageAdapter); getStorageAdapter resolves
    // the right adapter for whatever connector type this is.
    //
    // The client link above (Client.connectorId) is a valid, independent action and is not rolled
    // back if this fails — but a provisioning failure here must NOT be swallowed. It used to be
    // caught and only logger.warn'd, with the misleading comment "will retry on first upload"
    // (nothing actually retries automatically) — so the UI showed a plain success toast while the
    // client was silently left with no working Drive folder. Confirmed live 2026-08-07: this
    // masked a real bug (see .claude/plans/connector-microsoft-impl.md) where the failure never
    // surfaced anywhere the user could see it. It's answered as the result's warning, with a support
    // ticket auto-filed with the failure details.
    const engagementsWithoutFolder: string[] = []
    let engagementReason: string | undefined
    try {
        const adapter = await getStorageAdapter(connectorId)

        // A connector's Firm-name subfolder (settings.organizations[firmId].orgFolderId) is only
        // created by setupFirmFolder — normally run at connect time by the Migrate/site-selection
        // flow (update-root-folder / sites/route.ts). Both of those flows resolve "which firm"
        // via Firm.connectorId (legacy) or an already-attached Client.connectorId — but at the
        // moment a connector is first auto-provisioned (OneDrive Personal's no-click auto-create,
        // or a freshly-selected SharePoint site), NO client is attached yet, so that resolution
        // finds nothing and setupFirmFolder is silently skipped for both location types. This is
        // the first point afterward that reliably knows the firm (this client's own firmId) — run
        // it here if it was never run for this connector, so ensureAppFolderStructure below has an
        // orgFolderId to find. Confirmed live 2026-08-14 against a OneDrive Personal connector.
        // See .claude/plans/connector-microsoft-impl.md.
        const settings = (connector.settings as Record<string, unknown>) || {}
        const orgSettings = (settings.organizations as Record<string, Record<string, unknown>> | undefined)?.[client.firmId]
        const rootFolderId = settings.rootFolderId as string | undefined
        if (!orgSettings?.orgFolderId && rootFolderId) {
            await setupFirmFolder(connectorId, rootFolderId, adapter, client.firmId)
        }

        await ensureAppFolderStructure(connectorId, client.name, client.slug, adapter, client.firmId)

        const engagements = await prisma.engagement.findMany({
            where: { clientId, isDeleted: false, connectorRootFolderId: null },
            select: { id: true, name: true, slug: true },
        })
        for (const eng of engagements) {
            try {
                const engResult = await ensureAppFolderStructure(
                    connectorId, client.name, client.slug, adapter, client.firmId,
                    { projectName: eng.name, projectSlug: eng.slug }
                )
                if (engResult.projectId) {
                    await prisma.engagement.update({
                        where: { id: eng.id },
                        data: { connectorRootFolderId: engResult.projectId },
                    })
                } else {
                    engagementsWithoutFolder.push(eng.name)
                }
            } catch (engErr) {
                logger.error('[shareConnectorWithClient] Failed to provision engagement folder', engErr as Error, `engagementId:${eng.id}`)
                engagementsWithoutFolder.push(eng.name)
                engagementReason ??= readableReason(engErr)
            }
        }
    } catch (err) {
        const { reportActionFailure } = await import('@/lib/actions/report-action-failure')
        const { ticketNumber } = await reportActionFailure({
            action: 'shareConnectorWithClient: provision Drive folder',
            error: err,
            context: { clientId, connectorId, firmId: client.firmId },
            firmSlug: firm?.slug,
            clientSlug: client.slug,
        })
        revalidatePath('/d/[groupSlug]/f', 'layout')
        const why = readableReason(err)
        const ticket = ticketNumber ? ` Support ticket #${ticketNumber} filed.` : ''
        return {
            data: { folderFailed: true, engagementsWithoutFolder },
            warning: `Attached, but its folder in ${provider} couldn't be set up${why ? ` · ${why}` : '.'}${ticket}`,
        }
    }

    revalidatePath('/d/[groupSlug]/f', 'layout')

    if (engagementsWithoutFolder.length === 0) return { data: { folderFailed: false, engagementsWithoutFolder } }
    const count = engagementsWithoutFolder.length
    return {
        data: { folderFailed: false, engagementsWithoutFolder },
        warning: `Attached. ${count === 1 ? '1 engagement has' : `${count} engagements have`} no folder in ${provider} yet: ${engagementsWithoutFolder.join(', ')}${engagementReason ? ` · ${engagementReason}` : ''}. Open it and use Set up storage folder.`,
    }
}

export async function removeClientConnector({ clientId }: { clientId: string }): Promise<ActionResult> {
    return asResult('removeClientConnector', async () => {
        await requireClientManager(clientId, "change this client's storage")
        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { connectorId: true },
        })
        if (!client) throw gone('This client was deleted.')
        if (!client.connectorId) throw userFacing('This client has no storage attached.', 'no_connector')

        const { removeConnector } = await import('@/lib/actions/connectors')
        await removeConnector({ connectorId: client.connectorId })
    })
}

export async function renameClientConnector({ connectorId, name }: { connectorId: string; name: string }): Promise<ActionResult> {
    return asResult('renameClientConnector', async () => {
        const supabase = await createSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw signedOut()

        const connector = await prisma.connector.findUnique({
            where: { id: connectorId },
            select: { userId: true },
        })
        if (!connector) throw gone('This storage connection was removed.')
        if (connector.userId !== user.id) throw userFacing('Only the person who connected this storage can rename it.', 'forbidden')
        if (!name.trim()) throw userFacing('A connection needs a name.', 'name_required')

        await prisma.connector.update({
            where: { id: connectorId },
            data: { name: name.trim() },
        })
        revalidatePath('/d/[groupSlug]/f', 'layout')
    })
}

export async function disconnectClientConnector({ clientId }: { clientId: string }): Promise<ActionResult> {
    return asResult('disconnectClientConnector', async () => {
        const supabase = await createSupabaseClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw signedOut()

        const client = await prisma.client.findUnique({
            where: { id: clientId },
            select: { firmId: true, connectorId: true },
        })
        if (!client) throw gone('This client was deleted.')
        if (!client.connectorId) throw userFacing('This client has no storage attached.', 'no_connector')

        const { canManageClient } = await import('@/lib/permission-helpers')
        if (!(await canManageClient(client.firmId, clientId))) throw notAllowed("change this client's storage")

        // Revoke tokens but keep client.connectorId linked — the REVOKED card stays visible
        // so the user can immediately Reconnect or Remove without an extra click.
        await prisma.connector.update({
            where: { id: client.connectorId },
            data: { status: 'REVOKED', accessToken: '', refreshToken: null, tokenExpiresAt: null },
        })
        revalidatePath('/d/[groupSlug]/f', 'layout')
    })
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

export async function upsertClientBrand(clientId: string, data: ClientBrandData | null): Promise<ActionResult> {
    return asResult('upsertClientBrand', () => upsertClientBrandOrThrow(clientId, data))
}

async function upsertClientBrandOrThrow(clientId: string, data: ClientBrandData | null): Promise<void> {
    await requireClientManager(clientId, "change this client's branding")
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { firmId: true, name: true, settings: true },
    })
    if (!client) throw gone('This client was deleted.')

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

    revalidatePath('/d/[groupSlug]/f', 'layout')
}
