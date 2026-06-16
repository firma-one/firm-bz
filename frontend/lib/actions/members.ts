'use server'

import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from "next/cache"
import { InvitationStatus } from '@prisma/client'
import { logger } from '@/lib/logger'
import { googleDriveConnector } from '@/lib/google-drive-connector'
import { safeInngestSend } from '@/lib/inngest/client'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { removeRemindersByEntity } from '@/lib/actions/user-reminders'

// Admin Client for fetching user details
const supabaseAdmin = createSupabaseAdmin(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/** Resolve avatar URL from Supabase user */
function getAvatarUrlFromSupabaseUser(dbUser: any): string | null {
    if (!dbUser) return null
    const meta = dbUser.user_metadata
    const fromMeta = (meta?.avatar_url ?? meta?.picture) as string | undefined
    if (fromMeta) return fromMeta
    const firstIdentity = dbUser.identities?.[0]?.identity_data
    const fromIdentity = (firstIdentity?.avatar_url ?? firstIdentity?.picture) as string | undefined
    return fromIdentity ?? null
}

export async function getProjectMembers(projectId: string) {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) throw new Error("Unauthorized")
    const user = session.user

    // 1. Fetch Members (engagement = project in UI)
    const members = await prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        orderBy: { id: 'asc' }
    })

    // 2. Fetch Pending Invitations
    const invitations = await prisma.engagementInvitation.findMany({
        where: {
            engagementId: projectId,
            status: { notIn: [InvitationStatus.JOINED, InvitationStatus.SUPERSEDED] }
        },
        include: { persona: true },
        orderBy: { createdAt: 'desc' }
    })

    // 3. Enrich Members with User Data
    const enrichedMembers = await Promise.all(members.map(async (m: any) => {
        try {
            const { data: { user: dbUser } } = await supabaseAdmin.auth.admin.getUserById(m.userId)
            return {
                ...m,
                user: {
                    email: dbUser?.email,
                    name: dbUser?.user_metadata?.full_name || dbUser?.user_metadata?.name || dbUser?.email?.split('@')[0],
                    avatarUrl: getAvatarUrlFromSupabaseUser(dbUser)
                }
            }
        } catch (e) {
            return {
                ...m,
                user: { email: 'Unknown', name: 'Unknown User' }
            }
        }
    }))

    return {
        members: enrichedMembers,
        invitations
    }
}

export type ProjectMemberSummaryUser = { name: string; email: string; avatarUrl?: string | null; personaName?: string }
export type ProjectMemberSummary = {
    projectLeads: ProjectMemberSummaryUser[]
    teamMembers: ProjectMemberSummaryUser[]
    external: ProjectMemberSummaryUser[]
}

/** Lightweight member summaries per project */
export async function getProjectMemberSummaries(projectIds: string[]): Promise<Record<string, ProjectMemberSummary>> {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return {}

    if (projectIds.length === 0) return {}

    const members = await prisma.engagementMember.findMany({
        where: { engagementId: { in: projectIds } },
        select: {
            engagementId: true,
            userId: true,
            role: true
        }
    })

    const { getProjectPersonas } = await import('./personas')
    const personaList = await getProjectPersonas()
    const roleToDisplayName = Object.fromEntries(personaList.map((p: any) => [p.slug, p.displayName]))

    const result: Record<string, ProjectMemberSummary> = {}
    for (const id of projectIds) {
        result[id] = { projectLeads: [], teamMembers: [], external: [] }
    }

    // Fetch all unique user profiles in parallel instead of serially
    const uniqueUserIds = Array.from(new Set(members.map(m => m.userId)))
    const userDataMap = new Map<string, any>()
    await Promise.all(uniqueUserIds.map(async (userId) => {
        try {
            const { data: { user: dbUser } } = await supabaseAdmin.auth.admin.getUserById(userId)
            userDataMap.set(userId, dbUser ?? null)
        } catch {
            userDataMap.set(userId, null)
        }
    }))

    for (const m of members) {
        const displayPersonaName = roleToDisplayName[m.role] ?? ''
        const dbUser = userDataMap.get(m.userId) ?? null
        const userData: ProjectMemberSummaryUser = dbUser ? {
            name: dbUser.user_metadata?.full_name || dbUser.user_metadata?.name || dbUser.email?.split('@')[0] || 'Unknown',
            email: dbUser.email || '',
            avatarUrl: getAvatarUrlFromSupabaseUser(dbUser),
            personaName: displayPersonaName || undefined
        } : { name: 'Unknown', email: '', personaName: displayPersonaName || undefined }

        const personaLower = displayPersonaName.toLowerCase()
        if (personaLower.includes('lead')) result[m.engagementId].projectLeads.push(userData)
        else if (personaLower.includes('team')) result[m.engagementId].teamMembers.push(userData)
        else result[m.engagementId].external.push(userData)
    }

    return result
}

