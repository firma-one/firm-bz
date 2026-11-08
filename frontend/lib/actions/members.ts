'use server'

import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { isAgentUser } from "@/lib/ai/files-agent/agent-identity"
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from "next/cache"
import { InvitationStatus } from '@prisma/client'
import { logger } from '@/lib/logger'
import { safeInngestSend } from '@/lib/inngest/client'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { revokeSharePermissions, SHARE_TO_REVOKE_SELECT } from '@/lib/connectors/revoke-share-permissions'
import { revokeMemberFolderAccess, type FolderAccessFailure } from '@/lib/connectors/firm-folder-access'
import { engagementFoldersFor } from '@/lib/grant-engagement-drive-folder-access'
import { accessStillStanding, storageProviderName } from '@/lib/storage-access-notice'
import { BRAND_NAME } from '@/config/brand'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { removeRemindersByEntity } from '@/lib/reminders/reminder-service'
import { getAvatarUrlFromSupabaseUser } from '@/lib/supabase-user-helpers'
import { requireEngagementManager, isEngagementPersonaSlug } from '@/lib/permissions/require-engagement-manager'
import { gone, notAllowed, requireEngagementManagerTo, signedOut } from '@/lib/actions/action-reasons'

// Admin Client for fetching user details
const supabaseAdmin = createSupabaseAdmin(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321"),
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ProjectMembersData = Awaited<ReturnType<typeof getProjectMembersOrThrow>>

/** The engagement's members and open invitations. A failed load answers its reason, never an empty list. */
export async function getProjectMembers(projectId: string): Promise<ActionResult<ProjectMembersData>> {
    return asResult('getProjectMembers', () => getProjectMembersOrThrow(projectId))
}

async function getProjectMembersOrThrow(projectId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    // Names, emails and pending invites: the same people who see the Members tab.
    const engagement = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { clientId: true, client: { select: { firmId: true } } },
    })
    if (!engagement) throw gone('This engagement was deleted.')
    const { canViewProjectInternalTabs } = await import('@/lib/permission-helpers')
    if (!(await canViewProjectInternalTabs(engagement.client.firmId, engagement.clientId, projectId))) {
        throw notAllowed("see this engagement's members")
    }

    // 1. Fetch Members (engagement = project in UI)
    const members = await prisma.engagementMember.findMany({
        where: { engagementId: projectId },
        orderBy: { id: 'asc' }
    })

    // 2. Fetch Pending Invitations — the invite token never leaves the server.
    const invitations = (await prisma.engagementInvitation.findMany({
        where: {
            engagementId: projectId,
            status: { in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED, InvitationStatus.ERROR] }
        },
        include: { persona: true },
        orderBy: { createdAt: 'desc' }
    })).map(({ token: _token, ...rest }) => rest)

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
            // Marked as a failed lookup, not passed off as a person called "Unknown User".
            logger.error('Could not look up an engagement member', e as Error)
            return {
                ...m,
                lookupFailed: true as const,
                user: { email: '', name: "Couldn't load this member's details" }
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return {}

    if (projectIds.length === 0) return {}

    // Only engagements the caller can open — the ids come from the browser.
    const engagements = await prisma.engagement.findMany({
        where: { id: { in: projectIds }, isDeleted: false },
        select: { id: true, clientId: true, client: { select: { firmId: true } } },
    })
    const { canViewProject } = await import('@/lib/permission-helpers')
    const viewable = await Promise.all(
        engagements.map(async (e) => ((await canViewProject(e.client.firmId, e.clientId, e.id)) ? e.id : null)),
    )
    const visibleIds = viewable.filter((id): id is string => id !== null)
    if (visibleIds.length === 0) return {}

    const members = await prisma.engagementMember.findMany({
        where: { engagementId: { in: visibleIds } },
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
    for (const id of visibleIds) {
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

        // Brio is a member of every engagement, so listing it here would put the same agent on
        // every project card as a lead. These summaries answer "who is working on this" — a
        // question about people.
        if (isAgentUser(dbUser)) continue
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

/**
 * The engagement-manager gate, in words a person can read: thrown from a server action, its own
 * message never reaches the browser (see action-result.ts).
 */
async function requireMemberManager(engagementId: string) {
    try {
        return await requireEngagementManager(engagementId)
    } catch (e) {
        const message = e instanceof Error ? e.message : ''
        if (message === 'Unauthorized') throw userFacing('Your session has ended. Sign in again.', 'unauthorized')
        if (message === 'Engagement not found') throw userFacing('This engagement no longer exists.', 'not_found')
        if (message === 'Insufficient permissions') throw userFacing("You don't have permission to change this engagement's members.", 'forbidden')
        throw e
    }
}

/**
 * Removes a member from an engagement, and their access in storage with it: the permissions a secure
 * open granted them on files, and their grants on the engagement's General, Confidential and Staging
 * folders (where Firma shares them, not the engagement's root), on Google Drive and OneDrive.
 *
 * Storage is asked first, and once more for what it refused, because removing the member drops their
 * sharing rows and with them the permission ids. What still stands after that is answered as the
 * result's `warning`: "Removed in Firma, but Google Drive still gives them access to General · {why}".
 */
export async function removeMember(memberId: string): Promise<ActionResult> {
    const result = await asResult('removeMember', () => removeMemberAndAccess(memberId))
    if (!result.ok) return result
    return { ok: true, data: undefined, ...(result.data.warning ? { warning: result.data.warning } : {}) }
}

async function removeMemberAndAccess(memberId: string): Promise<{ warning?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw userFacing('Your session has ended. Sign in again.', 'unauthorized')

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
                        }
                    }
                }
            }
        }
    })

    if (!member) throw userFacing('This person is no longer on the engagement. Refresh the list.', 'not_found')
    await requireMemberManager(member.engagementId)

    // Fetch member email once — reused for folder revocation and invitation supersede
    let memberEmail: string | undefined
    try {
        const { data: { user: memberUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
        memberEmail = memberUser?.email
    } catch (error) {
        logger.error('Error fetching member user for removal', error as Error)
    }

    // 1. File permissions, BEFORE the member row goes: the FK cascade drops their sharing rows, and the
    //    permission ids with them. Any row still holding an id, whatever its status: a REVOKED row with
    //    one is a revoke that didn't finish. Through the connector each was granted on.
    const shares = await prisma.engagementDocumentSharingUser.findMany({
        where: { engagementId: member.engagementId, userId: member.userId, connectorPermissionId: { not: null } },
        select: { ...SHARE_TO_REVOKE_SELECT, document: { select: { externalId: true, connectorId: true, fileName: true } } },
    })
    const fileOutcome = await revokeSharePermissions(member.engagementId, shares)
    let filesStanding = fileOutcome.failed
    let fileReasons = fileOutcome.reasons
    if (fileOutcome.failed.length > fileOutcome.unreachable) {
        const again = await revokeSharePermissions(member.engagementId, shares.filter((s) => fileOutcome.failed.includes(s.id)))
        filesStanding = again.failed
        fileReasons = again.reasons
    }

    // 2. Folder grants on General, Confidential and Staging, on both storages.
    let folderFailures: FolderAccessFailure[] = []
    if (memberEmail) {
        const folders = await revokeMemberFolderAccess(member.engagementId, { userId: member.userId, email: memberEmail })
        folderFailures = folders.failures
        if (folderFailures.length > 0) {
            const again = await revokeMemberFolderAccess(member.engagementId, { userId: member.userId, email: memberEmail }, folderFailures.map((f) => f.folder))
            folderFailures = again.failures
        }
    }

    // Entra ID guest tenancy revocation (deleting the guest's directory object entirely) was
    // considered but is deliberately OUT OF SCOPE — removal from an engagement only revokes
    // that engagement's document/folder access (above), never touches the underlying Entra
    // guest identity. See .claude/plans/connector-microsoft-impl.md, item 19, Part 3.

    // Atomic: delete engagement member + conditionally cascade to firmMember.
    // EC/EV guests get a firmMember row on accept but are not true firm members —
    // remove it if they have no other engagements. firm_admins are never cascaded.
    // The FK cascade on engagement_document_sharing_users drops their sharing rows here.
    const firmId = member.engagement.client.firmId
    await prisma.$transaction(async (tx) => {
        await tx.engagementMember.delete({ where: { id: memberId } })

        const firmMembership = await tx.firmMember.findFirst({
            where: { userId: member.userId, firmId },
            select: { role: true },
        })
        const isActualFirmAdmin = firmMembership?.role === 'firm_admin'
        if (!isActualFirmAdmin) {
            const remainingEngagements = await tx.engagementMember.count({
                where: {
                    userId: member.userId,
                    engagement: { client: { firmId } },
                },
            })
            if (remainingEngagements === 0) {
                await tx.firmMember.deleteMany({
                    where: { userId: member.userId, firmId },
                })
            }
        }
    })

    // Mark invitation as SUPERSEDED so the member can be re-invited
    if (memberEmail) {
        try {
            await prisma.engagementInvitation.updateMany({
                where: { engagementId: member.engagementId, email: memberEmail, status: InvitationStatus.JOINED },
                data: { status: InvitationStatus.SUPERSEDED },
            })
        } catch (error) {
            logger.error('Error superseding invitation on member removal', error as Error)
        }
    }

    audit(AUDIT_EVENT.ENGAGEMENT_MEMBER_REMOVED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(member.engagement.client.firmId)
        .engagement(member.engagementId)
        .actor(user.id)
        .meta({ removedUserId: member.userId })
        .fireAndForget()

    const { invalidateUserSettingsPlus } = await import('@/lib/permissions/invalidate-user-settings')
    await invalidateUserSettingsPlus(member.userId)

    // Async: reminder cleanup via Inngest (retried on failure). Access was taken back above.
    await safeInngestSend('engagement.member.removed', {
        engagementId: member.engagementId,
        userId: member.userId,
        timestamp: new Date().toISOString(),
    })

    revalidatePath('/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug]', 'layout')

    // What storage still allows, in the result: the toast is the only place the person hears it.
    const fileNames = shares.filter((s) => filesStanding.includes(s.id)).map((s) => s.document?.fileName || 'a file')
    if (fileNames.length === 0 && folderFailures.length === 0) {
        if (!memberEmail && member.engagement.connectorRootFolderId) {
            return { warning: `Removed in ${BRAND_NAME}, but their address couldn't be looked up, so their folder access in storage wasn't checked.` }
        }
        return {}
    }
    const warning = accessStillStanding({
        done: `Removed in ${BRAND_NAME}`,
        provider: await storageProviderName(member.engagementId),
        folders: folderFailures.map((f) => f.folder),
        files: fileNames,
        reason: folderFailures[0]?.reason ?? fileReasons[filesStanding[0]],
    })
    logger.warn('Member removed, but storage still gives them access', { engagementId: member.engagementId, files: fileNames.length, folders: folderFailures.length })
    return warning ? { warning } : {}
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
    return asResult('revokeInvitation', async () => {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw signedOut()

        const invite = await prisma.engagementInvitation.findUnique({
            where: { id: invitationId },
            select: { createdBy: true, engagementId: true },
        })
        if (!invite) throw gone('This invitation was already withdrawn.')

        // The engagement's lead, a client manager or a firm admin. This used to accept firm
        // managers only — and skipped the check entirely when the engagement lookup came back empty.
        await requireEngagementManagerTo(invite.engagementId, "withdraw this engagement's invitations")

        await prisma.engagementInvitation.delete({ where: { id: invitationId } })
        if (invite?.createdBy) {
            await removeRemindersByEntity(invite.createdBy, 'platform.engagement_invitations.id', invitationId).catch(() => {})
        }
        revalidatePath('/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]/e/[engagementSlug]', 'layout')
    })
}

/**
 * Changes a member's role, and their storage access to match it.
 *
 * Lowering takes back at once the folder grants the new role doesn't have (Lead to Contributor · Full
 * Access: Confidential and Staging; to Contributor · Limited Access or Reviewer: all three), and says in
 * the result's `warning` what storage refused. The revoke job (project.member.persona.updated) does the
 * same after it, with the per-file permissions, retries and tells the Leads; the grant job
 * (project.member.added) shares what a raised role gains. When either can't be started, the warning
 * says so.
 */
export async function updateMemberPersona(memberId: string, personaId: string): Promise<ActionResult> {
    const result = await asResult('updateMemberPersona', () => changeMemberRole(memberId, personaId))
    if (!result.ok) return result
    return { ok: true, data: undefined, ...(result.data.warning ? { warning: result.data.warning } : {}) }
}

async function changeMemberRole(memberId: string, personaId: string): Promise<{ warning?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw userFacing('Your session has ended. Sign in again.', 'unauthorized')

    const member = await prisma.engagementMember.findUnique({
        where: { id: memberId },
        include: { engagement: { include: { client: true } } }
    })
    if (!member) throw userFacing('This person is no longer on the engagement. Refresh the list.', 'not_found')
    await requireMemberManager(member.engagementId)

    const newPersona = await prisma.persona.findUnique({
        where: { id: personaId }
    })
    if (!newPersona) throw userFacing("That role isn't available any more. Refresh and choose again.", 'not_found')
    if (!isEngagementPersonaSlug(newPersona.slug)) throw userFacing("That role can't be given on an engagement. Choose another.", 'invalid_role')

    const oldPersonaSlug = member.role ?? null
    const newPersonaSlug = newPersona.slug

    await prisma.engagementMember.update({
        where: { id: memberId },
        data: { role: newPersonaSlug }
    })

    // No sign-out: the new role applies on the person's next request (its cache is invalidated
    // below), so ending their sign-ins would add nothing but an interruption.

    const timestamp = new Date().toISOString()

    const revokeStarted = await safeInngestSend('project.member.persona.updated', {
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

    let memberEmail: string | undefined
    try {
        const { data: { user: memberUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
        memberEmail = memberUser?.email || memberUser?.user_metadata?.email
    } catch (error) {
        logger.error('Error fetching member user for a role change', error as Error)
    }

    let grantStarted = true
    const accessGrantingPersonas = ['eng_viewer', 'eng_ext_collaborator', 'eng_member', 'eng_admin']
    if (accessGrantingPersonas.includes(newPersonaSlug) && memberEmail) {
        grantStarted = await safeInngestSend('project.member.added', {
            projectId: member.engagementId,
            organizationId: member.engagement.client.firmId,
            memberId,
            userId: member.userId,
            email: memberEmail,
            personaSlug: newPersonaSlug,
            timestamp
        })
    }

    // Folder grants the new role doesn't have, taken back now, so the answer can say what still stands.
    const kept = new Set(engagementFoldersFor(newPersonaSlug))
    const lost = engagementFoldersFor(oldPersonaSlug).filter((folder) => !kept.has(folder))
    let folderFailures: FolderAccessFailure[] = []
    if (lost.length > 0 && memberEmail) {
        folderFailures = (await revokeMemberFolderAccess(member.engagementId, { userId: member.userId, email: memberEmail }, lost)).failures
    }

    audit(AUDIT_EVENT.ENGAGEMENT_MEMBER_ROLE_CHANGED)
        .scope(AUDIT_SCOPE.ENGAGEMENT)
        .firm(member.engagement.client.firmId)
        .engagement(member.engagementId)
        .actor(user.id)
        .meta({ memberId, userId: member.userId, oldRole: oldPersonaSlug, newRole: newPersonaSlug })
        .fireAndForget()

    const { invalidateUserSettingsPlus } = await import('@/lib/permissions/invalidate-user-settings')
    await invalidateUserSettingsPlus(member.userId)

    if (folderFailures.length > 0) {
        const warning = accessStillStanding({
            done: `Role updated in ${BRAND_NAME}`,
            provider: await storageProviderName(member.engagementId),
            folders: folderFailures.map((f) => f.folder),
            reason: folderFailures[0].reason,
        })
        if (warning) return { warning }
    }
    if (!revokeStarted || !grantStarted) {
        return { warning: `Role updated in ${BRAND_NAME}, but updating their access in storage didn't start. Save the role again to retry.` }
    }
    return {}
}
