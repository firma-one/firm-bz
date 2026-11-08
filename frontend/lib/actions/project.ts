'use server'

import { prisma } from '@/lib/prisma'
import { assertEngagementNotCompleted } from '@/lib/engagement-access'
import { ensureFirmAgentUser } from '@/lib/ai/files-agent/agent-identity'
import { type EngagementStatus, type NotificationPriority, DocumentSharingPermissionStatus } from '@prisma/client'
import { createClient as createSupabaseClient } from '@/utils/supabase/server'
import { upsertFollowUpReminder } from '@/lib/reminders/reminder-service'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { canViewProject as checkCanViewProject, canViewProjectSettings as checkCanViewProjectSettings } from '@/lib/permission-helpers'
import { getSessionUser } from '@/lib/auth/session-user'
import { resolveClientConnector } from '@/lib/connectors/resolve-client-connector'
import { getStorageAdapter, getPermissionAdapter } from '@/lib/connectors/registry'
import { ensureAppFolderStructure } from '@/lib/connectors/pockett-structure.service'
import { logger } from '@/lib/logger'
import { safeInngestSend } from '@/lib/inngest/client'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { asResultWithWarning, connectorProviderName, gone, notAllowed, readableReason, signedOut } from '@/lib/actions/action-reasons'
import { takeBackEngagementAccess } from '@/lib/connectors/firm-folder-access'
import { accessLeftAfterDelete, storageProviderName } from '@/lib/storage-access-notice'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { engagementPath, clientPath } from '@/lib/navigation/firm-paths'
import { buildAbsoluteUrl, sendEventEmailToUser } from '@/lib/notify-event'
import { ctaButton, emailHeading, emailText, escHtml, renderEmail } from '@/lib/email-templates/base'
import { formatFullDate } from '@/lib/utils'
import { deliverableDueAfter } from '@/lib/files/due-date-check'
import { dueLabel } from '@/lib/files/due-date-rule'

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

export type CreatedEngagement = { id: string; slug: string; name: string }

/**
 * Create a new project for the current user (V2). When the client has storage, the engagement's folder
 * must be made too, or the engagement is rolled back and the answer says why. If even the rollback
 * fails, the engagement stands and the answer is ok with a `warning` saying its folder is missing.
 */
export async function createEngagement(firmSlug: string, clientSlug: string, data: CreateProjectData): Promise<ActionResult<CreatedEngagement>> {
    return asResultWithWarning('createEngagement', () => createEngagementOrThrow(firmSlug, clientSlug, data))
}

