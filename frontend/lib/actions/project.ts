'use server'

import { prisma } from '@/lib/prisma'
import { type EngagementStatus } from '@prisma/client'
import { createClient as createSupabaseClient } from '@/utils/supabase/server'
import { upsertFollowUpReminder } from '@/lib/actions/user-reminders'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { canViewProjectSettings as checkCanViewProjectSettings } from '@/lib/permission-helpers'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'
import { logger } from '@/lib/logger'
import { safeInngestSend } from '@/lib/inngest/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const supabaseAdmin = createSupabaseAdmin(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type LwCrmEngagementStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'PAUSED'

function parseRateOrValue(
    v: string | number | null | undefined
): string | null | undefined {
    if (v === undefined) return undefined
    if (v === null || v === '') return null
    const s = String(v).trim()
    return s === '' ? null : s
}

export interface CreateProjectData {
    name: string
    description?: string
    status?: LwCrmEngagementStatus
    startDate?: string | null
    endDate?: string | null
    followUpDate?: string | null
    contractType?: string
    rateOrValue?: string | number | null
    tags?: string[]
    internalMemo?: string | null
}

/**
 * Create a new project for the current user (V2)
 */
export async function createEngagement(firmSlug: string, clientSlug: string, data: CreateProjectData) {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error('Unauthorized')
    }

    // 1. Resolve Org & Check Permissions (V2)
    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        include: {
            members: {
                where: { userId: user.id }
            }
        }
    })

    if (!firm) {
        throw new Error('Firm not found')
    }

    const { requireAccess } = await import('@/lib/billing/subscription-gate')
    await requireAccess(firm.id, 'projects.create')

    const membership = firm.members[0]
    if (!membership) {
        throw new Error('Unauthorized')
    }

    // 2. Resolve Client (V2)
    const client = await (prisma as any).client.findFirst({
        where: {
            firmId: firm.id,
            slug: clientSlug
        }
    })

    if (!client) {
        throw new Error('Client not found')
    }

    // 3. Check for duplicate Project Name (V2)
    const existingName = await prisma.engagement.findFirst({
        where: {
            clientId: client.id,
            name: {
                equals: data.name,
                mode: 'insensitive'
            }
        }
    })

    if (existingName) {
        throw new Error('A project with this name already exists for this client')
    }

    // 4. Generate Slug and ensure uniqueness (V2)
    const { generateProjectSlug } = await import('@/lib/slug-utils')
    const MAX_SLUG_ATTEMPTS = 10
    let slug = generateProjectSlug(data.name)
    let attempts = 0
    while (attempts < MAX_SLUG_ATTEMPTS) {
        const existingSlug = await prisma.engagement.findUnique({
            where: {
                clientId_slug: {
                    clientId: client.id,
                    slug
                }
            }
        })
        if (!existingSlug) break
        slug = generateProjectSlug(data.name)
        attempts++
    }
    if (attempts >= MAX_SLUG_ATTEMPTS) {
        throw new Error('Could not generate a unique project slug. Please try again.')
    }

    const { assertWithinActiveEngagementCap } = await import('@/lib/billing/effective-billing-caps')
    await assertWithinActiveEngagementCap(firm.id)

    const clientAdminPersona = await prisma.persona.findUnique({
        where: { slug: 'client_admin' }
    })
    const [firmAdmins, clientAdmins] = await Promise.all([
        prisma.firmMember.findMany({
            where: { firmId: firm.id, role: 'firm_admin' },
            select: { userId: true }
        }),
        clientAdminPersona
            ? prisma.clientMember.findMany({
                where: { clientId: client.id, personaId: clientAdminPersona.id },
                select: { userId: true }
            })
            : []
    ])
    const leadUserIds = Array.from(new Set([
        ...firmAdmins.map((m) => m.userId),
        ...clientAdmins.map((m) => m.userId)
    ])).filter((id) => id !== user.id)

    // 5–6. Engagement + members in one transaction (Drive step below must succeed or we roll back)
    const kickoff = data.startDate ? new Date(data.startDate) : null
    const due = data.endDate ? new Date(data.endDate) : null
    const followUp = data.followUpDate ? new Date(data.followUpDate) : null
    const rateParsed = parseRateOrValue(data.rateOrValue)
    const newProject = await prisma.$transaction(async (tx) => {
        const project = await tx.engagement.create({
            data: {
                firmId: firm.id,
                clientId: client.id,
                name: data.name,
                slug: slug,
                description: data.description,
                status: (data.status ?? 'ACTIVE') as EngagementStatus,
                kickoffDate: kickoff,
                dueDate: due,
                followUpDate: followUp,
                contractType: data.contractType?.trim() || null,
                ...(rateParsed !== undefined ? { rateOrValue: rateParsed } : {}),
                tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
                ...(data.internalMemo != null ? { settings: { internalMemo: data.internalMemo } } : {}),
                createdBy: user.id,
                updatedBy: user.id,
            }
        })

        await tx.engagementMember.create({
            data: {
                engagementId: project.id,
                userId: user.id,
                role: 'eng_admin',
                createdBy: user.id,
                updatedBy: user.id,
            }
        })
        for (const uid of leadUserIds) {
            await tx.engagementMember.create({
                data: {
                    engagementId: project.id,
                    userId: uid,
                    role: 'eng_admin',
                    createdBy: user.id,
                    updatedBy: user.id,
                }
            })
        }
        return project
    })

    // 7. Google Drive folder structure — required when a connector exists; failure rolls back the engagement
    const { connectorId } = await resolveClientConnector(client.id)
    if (connectorId) {
        try {
            const result = await googleDriveConnector.ensureAppFolderStructure(
                connectorId,
                client.name,
                client.slug,
                await googleDriveConnector.createGoogleDriveAdapter(connectorId),
                firm.id,
                {
                    projectName: newProject.name,
                    projectSlug: newProject.slug
                }
            )

            if (result.projectId) {
                await prisma.engagement.update({
                    where: { id: newProject.id },
                    data: { connectorRootFolderId: result.projectId, updatedBy: user.id }
                })
            }
        } catch (e) {
            logger.error('Failed to create Google Drive folder structure for project', e as Error)
            try {
                await prisma.engagement.delete({ where: { id: newProject.id } })
            } catch (delErr) {
                logger.error('Failed to roll back engagement after Drive error', delErr as Error)
            }
            const detail = e instanceof Error ? e.message : String(e)
            throw new Error(
                `Could not finish creating this engagement because Google Drive setup failed: ${detail}`
            )
        }
    }

    audit(AUDIT_EVENT.ENGAGEMENT_CREATED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(firm.id)
        .client(client.id)
        .engagement(newProject.id)
        .actor(user.id)
        .meta({ name: newProject.name, slug: newProject.slug })
        .fireAndForget()

    const engCtaUrl = `/d/f/${firmSlug}/c/${clientSlug}/e/${newProject.slug}`
    const engNote = data.internalMemo ?? null
    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.engagements.id',
        entityValue: newProject.id,
        action: 'Engagement due',
        dateKey: 'platform.engagements.dueDate',
        dateValue: due?.toISOString() ?? null,
        entityName: newProject.name,
        firmId: firm.id,
        ctaUrl: engCtaUrl,
        note: engNote,
    }).catch(() => {})
    if (kickoff && kickoff > new Date()) {
        upsertFollowUpReminder({
            userId: user.id,
            entityKey: 'platform.engagements.id',
            entityValue: newProject.id,
            action: 'Engagement kickoff',
            dateKey: 'platform.engagements.kickoffDate',
            dateValue: kickoff.toISOString(),
            entityName: newProject.name,
            firmId: firm.id,
            ctaUrl: engCtaUrl,
            note: engNote,
        }).catch(() => {})
    }
    if (followUp) {
        upsertFollowUpReminder({
            userId: user.id,
            entityKey: 'platform.engagements.id',
            entityValue: newProject.id,
            action: 'Follow-up',
            dateKey: 'platform.engagements.followUpDate',
            dateValue: followUp.toISOString(),
            entityName: newProject.name,
            firmId: firm.id,
            ctaUrl: engCtaUrl,
            note: engNote,
        }).catch(() => {})
    }

    revalidatePath(`/d/f/${firmSlug}/c/${clientSlug}`)
    return { id: newProject.id, slug: newProject.slug, name: newProject.name }
}

