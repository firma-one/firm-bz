'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { InvitationStatus } from '@prisma/client'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { renderInviteEmail } from '@/lib/email-templates/invite'
import { maybeProvisionInviteeAccount } from '@/lib/actions/account-provisioning'
import { canManageClient } from '@/lib/permission-helpers'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { getAvatarUrlFromSupabaseUser } from '@/lib/supabase-user-helpers'
import { normalizeInviteeName, type InviteeName } from '@/lib/auth/invite-names'
import { asResult, userFacing, type ActionResult } from '@/lib/actions/action-result'
import { asResultWithWarning, gone, notAllowed, signedOut } from '@/lib/actions/action-reasons'
import { inviteEmailFailed } from '@/lib/actions/invite-email-words'

const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type ClientMembersData = Awaited<ReturnType<typeof getClientMembersOrThrow>>

/** The client's members and open invitations. A failed load answers its reason, never an empty list. */
export async function getClientMembers(clientId: string): Promise<ActionResult<ClientMembersData>> {
    return asResult('getClientMembers', () => getClientMembersOrThrow(clientId))
}

async function getClientMembersOrThrow(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    // Members and invitations of a client: its managers only, on the client's own firm. This only
    // checked sign-in. (.claude/plans/access-gates.md, P0 #12)
    const owning = await prisma.client.findUnique({ where: { id: clientId }, select: { firmId: true } })
    if (!owning || !(await canManageClient(owning.firmId, clientId))) throw notAllowed("see this client's members")

    const members = await prisma.clientMember.findMany({
        where: { clientId },
        include: { persona: true },
        orderBy: { id: 'asc' }
    })

    // The invite token never leaves the server.
    const invitations = (await prisma.clientInvitation.findMany({
        where: {
            clientId,
            status: { in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED, InvitationStatus.ERROR] }
        },
        include: { persona: true },
        orderBy: { createdAt: 'desc' }
    })).map(({ token: _token, ...rest }) => rest)

    const enrichedMembers = await Promise.all(
        members.map(async (m) => {
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
            } catch (error) {
                // Marked as a failed lookup, not passed off as a person called "Unknown User".
                logger.error('Could not look up a client member', error as Error)
                return {
                    ...m,
                    lookupFailed: true as const,
                    user: { email: '', name: "Couldn't load this member's details", avatarUrl: null }
                }
            }
        })
    )

    return { members: enrichedMembers, invitations }
}

/**
 * Invites a client administrator. The invitation is saved first; when its email can't be sent the
 * answer is still ok, with a `warning` that says so, and the row reads Email failed so Resend is offered.
 */
export async function inviteClientMember(firmId: string, clientId: string, email: string, invitee?: InviteeName): Promise<ActionResult> {
    return asResultWithWarning('inviteClientMember', async () => {
        const warning = await inviteClientMemberOrThrow(firmId, clientId, email, invitee)
        return { data: undefined, ...(warning ? { warning } : {}) }
    })
}

