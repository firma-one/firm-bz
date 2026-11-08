'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { isAgentUser } from '@/lib/ai/files-agent/agent-identity'
import { InvitationStatus } from '@prisma/client'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { renderInviteEmail } from '@/lib/email-templates/invite'
import { maybeProvisionInviteeAccount } from '@/lib/actions/account-provisioning'
import { canManageOrganization } from '@/lib/permission-helpers'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { upsertFollowUpReminder, removeRemindersByEntity } from '@/lib/reminders/reminder-service'
import { getAvatarUrlFromSupabaseUser } from '@/lib/supabase-user-helpers'
import { firmSettingsPath } from '@/lib/navigation/firm-paths'
import { normalizeInviteeName, type InviteeName } from '@/lib/auth/invite-names'
import { endUserSessions } from '@/lib/auth/sessions'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { asResultWithWarning, gone, notAllowed, signedOut } from '@/lib/actions/action-reasons'
import { inviteEmailFailed } from '@/lib/actions/invite-email-words'
import { markSharesRevoked, revokeSharePermissions, SHARE_TO_REVOKE_SELECT } from '@/lib/connectors/revoke-share-permissions'
import { revokeMemberFolderAccess } from '@/lib/connectors/firm-folder-access'
import { accessStillStanding, storageProviderName } from '@/lib/storage-access-notice'

const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type FirmMembersData = Awaited<ReturnType<typeof getFirmMembersOrThrow>>

/** The firm's members and open invitations. A failed load answers its reason, never an empty list. */
export async function getFirmMembers(firmId: string): Promise<ActionResult<FirmMembersData>> {
    return asResult('getFirmMembers', () => getFirmMembersOrThrow(firmId))
}

async function getFirmMembersOrThrow(firmId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    // Names, emails and roles of a whole firm. This only checked sign-in, so anyone could list any
    // firm. Callers are the firm Members tab (firm admins) and the client-settings owner picker
    // (firm admins and Client Partners) — a guest's firm_member row doesn't qualify.
    // (.claude/plans/access-gates.md, P0 #12)
    const isFirmAdmin = !!(await prisma.firmMember.findFirst({
        where: { firmId, userId: user.id, role: 'firm_admin' },
        select: { id: true },
    }))
    const isClientPartner = !isFirmAdmin && !!(await prisma.clientMember.findFirst({
        where: { userId: user.id, client: { firmId }, persona: { slug: 'client_admin' } },
        select: { id: true },
    }))
    if (!isFirmAdmin && !isClientPartner) throw notAllowed("see this firm's members")

    const members = await prisma.firmMember.findMany({
        where: { firmId },
        orderBy: { id: 'asc' }
    })

    // Pending invitations are for firm admins only, and the invite token never leaves the server.
    const invitations = isFirmAdmin
        ? (await prisma.firmInvitation.findMany({
            where: {
                firmId,
                status: { in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED, InvitationStatus.ERROR] }
            },
            include: { persona: true },
            orderBy: { createdAt: 'desc' }
        })).map(({ token: _token, ...rest }) => rest)
        : []

    // Find all connector userIds for this firm so we can flag connector owners
    const connectors = await prisma.connector.findMany({
        where: { firmId },
        select: { userId: true }
    })
    const connectorUserIds = new Set(connectors.map(c => c.userId))

    const enrichedMembers = await Promise.all(
        members.map(async (m) => {
            try {
                const { data: { user: dbUser } } = await supabaseAdmin.auth.admin.getUserById(m.userId)
                return {
                    ...m,
                    ownsConnector: connectorUserIds.has(m.userId),
                    // Flagged, not filtered: Brio belongs in the Firm Members list, but not in
                    // pickers choosing a person to own something.
                    isAgent: isAgentUser(dbUser),
                    user: {
                        email: dbUser?.email,
                        name: dbUser?.user_metadata?.full_name || dbUser?.user_metadata?.name || dbUser?.email?.split('@')[0],
                        avatarUrl: getAvatarUrlFromSupabaseUser(dbUser)
                    }
                }
            } catch (error) {
                // Marked as a failed lookup, not passed off as a person called "Unknown User".
                logger.error('Could not look up a firm member', error as Error)
                return {
                    ...m,
                    ownsConnector: connectorUserIds.has(m.userId),
                    lookupFailed: true as const,
                    user: { email: '', name: "Couldn't load this member's details", avatarUrl: null }
                }
            }
        })
    )

    return { members: enrichedMembers, invitations }
}