/**
 * Get project folder IDs (V2)
 */
export async function getEngagementFolderIds(projectId: string) {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw new Error('Unauthorized')
    }

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        include: {
            client: {
                include: {
                    firm: true
                }
            }
        }
    })

    if (!project) {
        throw new Error('Project not found')
    }

    const connectorId = project.client.connectorId
    if (!connectorId) {
        return { generalFolderId: null, confidentialFolderId: null, stagingFolderId: null, isProjectLead: false }
    }

    const folderIds = await googleDriveConnector.getProjectFolderIds(connectorId, project.slug, {
        projectName: project.name,
        clientSlug: project.client.slug,
        clientName: project.client.name,
        projectFolderId: project.connectorRootFolderId
    })

    const projectMember = await prisma.engagementMember.findFirst({
        where: { engagementId: project.id, userId: user.id }
    })

    const isProjectLead = projectMember?.role === 'eng_admin'

    return {
        ...folderIds,
        isProjectLead
    }
}

/**
 * Check project settings visibility (V2)
 */
export async function canViewEngagementSettings(projectId: string): Promise<boolean> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return false

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { id: true, firmId: true, clientId: true }
    })
    if (!project) return false

    return await checkCanViewProjectSettings(
        project.firmId,
        project.clientId,
        project.id
    )
}

