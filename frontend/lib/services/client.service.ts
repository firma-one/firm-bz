import { prisma } from '@/lib/prisma'
import { getRlsPrisma } from '@/lib/prisma-server'
import { logger } from '@/lib/logger'
import { assertWithinClientCap } from '@/lib/billing/effective-billing-caps'

export interface ClientWithMembers {
    id: string
    firmId: string
    name: string
    slug: string
    industry?: string | null
    sector?: string | null
    status?: string | null
    website?: string | null
    description?: string | null
    tags?: string[]
    ownerId?: string | null
    settings?: any
    sandboxOnly: boolean
    members: {
        id: string
        userId: string
        role: string
        isDefault: boolean
    }[]
}

export class ClientService {
    /**
     * Map Prisma result to ClientWithMembers interface
     */
    private static mapToInterface(client: any): ClientWithMembers {
        if (!client) return null as any
        return {
            id: client.id,
            firmId: client.firmId,
            name: client.name,
            slug: client.slug,
            industry: client.industry,
            sector: client.sector,
            status: client.status,
            website: client.website ?? null,
            description: client.description ?? null,
            tags: Array.isArray(client.tags) ? (client.tags as string[]).filter((t) => typeof t === 'string') : [],
            ownerId: client.ownerId ?? null,
            settings: client.settings,
            sandboxOnly: client.sandboxOnly,
            members: client.members ? client.members.map((m: any) => ({
                id: m.id,
                userId: m.userId,
                role: m.persona?.slug || 'eng_viewer',
                isDefault: m.isDefault
            })) : []
        }
    }

    /**
     * Create a new client and add the creator as a member (Administrative action)
     */
    static async createClient(data: {
        firmId: string
        name: string
        creatorUserId: string
        industry?: string
        sector?: string
        website?: string
        description?: string
        tags?: string[]
        ownerId?: string | null
        status?: 'PROSPECT' | 'ACTIVE' | 'ON_HOLD' | 'PAST'
        sandboxOnly?: boolean
        settings?: any
    }): Promise<ClientWithMembers> {
        await assertWithinClientCap(data.firmId)
        const { generateClientSlug } = await import('@/lib/slug-utils')
        const slug = await generateClientSlug(data.name)

        // Fetch personas: eng_admin for creator, client_admin for firm admins (permission hierarchy)
        const projectAdminPersona = await (prisma as any).persona.findUnique({
            where: { slug: 'eng_admin' }
        })
        const clientAdminPersona = await (prisma as any).persona.findUnique({
            where: { slug: 'client_admin' }
        })

        if (!projectAdminPersona) {
            throw new Error("System Error: eng_admin persona not found in DB")
        }

        const client = await (prisma as any).$transaction(async (tx: any) => {
            const createdClient = await tx.client.create({
                data: {
                    firmId: data.firmId,
                    name: data.name,
                    slug,
                    industry: data.industry,
                    sector: data.sector,
                    website: data.website,
                    description: data.description,
                    tags: Array.isArray(data.tags) ? data.tags : [],
                    ownerId: data.ownerId ?? undefined,
                    status: data.status ?? 'ACTIVE',
                    createdBy: data.creatorUserId,
                    updatedBy: data.creatorUserId,
                    sandboxOnly: data.sandboxOnly ?? false,
                    settings: data.settings ?? {}
                }
            })

            // Add Creator as Client Admin (eng_admin for onboarding/sandbox)
            await tx.clientMember.create({
                data: {
                    clientId: createdClient.id,
                    userId: data.creatorUserId,
                    personaId: projectAdminPersona.id,
                    isDefault: true,
                    createdBy: data.creatorUserId,
                    updatedBy: data.creatorUserId,
                }
            })

            // Permission hierarchy: add Firm Admins as Client Admin (skip if already a member)
            if (clientAdminPersona) {
                const firmAdmins = await tx.firmMember.findMany({
                    where: { firmId: data.firmId, role: 'firm_admin' },
                    select: { userId: true }
                })
                for (const { userId: adminUserId } of firmAdmins) {
                    if (adminUserId === data.creatorUserId) continue
                    const existing = await tx.clientMember.findFirst({
                        where: { clientId: createdClient.id, userId: adminUserId }
                    })
                    if (!existing) {
                        await tx.clientMember.create({
                            data: {
                                clientId: createdClient.id,
                                userId: adminUserId,
                                personaId: clientAdminPersona.id,
                                createdBy: data.creatorUserId,
                                updatedBy: data.creatorUserId,
                            }
                        })
                    }
                }
            }

            return await tx.client.findUnique({
                where: { id: createdClient.id },
                include: {
                    members: {
                        include: { persona: true }
                    }
                }
            })
        })

        return this.mapToInterface(client)
    }

    /**
     * Get firm clients (Uses RLS!)
     */
    static async getFirmClients(firmId: string): Promise<ClientWithMembers[]> {
        const rlsPrisma = await getRlsPrisma()
        const clients = await rlsPrisma.client.findMany({
            where: { firmId },
            include: {
                members: {
                    include: { persona: true }
                }
            }
        })
        return clients.map(c => this.mapToInterface(c))
    }

    /** @deprecated Legacy alias */
    static async getOrganizationClients(organizationId: string): Promise<ClientWithMembers[]> {
        return this.getFirmClients(organizationId)
    }

    /**
     * Get client by ID (Uses RLS!)
     */
    static async getClientById(clientId: string): Promise<ClientWithMembers | null> {
        const rlsPrisma = await getRlsPrisma()
        const client = await rlsPrisma.client.findUnique({
            where: { id: clientId },
            include: {
                members: {
                    include: { persona: true }
                }
            }
        })
        return client ? this.mapToInterface(client) : null
    }
}