async function inviteClientMemberOrThrow(firmId: string, clientId: string, email: string, invitee?: InviteeName): Promise<string | undefined> {
    const inviteeName = normalizeInviteeName(invitee)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { firm: { select: { sandboxOnly: true, name: true } } }
    })
    if (!client) throw gone('This client was deleted.')
    // Check against the client's own firm, never the firmId the caller sent — a firm admin of
    // any firm used to pass for a foreign client. (.claude/plans/access-gates.md, P0 #8)
    if (firmId && firmId !== client.firmId) throw gone('This client was deleted.')
    const canManage = await canManageClient(client.firmId, clientId)
    if (!canManage) throw notAllowed('invite members to this client')
    if (client.firm?.sandboxOnly) {
        throw userFacing('Inviting members is restricted for Sandbox firms. Upgrade to invite teammates.', 'upgrade_required')
    }

    const persona = await prisma.persona.findUnique({
        where: { slug: 'client_admin' }
    })
    if (!persona) throw new Error('System Error: client_admin persona not found')

    const normalizedEmail = email.trim().toLowerCase()

    const allMembers = await prisma.clientMember.findMany({ where: { clientId }, select: { userId: true } })
    // A lookup that fails must not let a duplicate through as "not a member" (P2-45): refuse instead.
    const memberEmails = await Promise.all(
        allMembers.map(async (m) => {
            const { data, error } = await supabaseAdmin.auth.admin.getUserById(m.userId)
            // 404: the account is gone, so it holds no address to match.
            if (error && error.status !== 404) {
                logger.error('Could not look up a client member while checking an invite', error)
                throw userFacing("Couldn't check whether this person is already a member. Try again.", 'lookup_failed')
            }
            return data.user?.email?.toLowerCase() ?? null
        })
    )
    if (memberEmails.includes(normalizedEmail)) {
        throw userFacing('A member with this email is already in this client', 'already_member')
    }

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    const existing = await prisma.clientInvitation.findUnique({
        where: { clientId_email: { clientId, email: normalizedEmail } }
    })

    let invitationId: string
    if (existing) {
        if (existing.status === InvitationStatus.JOINED) {
            throw userFacing('This person has already joined this client', 'already_joined')
        }
        await prisma.clientInvitation.update({
            // A re-invite without a name leaves the one already on the row alone.
            where: { id: existing.id },
            data: { status: 'PENDING', token, expireAt, updatedBy: user.id, ...(inviteeName ?? {}) }
        })
        invitationId = existing.id
    } else {
        const created = await prisma.clientInvitation.create({
            data: {
                clientId,
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

    await maybeProvisionInviteeAccount(normalizedEmail, inviteeName)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    let warning: string | undefined
    try {
        const { subject, html } = renderInviteEmail({
            firmName: client.firm?.name ?? '',
            clientName: client.name,
            inviteUrl,
        })
        await sendEmail(normalizedEmail, subject, html)
    } catch (err) {
        logger.error('Client invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: normalizedEmail })
        await prisma.clientInvitation.update({ where: { id: invitationId }, data: { status: InvitationStatus.ERROR } })
            .catch((e) => logger.error('Could not mark the client invitation Email failed', e as Error))
        warning = inviteEmailFailed(normalizedEmail, 'saved')
    }

    audit(AUDIT_EVENT.CLIENT_MEMBER_INVITED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firmId)
        .actor(user.id)
        .meta({ invitedEmail: normalizedEmail, clientId })
        .fireAndForget()

    revalidatePath('/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]', 'layout')
    return warning
}

/**
 * Sends a client invitation again. Its whole job is the email, so an email that can't be sent is the
 * answer's error (and the row reads Email failed), never "Invitation resent".
 */
export async function resendClientInvitation(invitationId: string): Promise<ActionResult> {
    return asResult('resendClientInvitation', () => resendClientInvitationOrThrow(invitationId))
}

async function resendClientInvitationOrThrow(invitationId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const invite = await prisma.clientInvitation.findUnique({
        where: { id: invitationId },
        include: { client: { select: { firmId: true, name: true, firm: { select: { name: true } } } } }
    })
    if (!invite) throw gone('This invitation was withdrawn.')

    // Who may manage the client first, so its invitations' states aren't told to anyone else.
    const canManage = await canManageClient(invite.client.firmId, invite.clientId)
    if (!canManage) throw notAllowed("resend this client's invitations")
    if (invite.status === InvitationStatus.JOINED) throw userFacing('This person has already joined this client.', 'already_joined')
    if (invite.status === InvitationStatus.ACCEPTED) throw userFacing('This person is accepting the invitation right now. Wait a moment, then refresh.', 'mid_accept')

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    await prisma.clientInvitation.update({
        where: { id: invitationId },
        data: { token, status: 'PENDING', expireAt, updatedAt: new Date() }
    })

    await maybeProvisionInviteeAccount(invite.email)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    try {
        const { subject, html } = renderInviteEmail({
            firmName: invite.client.firm?.name ?? '',
            clientName: invite.client.name,
            inviteUrl,
        })
        await sendEmail(invite.email, subject, html)
    } catch (err) {
        logger.error('Resend client invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: invite.email })
        await prisma.clientInvitation.update({
            where: { id: invitationId },
            data: { status: InvitationStatus.ERROR, updatedAt: new Date() }
        }).catch((e) => logger.error('Could not mark the client invitation Email failed', e as Error))
        revalidatePath('/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]', 'layout')
        throw userFacing(inviteEmailFailed(invite.email, 'resend'), 'email_failed')
    }
    revalidatePath('/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]', 'layout')
}

export async function revokeClientInvitation(invitationId: string): Promise<ActionResult> {
    return asResult('revokeClientInvitation', () => revokeClientInvitationOrThrow(invitationId))
}

async function revokeClientInvitationOrThrow(invitationId: string): Promise<void> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw signedOut()

    const invite = await prisma.clientInvitation.findUnique({
        where: { id: invitationId },
        include: { client: { select: { firmId: true } } }
    })
    if (!invite) throw gone('This invitation was already withdrawn.')

    const canManage = await canManageClient(invite.client.firmId, invite.clientId)
    if (!canManage) throw notAllowed("withdraw this client's invitations")

    await prisma.clientInvitation.delete({ where: { id: invitationId } })
    revalidatePath('/d/[groupSlug]/f/[firmSlug]/c/[clientSlug]', 'layout')
}