async function assertCanManageProject(projectId: string) {
    const can = await canViewEngagementSettings(projectId)
    if (!can) throw new Error('Insufficient permissions')
}

/**
 * Update project (V2)
 */
export async function updateEngagement(
    projectId: string,
    data: {
        name?: string
        description?: string
        kickoffDate?: string | null
        dueDate?: string | null
        followUpDate?: string | null
        status?: LwCrmEngagementStatus
        contractType?: string | null
        rateOrValue?: string | number | null
        tags?: string[]
        internalMemo?: string | null
    },
    firmSlug: string,
    clientSlug: string
) {
    await assertCanManageProject(projectId)

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { firmId: true, clientId: true, dueDate: true, kickoffDate: true, status: true, settings: true }
    })
    if (!project) throw new Error('Project not found')

    // Only allow status changes on completed engagements (for reopening); block all other updates
    if (project.status === 'COMPLETED' && (!data.status || data.status === 'COMPLETED')) {
        throw new Error('Cannot update a completed engagement.')
    }

    const parsedKickoff = data.kickoffDate === undefined ? undefined : (data.kickoffDate ? new Date(data.kickoffDate) : null)
    const parsedDue = data.dueDate === undefined ? undefined : (data.dueDate ? new Date(data.dueDate) : null)
    const parsedFollowUp = data.followUpDate === undefined ? undefined : (data.followUpDate ? new Date(data.followUpDate) : null)
    const parsedRate = parseRateOrValue(data.rateOrValue)

    const existingSettings = (project as any).settings as Record<string, unknown> ?? {}
    await prisma.engagement.update({
        where: { id: projectId },
        data: {
            ...(data.name != null && { name: data.name }),
            ...(data.description !== undefined && { description: data.description }),
            ...(parsedKickoff !== undefined && { kickoffDate: parsedKickoff }),
            ...(parsedDue !== undefined && { dueDate: parsedDue }),
            ...(parsedFollowUp !== undefined && { followUpDate: parsedFollowUp }),
            ...(data.status !== undefined && { status: data.status as EngagementStatus }),
            ...(data.contractType !== undefined && { contractType: data.contractType?.trim() || null }),
            ...(parsedRate !== undefined && { rateOrValue: parsedRate }),
            ...(data.tags !== undefined && {
                tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === 'string' && t.trim()) : [],
            }),
            ...(data.internalMemo !== undefined && {
                settings: { ...existingSettings, internalMemo: data.internalMemo ?? null },
            }),
        }
    })

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    audit(AUDIT_EVENT.ENGAGEMENT_CHANGED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(project.firmId)
        .client(project.clientId)
        .engagement(projectId)
        .actor(user?.id)
        .meta({
            name: data.name,
            description: data.description,
            kickoffDate: data.kickoffDate,
            dueDate: data.dueDate,
            status: data.status,
            contractType: data.contractType,
            rateOrValue: data.rateOrValue,
            tags: data.tags,
        })
        .fireAndForget()

    // Notifications (in-app + email for critical): emit when dueDate changes
    try {
        if (parsedDue !== undefined) {
            const prev = project.dueDate ? new Date(project.dueDate).toISOString().slice(0, 10) : null
            const next = parsedDue ? parsedDue.toISOString().slice(0, 10) : null
            if (prev !== next && parsedDue) {
                const members = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId },
                    select: { userId: true },
                })
                const rows = members.map((m: any) => ({
                    organizationId: project.firmId,
                    clientId: project.clientId,
                    projectId,
                    documentId: null,
                    userId: m.userId,
                    type: 'PROJECT_DUE_DATE_SET',
                    priority: hours <= 24 ? 'CRITICAL' : 'WARNING',
                    title: 'Project due date updated',
                    body: `Due on ${parsedDue.toISOString().slice(0, 10)}`,
                    ctaUrl: null,
                    metadata: { dueDate: parsedDue.toISOString(), scope: 'project', priority: hours <= 24 ? 'CRITICAL' : 'WARNING' },
                    channels: { inApp: true, email: false },
                    dedupeKey: `project:${projectId}:due:${parsedDue.toISOString().slice(0, 10)}`,
                }))
                if (rows.length) {
                    await (prisma as any).notification.createMany({ data: rows, skipDuplicates: true })
                }

                // Critical email: due within 24 hours (best-effort)
                const hours = (parsedDue.getTime() - Date.now()) / (1000 * 60 * 60)
                if (hours <= 24) {
                    const { createAdminClient } = await import('@/utils/supabase/admin')
                    const { sendEmail } = await import('@/lib/email')
                    const admin = createAdminClient()
                    await Promise.all(members.map(async (m: any) => {
                        try {
                            const { data } = await admin.auth.admin.getUserById(m.userId)
                            const email = data?.user?.email
                            if (!email) return
                            await sendEmail(
                                email,
                                'Project due soon',
                                `<p><strong>Project due soon</strong></p><p>Your project is due on <strong>${parsedDue.toISOString().slice(0, 10)}</strong>.</p>`
                            )
                        } catch {
                            // ignore individual failures
                        }
                    }))
                }
            }
        }
    } catch (e) {
        logger.warn('Failed to create due date notifications', e as Error)
    }

    if ((parsedDue !== undefined || parsedKickoff !== undefined || parsedFollowUp !== undefined) && user) {
        const engDetails = await prisma.engagement.findFirst({
            where: { id: projectId },
            select: { name: true, slug: true, settings: true },
        })
        const engCtaUrl = `/d/f/${firmSlug}/c/${clientSlug}/e/${engDetails?.slug ?? ''}`
        const engNote = data.internalMemo !== undefined
            ? data.internalMemo
            : ((engDetails?.settings as any)?.internalMemo ?? null)

        if (parsedDue !== undefined) {
            upsertFollowUpReminder({
                userId: user.id,
                entityKey: 'platform.engagements.id',
                entityValue: projectId,
                action: 'Engagement due',
                dateKey: 'platform.engagements.dueDate',
                dateValue: parsedDue?.toISOString() ?? null,
                entityName: engDetails?.name ?? '',
                firmId: project.firmId,
                ctaUrl: engCtaUrl,
                note: engNote,
            }).catch(() => {})
        }
        if (parsedKickoff !== undefined) {
            const kickoffFuture = parsedKickoff && parsedKickoff > new Date()
            upsertFollowUpReminder({
                userId: user.id,
                entityKey: 'platform.engagements.id',
                entityValue: projectId,
                action: 'Engagement kickoff',
                dateKey: 'platform.engagements.kickoffDate',
                dateValue: kickoffFuture ? parsedKickoff!.toISOString() : null,
                entityName: engDetails?.name ?? '',
                firmId: project.firmId,
                ctaUrl: engCtaUrl,
                note: engNote,
            }).catch(() => {})
        }
        if (parsedFollowUp !== undefined) {
            upsertFollowUpReminder({
                userId: user.id,
                entityKey: 'platform.engagements.id',
                entityValue: projectId,
                action: 'Follow-up',
                dateKey: 'platform.engagements.followUpDate',
                dateValue: parsedFollowUp?.toISOString() ?? null,
                entityName: engDetails?.name ?? '',
                firmId: project.firmId,
                ctaUrl: engCtaUrl,
                note: engNote,
            }).catch(() => {})
        }
    }

    revalidatePath(`/d/f/${firmSlug}/c/${clientSlug}`)
}