export async function removeMember(memberId: string) {
    try {
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error("Unauthorized")
        const user = session.user

        const member = await prisma.engagementMember.findUnique({
            where: { id: memberId },
            include: {
                engagement: {
                    select: {
                        id: true,
                        connectorRootFolderId: true,
                        client: {
                            select: {
                                firmId: true,
                                firm: {
                                    select: { connectorId: true }
                                }
                            }
                        }
                    }
                }
            }
        })

        if (!member) throw new Error("Member not found")

        // Revoke Google Drive folder access
        if (member.engagement.connectorRootFolderId) {
            try {
                const { data: { user: memberUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
                const memberEmail = memberUser?.email

                if (memberEmail) {
                    const connectorId = member.engagement.client.firm.connectorId

                    if (connectorId) {
                        await googleDriveConnector.revokeFolderPermissionByEmail(
                            connectorId,
                            member.engagement.connectorRootFolderId,
                            memberEmail
                        )
                    }
                }
            } catch (error) {
                logger.error('Error revoking Drive folder access', error as Error)
            }
        }

        await prisma.engagementMember.delete({ where: { id: memberId } })

        // If the user has no remaining engagement memberships in this firm, remove their firm_members row.
        // EC/EV users get a firm_members row on invite acceptance but are not true firm members.
        const firmId = member.engagement.client.firmId
        const remainingEngagements = await prisma.engagementMember.count({
            where: {
                userId: member.userId,
                engagement: { client: { firmId } },
            },
        })
        if (remainingEngagements === 0) {
            await prisma.firmMember.deleteMany({
                where: { userId: member.userId, firmId },
            })
        }

        // Mark invitation as SUPERSEDED so the member can be re-invited
        if (member.userId) {
            try {
                const { data: { user: memberUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
                const memberEmail = memberUser?.email
                if (memberEmail) {
                    await prisma.engagementInvitation.updateMany({
                        where: { engagementId: member.engagementId, email: memberEmail, status: InvitationStatus.JOINED },
                        data: { status: InvitationStatus.SUPERSEDED },
                    })
                }
            } catch (error) {
                logger.error('Error superseding invitation on member removal', error as Error)
            }
        }

        // Fire async revocation of document-level Drive permissions (folder-level already revoked above)
        if (['eng_ext_collaborator', 'eng_viewer'].includes(member.role)) {
            await safeInngestSend('project.member.removed', {
                projectId: member.engagementId,
                organizationId: member.engagement.client.firmId,
                userId: member.userId,
                personaSlug: member.role,
                timestamp: new Date().toISOString(),
                removedBy: user.id,
            })
        }

        audit(AUDIT_EVENT.ENGAGEMENT_MEMBER_REMOVED)
            .scope(AUDIT_SCOPE.ENGAGEMENT)
            .firm(member.engagement.client.firmId)
            .engagement(member.engagementId)
            .actor(user.id)
            .meta({ removedUserId: member.userId })
            .fireAndForget()

        const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
        await invalidateUserSettingsPlus(member.userId)

        revalidatePath('/d/f/[slug]/c/[clientSlug]/e/[engagementSlug]')
    } catch (error) {
        logger.error('Failed to remove member', error as Error)
        throw error
    }
}

export async function revokeInvitation(invitationId: string) {
    try {
        const invite = await prisma.engagementInvitation.findUnique({
            where: { id: invitationId },
            select: { createdBy: true },
        })
        await prisma.engagementInvitation.delete({ where: { id: invitationId } })
        if (invite?.createdBy) {
            await removeRemindersByEntity(invite.createdBy, 'platform.engagement_invitations.id', invitationId).catch(() => {})
        }
        revalidatePath('/d/f/[slug]/c/[clientSlug]/e/[engagementSlug]')
    } catch (error) {
        logger.error('Failed to revoke invitation', error as Error)
        throw error
    }
}

export async function updateMemberPersona(memberId: string, personaId: string) {
    try {
        const supabase = await createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) throw new Error("Unauthorized")
        const user = session.user

        const member = await prisma.engagementMember.findUnique({
            where: { id: memberId },
            include: { engagement: { include: { client: true } } }
        })
        if (!member) throw new Error("Member not found")

        const newPersona = await prisma.persona.findUnique({
            where: { id: personaId }
        })
        if (!newPersona) throw new Error("Persona not found")

        const oldPersonaSlug = member.role ?? null
        const newPersonaSlug = newPersona.slug as 'eng_admin' | 'eng_member' | 'eng_ext_collaborator' | 'eng_viewer'

        await prisma.engagementMember.update({
            where: { id: memberId },
            data: { role: newPersonaSlug }
        })

        const timestamp = new Date().toISOString()

        await safeInngestSend('project.member.persona.updated', {
            projectId: member.engagementId,
            organizationId: member.engagement.client.firmId,
            memberId,
            userId: member.userId,
            oldPersonaId: null,
            newPersonaId: personaId,
            oldPersonaSlug,
            newPersonaSlug,
            timestamp,
            changedBy: user.id
        })

        const accessGrantingPersonas = ['eng_viewer', 'eng_ext_collaborator', 'eng_member', 'eng_admin']
        if (accessGrantingPersonas.includes(newPersonaSlug)) {
            const { data: { user: memberUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
            const memberEmail = memberUser?.email || memberUser?.user_metadata?.email

            if (memberEmail) {
                await safeInngestSend('project.member.added', {
                    projectId: member.engagementId,
                    organizationId: member.engagement.client.firmId,
                    memberId,
                    userId: member.userId,
                    email: memberEmail,
                    personaSlug: newPersonaSlug,
                    timestamp
                })
            }
        }

        audit(AUDIT_EVENT.ENGAGEMENT_MEMBER_ROLE_CHANGED)
            .scope(AUDIT_SCOPE.ENGAGEMENT)
            .firm(member.engagement.client.firmId)
            .engagement(member.engagementId)
            .actor(user.id)
            .meta({ memberId, userId: member.userId, oldRole: oldPersonaSlug, newRole: newPersonaSlug })
            .fireAndForget()

        const { invalidateUserSettingsPlus } = await import('@/lib/actions/user-settings')
        await invalidateUserSettingsPlus(member.userId)

        return { success: true }
    } catch (error) {
        logger.error('Failed to update member persona', error as Error)
        throw error
    }
}