/**
 * Removes a member from the firm, and the storage access its engagements gave them: their file
 * permissions and their General, Confidential and Staging folder grants, engagement by engagement. Firma
 * stops them at once (every request checks firm membership); storage only once it's asked. What it still
 * allows is answered as the result's `warning`.
 */
export async function removeFirmMember(firmId: string, memberId: string): Promise<ActionResult> {
    const result = await asResult('removeFirmMember', () => removeFirmMemberAndAccess(firmId, memberId))
    if (!result.ok) return result
    return { ok: true, data: undefined, ...(result.data.warning ? { warning: result.data.warning } : {}) }
}

async function removeFirmMemberAndAccess(firmId: string, memberId: string): Promise<{ warning?: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw userFacing('Your session has ended. Sign in again.', 'unauthorized')

    const canManage = await canManageOrganization(firmId)
    if (!canManage) throw userFacing("You don't have permission to remove members of this firm.", 'forbidden')

    const member = await prisma.firmMember.findUnique({ where: { id: memberId } })
    if (!member || member.firmId !== firmId) throw userFacing('This person is no longer a member of the firm. Refresh the list.', 'not_found')

    if (member.role === 'firm_admin') {
        const adminCount = await prisma.firmMember.count({ where: { firmId, role: 'firm_admin' } })
        if (adminCount <= 1) throw userFacing('Cannot remove the last Firm Administrator', 'last_admin')
    }

    let removedEmail: string | undefined
    try {
        const { data: { user: removedUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
        removedEmail = removedUser?.email
    } catch (error) {
        logger.error('Error fetching the removed firm member', error as Error)
    }

    await prisma.firmMember.delete({ where: { id: memberId } })

    // Mark the firm invitation as SUPERSEDED so the member can be re-invited
    if (removedEmail) {
        try {
            await prisma.firmInvitation.updateMany({
                where: { firmId, email: removedEmail, status: InvitationStatus.JOINED },
                data: { status: InvitationStatus.SUPERSEDED }
            })
        } catch {
            // Non-fatal — member is removed regardless
        }
    }

    // Storage access their engagements gave them. Their engagement rows stay, as before: Firma already
    // stops them, and the rows keep any permission storage wouldn't give up (markSharesRevoked).
    const memberships = await prisma.engagementMember.findMany({
        where: { userId: member.userId, engagement: { firmId } },
        select: { engagementId: true, engagement: { select: { name: true } } },
    })
    const files: string[] = []
    const folders: string[] = []
    const providers = new Set<string>()
    let reason: string | undefined
    let unchecked = false
    for (const { engagementId, engagement } of memberships) {
        try {
            const shares = await prisma.engagementDocumentSharingUser.findMany({
                where: { engagementId, userId: member.userId, connectorPermissionId: { not: null } },
                select: { ...SHARE_TO_REVOKE_SELECT, document: { select: { externalId: true, connectorId: true, fileName: true } } },
            })
            const fileOutcome = await revokeSharePermissions(engagementId, shares)
            if (shares.length > 0) await markSharesRevoked({ id: { in: shares.map((s) => s.id) } }, fileOutcome.failed)
            const folderOutcome = removedEmail
                ? await revokeMemberFolderAccess(engagementId, { userId: member.userId, email: removedEmail })
                : { revoked: [], failures: [] }

            const standing = shares.filter((s) => fileOutcome.failed.includes(s.id))
            if (standing.length === 0 && folderOutcome.failures.length === 0) continue
            files.push(...standing.map((s) => s.document?.fileName || 'a file'))
            folders.push(...folderOutcome.failures.map((f) => `${f.folder} in ${engagement.name}`))
            providers.add(await storageProviderName(engagementId))
            reason ??= folderOutcome.failures[0]?.reason ?? fileOutcome.reasons[fileOutcome.failed[0]]
        } catch (error) {
            // They're out of the firm already: say what couldn't be checked rather than fail the removal.
            logger.error('Could not take back storage access for a removed firm member', error as Error)
            unchecked = true
        }
    }

    // Removal from a firm ends the person's sign-ins everywhere — fire-and-forget (endUserSessions
    // logs a failure). Access is already gone: every request checks firm membership.
    endUserSessions(member.userId).catch(() => {})

    audit(AUDIT_EVENT.FIRM_MEMBER_REMOVED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firmId)
        .actor(user.id)
        .meta({ removedUserId: member.userId })
        .fireAndForget()

    revalidatePath('/d/[groupSlug]/f/[firmSlug]', 'layout')

    if (unchecked && files.length === 0 && folders.length === 0) {
        return { warning: "Removed from the firm, but their access in storage couldn't be checked. Open the storage to remove it." }
    }
    if (!removedEmail && memberships.length > 0) {
        return { warning: "Removed from the firm, but their address couldn't be looked up, so their folder access in storage wasn't checked." }
    }
    const warning = accessStillStanding({
        done: 'Removed from the firm',
        provider: providers.size === 1 ? Array.from(providers)[0] : 'the connected storage',
        folders,
        files,
        reason,
    })
    return warning ? { warning } : {}
}

/**
 * Invites a firm administrator. The invitation is saved first; when its email can't be sent the answer
 * is still ok, with a `warning` that says so, and the row reads Email failed so Resend is offered.
 */
export async function inviteFirmMember(firmId: string, email: string, invitee?: InviteeName): Promise<ActionResult> {
    return asResultWithWarning('inviteFirmMember', async () => {
        const warning = await inviteFirmMemberOrThrow(firmId, email, invitee)
        return { data: undefined, ...(warning ? { warning } : {}) }
    })
}

async function inviteFirmMemberOrThrow(firmId: string, email: string, invitee?: InviteeName): Promise<string | undefined> {
    const inviteeName = normalizeInviteeName(invitee)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const canManage = await canManageOrganization(firmId)
    if (!canManage) throw notAllowed('invite members to this firm')

    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { sandboxOnly: true, slug: true, name: true, group: { select: { slug: true } } }
    })
    if (!firm) throw gone('This firm was deleted.')
    if (firm.sandboxOnly) {
        throw userFacing('Inviting members is restricted for Sandbox firms. Upgrade to invite teammates.', 'upgrade_required')
    }

    const persona = await prisma.persona.findUnique({
        where: { slug: 'firm_admin' }
    })
    if (!persona) throw new Error('System Error: firm_admin persona not found')

    const normalizedEmail = email.trim().toLowerCase()
    const allMembers = await prisma.firmMember.findMany({ where: { firmId }, select: { userId: true } })
    // A lookup that fails must not let a duplicate through as "not a member" (P2-45): refuse instead.
    const memberEmails = await Promise.all(
        allMembers.map(async (m) => {
            const { data, error } = await supabaseAdmin.auth.admin.getUserById(m.userId)
            // 404: the account is gone, so it holds no address to match.
            if (error && error.status !== 404) {
                logger.error('Could not look up a firm member while checking an invite', error)
                throw userFacing("Couldn't check whether this person is already a member. Try again.", 'lookup_failed')
            }
            return data.user?.email?.toLowerCase() ?? null
        })
    )
    if (memberEmails.includes(normalizedEmail)) {
        throw userFacing('A member with this email is already in the firm', 'already_member')
    }

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    const existing = await prisma.firmInvitation.findUnique({
        where: { firmId_email: { firmId, email: normalizedEmail } }
    })

    let invitationId: string
    if (existing) {
        if (existing.status === InvitationStatus.JOINED) {
            throw userFacing('This person has already joined the firm', 'already_joined')
        }
        await prisma.firmInvitation.update({
            // A re-invite without a name leaves the one already on the row alone.
            where: { id: existing.id },
            data: { status: 'PENDING', token, expireAt, updatedBy: user.id, ...(inviteeName ?? {}) }
        })
        invitationId = existing.id
    } else {
        const created = await prisma.firmInvitation.create({
            data: {
                firmId,
                email: normalizedEmail,
                firstName: inviteeName?.firstName ?? null,
                lastName: inviteeName?.lastName ?? null,
                personaId: persona.id,
                status: 'PENDING',
                token,
                expireAt,
                createdBy: user.id,
                updatedBy: user.id,
            }
        })
        invitationId = created.id
    }

    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.firm_invitations',
        entityValue: invitationId,
        action: 'Invitation expiring',
        dateKey: 'platform.firm_invitations.expireAt',
        dateValue: expireAt.toISOString(),
        entityName: normalizedEmail,
        firmId,
        ctaUrl: firmSettingsPath(firm.group.slug, firm.slug),
    }).catch(() => {})

    await maybeProvisionInviteeAccount(normalizedEmail, inviteeName)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    let warning: string | undefined
    try {
        const { subject, html } = renderInviteEmail({ firmName: firm.name, inviteUrl })
        await sendEmail(normalizedEmail, subject, html)
    } catch (err) {
        logger.error('Firm invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: normalizedEmail })
        await prisma.firmInvitation.update({ where: { id: invitationId }, data: { status: InvitationStatus.ERROR } })
            .catch((e) => logger.error('Could not mark the firm invitation Email failed', e as Error))
        warning = inviteEmailFailed(normalizedEmail, 'saved')
    }

    audit(AUDIT_EVENT.FIRM_MEMBER_INVITED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firmId)
        .actor(user.id)
        .meta({ invitedEmail: normalizedEmail })
        .fireAndForget()

    revalidatePath('/d/[groupSlug]/f/[firmSlug]', 'layout')
    return warning
}