/**
 * Close/Archive project (V2)
 */
export async function closeEngagement(projectId: string, firmSlug: string, clientSlug: string) {
    await assertCanManageProject(projectId)
    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { id: true, firmId: true, clientId: true }
    })
    if (!project) throw new Error('Project not found')

    const externalMembers = await prisma.engagementMember.findMany({
        where: {
            engagementId: projectId,
            role: { in: ['eng_ext_collaborator', 'eng_viewer'] },
        },
        select: { userId: true },
    })
    const allMemberIds = await prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        select: { userId: true },
    })

    await prisma.$transaction(async (tx) => {
        await tx.engagement.update({
            where: { id: projectId },
            data: { status: 'COMPLETED' },
        })
        await tx.engagementMember.deleteMany({
            where: {
                engagementId: projectId,
                role: { in: ['eng_ext_collaborator', 'eng_viewer'] },
            },
        })
        // Revoke pending external invitations
        await tx.engagementInvitation.deleteMany({
            where: {
                engagementId: projectId,
                persona: { slug: { in: ['eng_ext_collaborator', 'eng_viewer'] } },
                acceptedAt: null,
            },
        })
    })

    const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
    const toInvalidate = new Set<string>([
        ...externalMembers.map((m) => m.userId),
        ...allMemberIds.map((m) => m.userId),
    ])
    await Promise.all(Array.from(toInvalidate).map((uid) => invalidateUserSettingsPlus(uid)))

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    audit(AUDIT_EVENT.ENGAGEMENT_CLOSED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(project.firmId)
        .client(project.clientId)
        .engagement(projectId)
        .actor(user?.id)
        .meta({ reason: 'closed' })
        .fireAndForget()

    await safeInngestSend("project/archived", {
        projectId: project.id,
        organizationId: project.firmId,
        reason: 'closed',
        timestamp: new Date().toISOString()
    })

    revalidatePath(`/d/f/${firmSlug}/c/${clientSlug}`)
}