async function createEngagementOrThrow(firmSlug: string, clientSlug: string, data: CreateProjectData): Promise<{ data: CreatedEngagement; warning?: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        throw signedOut()
    }

    // 1. Resolve Org & Check Permissions (V2)
    const firm = await prisma.firm.findUnique({
        where: { slug: firmSlug },
        include: {
            members: {
                where: { userId: user.id }
            },
            group: { select: { slug: true } }
        }
    })

    if (!firm || firm.members.length === 0) {
        throw notAllowed('add engagements in this firm')
    }

    const { requireAccess } = await import('@/lib/billing/subscription-gate')
    await requireAccess(firm.id, 'projects.create')

    // 2. Resolve Client (V2)
    const client = await (prisma as any).client.findFirst({
        where: {
            firmId: firm.id,
            slug: clientSlug
        }
    })

    if (!client) {
        throw gone('This client was deleted.')
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
        throw userFacing('This client already has an engagement with this name.', 'name_taken')
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
        throw userFacing("Couldn't make a unique link for this engagement. Try again.", 'slug_taken')
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

    // Brio joins the engagement so its file operations are attributable to it rather than to the
    // lead who approved them — the Audit tab renders by actor, and a flag in the metadata would
    // read as the lead's own work.
    //
    // The firm-level membership is what actually grants access; this row is what puts Brio in the
    // engagement's Members tab, which reads EngagementMember specifically.
    //
    // Outside the transaction and non-fatal: an engagement that exists without its agent is
    // repairable by the backfill, while one that could not be created at all is not.
    try {
        const agentId = await ensureFirmAgentUser(firm.id)
        if (agentId) {
            await prisma.engagementMember.create({
                data: {
                    engagementId: newProject.id,
                    userId: agentId,
                    role: 'eng_admin',
                    createdBy: user.id,
                    updatedBy: user.id,
                },
            })
        }
    } catch (error) {
        logger.error('Failed to add agent to engagement', error as Error, 'Agent', { engagementId: newProject.id })
    }

    // 7. Storage folder structure — required when a connector exists; failure rolls back the engagement
    let folderWarning: string | undefined
    const { connectorId } = await resolveClientConnector(client.id)
    if (connectorId) {
        try {
            const adapter = await getStorageAdapter(connectorId)
            const result = await ensureAppFolderStructure(
                connectorId,
                client.name,
                client.slug,
                adapter,
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
            } else {
                folderWarning = `Engagement created, but ${await connectorProviderName(connectorId)} didn't return its folder. Open it and use Set up storage folder in Files.`
            }
        } catch (e) {
            logger.error('Failed to create storage folder structure for project', e as Error)
            const provider = await connectorProviderName(connectorId)
            const why = readableReason(e)
            let rolledBack = true
            try {
                await prisma.engagement.delete({ where: { id: newProject.id } })
            } catch (delErr) {
                rolledBack = false
                logger.error('Failed to roll back engagement after Drive error', delErr as Error)
            }
            if (rolledBack) {
                throw userFacing(
                    `Couldn't create this engagement: its folder in ${provider} couldn't be set up${why ? ` · ${why}` : '. Try again.'}`,
                    'storage_setup_failed'
                )
            }
            // It exists after all: say so, rather than invite a second one with the same name.
            folderWarning = `Engagement created, but its folder in ${provider} couldn't be set up${why ? ` · ${why}` : ''}. Open it and use Set up storage folder in Files.`
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

    const engCtaUrl = engagementPath(firm.group.slug, firmSlug, clientSlug, newProject.slug)
    const engNote = data.internalMemo ?? null
    await upsertFollowUpReminder({
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
        await upsertFollowUpReminder({
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
        await upsertFollowUpReminder({
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

    revalidatePath(clientPath(firm.group.slug, firmSlug, clientSlug))
    return {
        data: { id: newProject.id, slug: newProject.slug, name: newProject.name },
        ...(folderWarning ? { warning: folderWarning } : {}),
    }
}

/**
 * An engagement's General / Confidential / Staging folder ids and whether the caller leads it, for
 * someone who may view that engagement (checked on the engagement's own firm and client).
 */
export async function getEngagementFolderIds(projectId: string) {
    const user = await getSessionUser()
    if (!user) {
        throw new Error('Unauthorized')
    }

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        include: { client: true },
    })

    if (!project || !(await checkCanViewProject(project.client.firmId, project.clientId, project.id))) {
        throw new Error('Project not found')
    }

    const connectorId = project.client.connectorId
    if (!connectorId) {
        return { generalFolderId: null, confidentialFolderId: null, stagingFolderId: null, isProjectLead: false }
    }

    const [folderIds, projectMember] = await Promise.all([
        getPermissionAdapter(connectorId).then((permissionAdapter) => permissionAdapter
            ? permissionAdapter.getEngagementFolderIds(connectorId, project.slug, {
                projectName: project.name,
                clientSlug: project.client.slug,
                clientName: project.client.name,
                projectFolderId: project.connectorRootFolderId ?? undefined,
            })
            : { generalFolderId: null, confidentialFolderId: null, stagingFolderId: null }),
        prisma.engagementMember.findFirst({
            where: { engagementId: project.id, userId: user.id },
            select: { role: true },
        }),
    ])

    return {
        ...folderIds,
        isProjectLead: projectMember?.role === 'eng_admin',
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

async function assertCanManageProject(projectId: string, toDoWhat = 'change this engagement') {
    const can = await canViewEngagementSettings(projectId)
    if (!can) throw notAllowed(toDoWhat)
}

export type EngagementUpdate = {
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
}

/**
 * Update project (V2). Answers the reason when it's refused: a completed engagement, or a due date
 * before one of its deliverables' ("{x} is due {date}, after that. Set the engagement's due date on or
 * after it, or move that deliverable first.").
 */
export async function updateEngagement(
    projectId: string,
    data: EngagementUpdate,
    firmSlug: string,
    clientSlug: string
): Promise<ActionResult> {
    return asResult('updateEngagement', () => updateEngagementOrThrow(projectId, data, firmSlug, clientSlug))
}

async function updateEngagementOrThrow(
    projectId: string,
    data: EngagementUpdate,
    firmSlug: string,
    clientSlug: string
): Promise<void> {
    await assertCanManageProject(projectId)

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: {
            firmId: true,
            clientId: true,
            dueDate: true,
            kickoffDate: true,
            status: true,
            settings: true,
            firm: { select: { group: { select: { slug: true } } } },
        }
    })
    if (!project) throw gone('This engagement was deleted.')

    // Only allow status changes on completed engagements (for reopening); block all other updates
    if (project.status === 'COMPLETED' && (!data.status || data.status === 'COMPLETED')) {
        throw userFacing("This engagement is completed, so it's read only. Change its status to make changes.", 'engagement_completed')
    }

    const parsedKickoff = data.kickoffDate === undefined ? undefined : (data.kickoffDate ? new Date(data.kickoffDate) : null)
    const parsedDue = data.dueDate === undefined ? undefined : (data.dueDate ? new Date(data.dueDate) : null)
    const parsedFollowUp = data.followUpDate === undefined ? undefined : (data.followUpDate ? new Date(data.followUpDate) : null)
    const parsedRate = parseRateOrValue(data.rateOrValue)

    // A deliverable can't be due after its engagement (.claude/plans/due-date-rule.md): the
    // engagement's date can't move before one of them.
    if (parsedDue) {
        const later = await deliverableDueAfter(projectId, parsedDue)
        if (later) {
            throw userFacing(`${dueLabel(later)} is due ${formatFullDate(later.due)}, after that. Set the engagement's due date on or after it, or move that deliverable first.`, 'due_date_conflict')
        }
    }

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

    // The firm's Drive access follows the status: read-only while Completed (setFirmFolderAccess).
    if (data.status && data.status !== project.status) {
        if (data.status === 'COMPLETED') await safeInngestSend('engagement.completed', { projectId })
        else if (project.status === 'COMPLETED') await safeInngestSend('engagement.reopened', { projectId })
    }

    // The engagement's name and link, for the due-date notifications and the caller's date reminders.
    const datesChanged = parsedDue !== undefined || parsedKickoff !== undefined || parsedFollowUp !== undefined
    const engDetails = datesChanged
        ? await prisma.engagement.findFirst({
            where: { id: projectId },
            select: { name: true, slug: true, settings: true },
        })
        : null
    const engCtaUrl = engDetails
        ? engagementPath(project.firm.group.slug, firmSlug, clientSlug, engDetails.slug)
        : clientPath(project.firm.group.slug, firmSlug, clientSlug)

    // Notifications (in-app + email for critical): emit when dueDate changes
    try {
        if (parsedDue !== undefined) {
            const prev = project.dueDate ? new Date(project.dueDate).toISOString().slice(0, 10) : null
            const next = parsedDue ? parsedDue.toISOString().slice(0, 10) : null
            if (prev !== next && parsedDue) {
                // Every member but whoever set it: no one is told of their own change
                const members = await prisma.engagementMember.findMany({
                    where: { engagementId: projectId, ...(user?.id ? { userId: { not: user.id } } : {}) },
                    select: { userId: true },
                })
                const engagementName = engDetails?.name || 'Your engagement'
                const dueOn = formatFullDate(parsedDue)
                // Due within a day is critical, and is emailed as well.
                const hours = (parsedDue.getTime() - Date.now()) / (1000 * 60 * 60)
                const priority: NotificationPriority = hours <= 24 ? 'CRITICAL' : 'WARNING'
                const rows = members.map((m) => ({
                    firmId: project.firmId,
                    clientId: project.clientId,
                    engagementId: projectId,
                    documentId: null,
                    userId: m.userId,
                    type: 'PROJECT_DUE_DATE_SET',
                    priority,
                    title: 'Engagement due date updated',
                    body: `${engagementName} due on ${dueOn}`,
                    ctaUrl: engCtaUrl,
                    metadata: { dueDate: parsedDue.toISOString(), scope: 'project', priority },
                    channels: { inApp: true, email: false },
                    dedupeKey: `project:${projectId}:due:${next}`,
                }))
                if (rows.length) {
                    await prisma.notification.createMany({ data: rows, skipDuplicates: true })
                }

                // Critical email: due within 24 hours (best-effort; sendEventEmailToUser never throws)
                if (hours <= 24) {
                    const link = buildAbsoluteUrl(engCtaUrl)
                    await Promise.all(members.map((m) =>
                        sendEventEmailToUser(m.userId, () => ({
                            subject: 'Engagement due soon',
                            html: renderEmail({
                                title: 'Engagement due soon',
                                preheader: `${engagementName} is due on ${dueOn}`,
                                body: [
                                    emailHeading('Engagement due soon'),
                                    emailText(`<strong>${escHtml(engagementName)}</strong> is due on <strong>${dueOn}</strong>.`),
                                    link ? ctaButton('Open engagement', link) : '',
                                ].join('\n'),
                            }),
                        }))
                    ))
                }
            }
        }
    } catch (e) {
        logger.warn('Failed to create due date notifications', e as Error)
    }

    if (datesChanged && user) {
        const engNote = data.internalMemo !== undefined
            ? data.internalMemo
            : ((engDetails?.settings as any)?.internalMemo ?? null)

        if (parsedDue !== undefined) {
            await upsertFollowUpReminder({
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
            await upsertFollowUpReminder({
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
            await upsertFollowUpReminder({
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

    revalidatePath(clientPath(project.firm.group.slug, firmSlug, clientSlug))
}

/**
 * Close/Archive project (V2)
 */
export async function closeEngagement(projectId: string, firmSlug: string, clientSlug: string): Promise<ActionResult> {
    return asResult('closeEngagement', () => closeEngagementOrThrow(projectId, firmSlug, clientSlug))
}

async function closeEngagementOrThrow(projectId: string, firmSlug: string, clientSlug: string): Promise<void> {
    await assertCanManageProject(projectId, 'complete this engagement')
    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { id: true, firmId: true, clientId: true, firm: { select: { group: { select: { slug: true } } } } }
    })
    if (!project) throw gone('This engagement was deleted.')

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

    // Revoke document-level connector permissions BEFORE deleting member rows.
    // The FK cascade drops sharing rows (and connectorPermissionId) on member delete —
    // so permissions must be revoked first while the data is still readable.
    const { connectorId: clientConnectorId } = await resolveClientConnector(project.clientId)
    if (clientConnectorId) {
        try {
            const { getPermissionAdapter } = await import('@/lib/connectors/registry')
            const adapter = await getPermissionAdapter(clientConnectorId)
            if (adapter) {
                const externalUserIds = externalMembers.map((m) => m.userId)
                const sharingRows = await prisma.engagementDocumentSharingUser.findMany({
                    where: {
                        engagementId: projectId,
                        userId: { in: externalUserIds },
                        sharingPermissionStatus: DocumentSharingPermissionStatus.GRANTED,
                        connectorPermissionId: { not: null },
                    },
                    select: { connectorPermissionId: true, document: { select: { externalId: true } } },
                })
                await Promise.allSettled(
                    sharingRows
                        .filter((s) => s.connectorPermissionId && s.document?.externalId)
                        .map((s) => adapter.revokePermission(clientConnectorId, s.document!.externalId, s.connectorPermissionId!))
                )
            }
        } catch (error) {
            logger.error('Error revoking document-level connector permissions on engagement close', error as Error)
        }
    }

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

    const { invalidateUserSettingsPlus } = await import('@/lib/permissions/invalidate-user-settings')
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
        timestamp: new Date().toISOString(),
    })

    // Async: reminder cleanup for all members (engagement + doc + comment level)
    await safeInngestSend('engagement.closed', {
        engagementId: projectId,
        memberUserIds: Array.from(toInvalidate),
        timestamp: new Date().toISOString(),
    })

    revalidatePath(clientPath(project.firm.group.slug, firmSlug, clientSlug))
}

/**
 * Reopen project (V2)
 */
export async function reopenEngagement(projectId: string, firmSlug: string, clientSlug: string): Promise<ActionResult> {
    return asResult('reopenEngagement', () => reopenEngagementOrThrow(projectId, firmSlug, clientSlug))
}

async function reopenEngagementOrThrow(projectId: string, firmSlug: string, clientSlug: string): Promise<void> {
    await assertCanManageProject(projectId, 'reopen this engagement')

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { firmId: true, clientId: true, firm: { select: { group: { select: { slug: true } } } } }
    })
    if (!project) throw gone('This engagement was deleted.')

    await prisma.engagement.update({
        where: { id: projectId },
        data: { status: 'ACTIVE' }
    })
    await safeInngestSend('engagement.reopened', { projectId })

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    audit(AUDIT_EVENT.ENGAGEMENT_REOPENED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(project.firmId)
        .client(project.clientId)
        .engagement(projectId)
        .actor(user?.id)
        .fireAndForget()

    revalidatePath(clientPath(project.firm.group.slug, firmSlug, clientSlug))
}

/**
 * Delete project (Soft delete) (V2)
 *
 * Sequence:
 *   1. Take back storage access (sync — must read connectorPermissionId before the FK cascade drops
 *      sharing rows on member delete): every permission a row holds, through the connector it was
 *      granted on, then its folders restricted to their owner (takeBackEngagementAccess). Both storages.
 *   2. Transaction: hard-delete members (FK cascades sharing rows), invitations,
 *      file persona grants; soft-delete engagement with deletedAt timestamp
 *   3. Invalidate member caches (sync — must take effect on next request)
 *   4. Fire engagement.deleted (async Inngest) — reminder cleanup + member sign-outs
 *   5. Fire project/archived (async Inngest) — share config clear + internal folder downgrade
 *
 * Answers with a `warning` when storage still gives access after step 1: "Engagement deleted. Google
 * Drive still gives 2 people access to its folders · {why}". The rows that held the ids are gone after
 * the delete, so the person who deleted it is the one who can still act on it.
 */
export async function deleteEngagement(projectId: string, firmSlug: string, clientSlug: string): Promise<ActionResult> {
    const result = await asResult('deleteEngagement', () => deleteEngagementAndAccess(projectId, firmSlug, clientSlug))
    if (!result.ok) return result
    return { ok: true, data: undefined, ...(result.data.warning ? { warning: result.data.warning } : {}) }
}

async function deleteEngagementAndAccess(projectId: string, firmSlug: string, clientSlug: string): Promise<{ warning?: string }> {
    if (!(await canViewEngagementSettings(projectId))) {
        // A second click on Delete lands here too: say what happened rather than "no permission".
        const deleted = await prisma.engagement.findFirst({ where: { id: projectId, isDeleted: true }, select: { id: true } })
        if (deleted) throw userFacing('This engagement was already deleted.', 'not_found')
        throw userFacing("You don't have permission to delete this engagement.", 'forbidden')
    }

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: {
            id: true,
            firmId: true,
            clientId: true,
            connectorRootFolderId: true,
            firm: { select: { group: { select: { slug: true } } } },
        }
    })
    if (!project) throw userFacing('This engagement was already deleted.', 'not_found')

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const projectMembers = await prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        select: { userId: true },
    })
    const memberUserIds = projectMembers.map((m: { userId: string }) => m.userId)

    // 1. Storage access, before the members' rows (and the permission ids on them) go.
    const left = await takeBackEngagementAccess(projectId)

    // 2. Hard-delete live access objects; soft-delete the engagement anchor
    await prisma.$transaction(async (tx) => {
        // Members — FK cascade drops their engagement_document_sharing_users rows
        await tx.engagementMember.deleteMany({ where: { engagementId: projectId } })
        // Pending invitations — meaningless on a deleted engagement
        await tx.engagementInvitation.deleteMany({ where: { engagementId: projectId } })
        // File persona grants — live access objects, must not dangle
        await tx.filePersonaGrant.deleteMany({ where: { engagementId: projectId } })
        // Soft-delete with timestamp for 30-day purge cron
        await tx.engagement.update({
            where: { id: projectId },
            data: { isDeleted: true, deletedAt: new Date(), deletedBy: user?.id ?? null },
        })
    })

    audit(AUDIT_EVENT.ENGAGEMENT_DELETED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(project.firmId)
        .client(project.clientId)
        .engagement(projectId)
        .actor(user?.id)
        .fireAndForget()

    // 3. Invalidate caches — must take effect on next request
    if (memberUserIds.length > 0) {
        const { invalidateUsersSettingsPlus } = await import('@/lib/permissions/invalidate-user-settings')
        await invalidateUsersSettingsPlus(memberUserIds)
    }

    // 4. Async: reminder cleanup + member sign-outs
    await safeInngestSend('engagement.deleted', {
        engagementId: projectId,
        memberUserIds,
        timestamp: new Date().toISOString(),
    })

    // 5. Async: share config clear + internal folder access downgrade
    await safeInngestSend('project/archived', {
        projectId,
        organizationId: project.firmId,
        reason: 'deleted',
        timestamp: new Date().toISOString(),
    })

    revalidatePath(clientPath(project.firm.group.slug, firmSlug, clientSlug))

    const warning = accessLeftAfterDelete({ done: 'Engagement deleted', provider: await storageProviderName(projectId), left })
    return warning ? { warning } : {}
}

/**
 * Provisions a Google Drive folder structure for an existing engagement that was created
 * before a connector was attached to the client. Safe to call multiple times — idempotent
 * via ensureAppFolderStructure.
 */
export async function provisionEngagementDriveFolder(engagementId: string): Promise<ActionResult<{ connectorRootFolderId: string }>> {
    return asResult('provisionEngagementDriveFolder', () => provisionEngagementDriveFolderOrThrow(engagementId))
}

async function provisionEngagementDriveFolderOrThrow(engagementId: string): Promise<{ connectorRootFolderId: string }> {
    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const engagement = await prisma.engagement.findFirst({
        where: { id: engagementId, isDeleted: false },
        select: { id: true, name: true, slug: true, firmId: true, clientId: true, connectorRootFolderId: true }
    })
    if (!engagement || !(await checkCanViewProject(engagement.firmId, engagement.clientId, engagement.id))) {
        throw gone('This engagement was deleted.')
    }
    if (engagement.connectorRootFolderId) return { connectorRootFolderId: engagement.connectorRootFolderId }

    const client = await prisma.client.findUnique({
        where: { id: engagement.clientId },
        select: { id: true, name: true, slug: true }
    })
    if (!client) throw gone('This client was deleted.')

    const { connectorId } = await resolveClientConnector(client.id)
    if (!connectorId) throw userFacing("This client has no storage attached. Attach one in the firm's Storage settings first.", 'no_connector')

    const adapter = await getStorageAdapter(connectorId)
    const result = await ensureAppFolderStructure(
        connectorId,
        client.name,
        client.slug,
        adapter,
        engagement.firmId,
        { projectName: engagement.name, projectSlug: engagement.slug }
    )

    if (!result.projectId) {
        throw userFacing(`${await connectorProviderName(connectorId)} didn't return the new folder. Try again.`, 'storage_setup_failed')
    }

    await prisma.engagement.update({
        where: { id: engagement.id },
        data: { connectorRootFolderId: result.projectId, updatedBy: user.id }
    })

    return { connectorRootFolderId: result.projectId }
}

export async function updateEngagementInsightsSummary(projectId: string, summary: string | null): Promise<ActionResult> {
    return asResult('updateEngagementInsightsSummary', () => updateEngagementInsightsSummaryOrThrow(projectId, summary))
}

async function updateEngagementInsightsSummaryOrThrow(projectId: string, summary: string | null): Promise<void> {
    await assertCanManageProject(projectId, "change this engagement's summary")
    await assertEngagementNotCompleted(projectId)
    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { settings: true },
    })
    if (!project) throw gone('This engagement was deleted.')
    const existingSettings = (project.settings as Record<string, unknown> | null) ?? {}
    const { readInsightsSummary } = await import('@/lib/ai/engagement-summary')
    const current = readInsightsSummary(existingSettings)

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    await prisma.engagement.update({
        where: { id: projectId },
        data: {
            settings: {
                ...existingSettings,
                insightsSummary: {
                    text: summary ?? null,
                    publishedAt: summary ? new Date().toISOString() : null,
                    publishedByUserId: summary ? user?.id ?? null : null,
                    // Hand-written text describes no data snapshot, so there is nothing to
                    // compare against — no fingerprint rather than a misleading one.
                    fingerprint: null,
                    source: summary ? 'manual' : null,
                    draft: current.draft ?? null,
                },
            },
        },
    })
}

/**
 * Publishes the AI draft into the client-facing summary, optionally with edits by the lead.
 *
 * This is the ONLY path by which generated text reaches `insightsSummary` — the field that is
 * shown to clients and captured into PDF/email exports. The daily cron writes drafts with
 * status 'pending_review' and can never publish. The approved draft is retained (status
 * 'approved') as an audit record of what was reviewed, by whom, and whether it was edited.
 */
export async function approveEngagementAiSummary(projectId: string, editedContent?: string): Promise<ActionResult<{ published: string }>> {
    return asResult('approveEngagementAiSummary', () => approveEngagementAiSummaryOrThrow(projectId, editedContent))
}

async function approveEngagementAiSummaryOrThrow(projectId: string, editedContent?: string): Promise<{ published: string }> {
    await assertCanManageProject(projectId, "publish this engagement's summary")
    await assertEngagementNotCompleted(projectId)

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { settings: true },
    })
    if (!project) throw gone('This engagement was deleted.')

    const existingSettings = (project.settings as Record<string, unknown> | null) ?? {}
    const { readInsightsSummary } = await import('@/lib/ai/engagement-summary')
    const current = readInsightsSummary(existingSettings)
    const draft = current.draft
    if (!draft) throw userFacing('There is no draft to publish. It may have been published or discarded already.', 'no_draft')

    const originalText = (draft.text ?? '').trim()
    const text = (editedContent ?? originalText).trim()
    if (!text) throw userFacing("The summary is empty. Write something before publishing.", 'empty_summary')

    // Enforced here, not only in the UI: the client-facing summary must never claim a mitigation
    // plan or next steps that no human has actually written.
    const { findUnfilledSections } = await import('@/lib/ai/engagement-summary')
    const unfilled = findUnfilledSections(text)
    if (unfilled.length > 0) {
        throw userFacing(
            `Complete these sections before publishing: ${unfilled.join(', ')}`,
            'unfilled_sections'
        )
    }

    // Publishing vouches for the text as of now, so record the engagement's data as it is now,
    // not as it was when Brio wrote the draft. With the draft's fingerprint, a draft written
    // yesterday was "Out of date" the moment it was published. The review pane already warns
    // when the draft is behind the data (insightsSummaryDraftStale), before anyone publishes.
    let fingerprint = draft.fingerprint ?? null
    try {
        const { resolveProjectContext } = await import('@/lib/resolve-project-context')
        const ctx = await resolveProjectContext(projectId)
        if (ctx) {
            const { computeEngagementInsights } = await import('@/lib/insights/engagement-insights')
            const { fingerprintInsights } = await import('@/lib/ai/engagement-summary')
            fingerprint = fingerprintInsights(await computeEngagementInsights(projectId, ctx.firmId, false))
        }
    } catch (e) {
        logger.warn('Could not fingerprint the engagement at publish; keeping the draft\'s', e as Error)
    }

    const now = new Date().toISOString()
    await prisma.engagement.update({
        where: { id: projectId },
        data: {
            settings: {
                ...existingSettings,
                insightsSummary: {
                    text,
                    publishedAt: now,
                    publishedByUserId: user?.id ?? null,
                    // Fingerprint of the data as it was when published, so the UI can later tell
                    // the engagement has moved on and flag the published text as out of date.
                    fingerprint,
                    source: 'ai',
                    // Retained as an audit record of what was reviewed and by whom.
                    draft: {
                        ...draft,
                        text,
                        status: 'approved',
                        reviewedAt: now,
                        reviewedByUserId: user?.id ?? null,
                        editedByReviewer: text !== originalText,
                    },
                },
            },
        },
    })
    return { published: text }
}

/** Rejects the draft. It is retained with status 'dismissed' and never reaches exports. */
export async function dismissEngagementAiSummary(projectId: string): Promise<ActionResult> {
    return asResult('dismissEngagementAiSummary', () => dismissEngagementAiSummaryOrThrow(projectId))
}

async function dismissEngagementAiSummaryOrThrow(projectId: string): Promise<void> {
    await assertCanManageProject(projectId, "discard this engagement's summary draft")
    await assertEngagementNotCompleted(projectId)

    const supabase = await createSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    const project = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { settings: true },
    })
    if (!project) throw gone('This engagement was deleted.')

    const existingSettings = (project.settings as Record<string, unknown> | null) ?? {}
    const { readInsightsSummary } = await import('@/lib/ai/engagement-summary')
    const current = readInsightsSummary(existingSettings)
    // Only a draft still waiting for review. After a publish, `draft` is kept as the audit record
    // of what was approved; discarding must never rewrite that record as "dismissed".
    if (!current.draft || current.draft.status !== 'pending_review') return

    await prisma.engagement.update({
        where: { id: projectId },
        data: {
            settings: {
                ...existingSettings,
                insightsSummary: {
                    ...current,
                    draft: {
                        ...current.draft,
                        status: 'dismissed',
                        reviewedAt: new Date().toISOString(),
                        reviewedByUserId: user?.id ?? null,
                    },
                },
            },
        },
    })
}

// Backward-compatible aliases during Project -> Engagement rename rollout.
export const createProject = createEngagement
export const getProjectFolderIds = getEngagementFolderIds
export const canViewProjectSettings = canViewEngagementSettings
export const updateProject = updateEngagement
export const closeProject = closeEngagement
export const reopenProject = reopenEngagement
export const deleteProject = deleteEngagement