/**
 * Sends a firm invitation again. Its whole job is the email, so an email that can't be sent is the
 * answer's error (and the row reads Email failed), never "Invitation resent".
 */
export async function resendFirmInvitation(invitationId: string): Promise<ActionResult> {
    return asResult('resendFirmInvitation', () => resendFirmInvitationOrThrow(invitationId))
}

async function resendFirmInvitationOrThrow(invitationId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const invite = await prisma.firmInvitation.findUnique({
        where: { id: invitationId },
        include: { firm: { select: { sandboxOnly: true, slug: true, name: true, group: { select: { slug: true } } } } }
    })
    if (!invite) throw gone('This invitation was withdrawn.')

    // Who may manage the firm first, so its invitations' states aren't told to anyone else.
    const canManage = await canManageOrganization(invite.firmId)
    if (!canManage) throw notAllowed("resend this firm's invitations")
    if (invite.status === InvitationStatus.JOINED) throw userFacing('This person has already joined the firm.', 'already_joined')
    if (invite.status === InvitationStatus.ACCEPTED) throw userFacing('This person is accepting the invitation right now. Wait a moment, then refresh.', 'mid_accept')

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    await prisma.firmInvitation.update({
        where: { id: invitationId },
        data: { token, status: 'PENDING', expireAt, updatedAt: new Date() }
    })

    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.firm_invitations',
        entityValue: invitationId,
        action: 'Invitation expiring',
        dateKey: 'platform.firm_invitations.expireAt',
        dateValue: expireAt.toISOString(),
        entityName: invite.email,
        firmId: invite.firmId,
        ctaUrl: invite.firm ? firmSettingsPath(invite.firm.group.slug, invite.firm.slug) : null,
    }).catch(() => {})

    await maybeProvisionInviteeAccount(invite.email)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    try {
        const { subject, html } = renderInviteEmail({ firmName: invite.firm?.name ?? '', inviteUrl })
        await sendEmail(invite.email, subject, html)
    } catch (err) {
        logger.error('Resend firm invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: invite.email })
        await prisma.firmInvitation.update({
            where: { id: invitationId },
            data: { status: InvitationStatus.ERROR, updatedAt: new Date() }
        }).catch((e) => logger.error('Could not mark the firm invitation Email failed', e as Error))
        revalidatePath('/d/[groupSlug]/f/[firmSlug]', 'layout')
        throw userFacing(inviteEmailFailed(invite.email, 'resend'), 'email_failed')
    }
    revalidatePath('/d/[groupSlug]/f/[firmSlug]', 'layout')
}

export async function revokeFirmInvitation(invitationId: string): Promise<ActionResult> {
    return asResult('revokeFirmInvitation', () => revokeFirmInvitationOrThrow(invitationId))
}

async function revokeFirmInvitationOrThrow(invitationId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const invite = await prisma.firmInvitation.findUnique({
        where: { id: invitationId }
    })
    if (!invite) throw gone('This invitation was already withdrawn.')

    const canManage = await canManageOrganization(invite.firmId)
    if (!canManage) throw notAllowed("withdraw this firm's invitations")

    await prisma.firmInvitation.delete({ where: { id: invitationId } })
    await removeRemindersByEntity(invite.createdBy ?? user.id, 'platform.firm_invitations', invitationId).catch(() => {})
    revalidatePath('/d/[groupSlug]/f/[firmSlug]', 'layout')
}