/**
 * Reopen project (V2)
 */
export async function reopenEngagement(projectId: string, firmSlug: string, clientSlug: string) {
    await assertCanManageProject(projectId)

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { firmId: true, clientId: true }
    })
    if (!project) throw new Error('Project not found')

    await prisma.engagement.update({
        where: { id: projectId },
        data: { status: 'ACTIVE' }
    })

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    audit(AUDIT_EVENT.ENGAGEMENT_REOPENED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(project.firmId)
        .client(project.clientId)
        .engagement(projectId)
        .actor(user?.id)
        .fireAndForget()

    revalidatePath(`/d/f/${firmSlug}/c/${clientSlug}`)
}

/**
 * Delete project (Soft delete) (V2)
 */
export async function deleteEngagement(projectId: string, firmSlug: string, clientSlug: string) {
    await assertCanManageProject(projectId)

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { id: true, firmId: true, clientId: true, connectorRootFolderId: true }
    })
    if (!project) throw new Error('Project not found')

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    audit(AUDIT_EVENT.ENGAGEMENT_DELETED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(project.firmId)
        .client(project.clientId)
        .engagement(projectId)
        .actor(user?.id)
        .fireAndForget()

    // 1. Fetch all members before deletion for cache invalidation
    const projectMembers = await prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        select: { userId: true }
    })

    // 2. Revoke Drive access
    if (project.connectorRootFolderId) {
        const { connectorId: clientConnectorId } = await resolveClientConnector(project.clientId)

        if (clientConnectorId) {
            try {
                await googleDriveConnector.restrictFolderToOwnerOnly(clientConnectorId, project.connectorRootFolderId)
            } catch (e) {
                logger.error('Error restricting Drive folders on project delete', e as Error)
            }
        }
    }

    // 3. Delete members and project
    await prisma.engagementMember.deleteMany({ where: { engagementId: projectId } })
    await prisma.engagement.update({
        where: { id: projectId },
        data: { isDeleted: true }
    })

    // 4. Invalidate caches
    if (projectMembers.length > 0) {
        const { invalidateUsersSettingsPlus } = await import('@/lib/actions/user-settings')
        await invalidateUsersSettingsPlus(projectMembers.map((m: any) => m.userId))
    }

    revalidatePath(`/d/f/${firmSlug}/c/${clientSlug}`)
}

/**
 * Provisions a Google Drive folder structure for an existing engagement that was created
 * before a connector was attached to the client. Safe to call multiple times — idempotent
 * via ensureAppFolderStructure.
 */
export async function provisionEngagementDriveFolder(engagementId: string): Promise<{ connectorRootFolderId: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const engagement = await prisma.engagement.findUnique({
        where: { id: engagementId },
        select: { id: true, name: true, slug: true, firmId: true, clientId: true, connectorRootFolderId: true }
    })
    if (!engagement) throw new Error('Engagement not found')
    if (engagement.connectorRootFolderId) return { connectorRootFolderId: engagement.connectorRootFolderId }

    const client = await prisma.client.findUnique({
        where: { id: engagement.clientId },
        select: { id: true, name: true, slug: true }
    })
    if (!client) throw new Error('Client not found')

    const { connectorId } = await resolveClientConnector(client.id)
    if (!connectorId) throw new Error('No connector found for this client')

    const result = await googleDriveConnector.ensureAppFolderStructure(
        connectorId,
        client.name,
        client.slug,
        await googleDriveConnector.createGoogleDriveAdapter(connectorId),
        engagement.firmId,
        { projectName: engagement.name, projectSlug: engagement.slug }
    )

    if (!result.projectId) throw new Error('Drive folder creation returned no folder ID')

    await prisma.engagement.update({
        where: { id: engagement.id },
        data: { connectorRootFolderId: result.projectId, updatedBy: user.id }
    })

    return { connectorRootFolderId: result.projectId }
}

// Backward-compatible aliases during Project -> Engagement rename rollout.
export const createProject = createEngagement
export const getProjectFolderIds = getEngagementFolderIds
export const canViewProjectSettings = canViewEngagementSettings
export const updateProject = updateEngagement
export const closeProject = closeEngagement
export const reopenProject = reopenEngagement
export const deleteProject = deleteEngagement
