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

const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getClientMembers(clientId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const members = await prisma.clientMember.findMany({
        where: { clientId },
        include: { persona: true },
        orderBy: { id: 'asc' }
    })

    const invitations = await prisma.clientInvitation.findMany({
        where: {
            clientId,
            status: { in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED, InvitationStatus.ERROR] }
        },
        include: { persona: true },
        orderBy: { createdAt: 'desc' }
    })

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
            } catch {
                return {
                    ...m,
                    user: { email: 'Unknown', name: 'Unknown User', avatarUrl: null }
                }
            }
        })
    )

    return { members: enrichedMembers, invitations }
}

export async function inviteClientMember(firmId: string, clientId: string, email: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const canManage = await canManageClient(firmId, clientId)
    if (!canManage) throw new Error('Insufficient permissions to invite client members')

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        include: { firm: { select: { sandboxOnly: true, name: true } } }
    })
    if (!client) throw new Error('Client not found')
    if (client.firm?.sandboxOnly) {
        throw new Error('Inviting members is restricted for Sandbox firms. Upgrade to invite teammates.')
    }

    const persona = await prisma.persona.findUnique({
        where: { slug: 'client_admin' }
    })
    if (!persona) throw new Error('System Error: client_admin persona not found')

    const normalizedEmail = email.trim().toLowerCase()

    const allMembers = await prisma.clientMember.findMany({ where: { clientId }, select: { userId: true } })
    const memberEmails = await Promise.all(
        allMembers.map(async (m) => {
            try {
                const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(m.userId)
                return u?.email?.toLowerCase() ?? null
            } catch {
                return null
            }
        })
    )
    if (memberEmails.includes(normalizedEmail)) {
        throw new Error('A member with this email is already in the client')
    }

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    const existing = await prisma.clientInvitation.findUnique({
        where: { clientId_email: { clientId, email: normalizedEmail } }
    })

    if (existing) {
        if (existing.status === InvitationStatus.JOINED) {
            throw new Error('This user has already joined the client')
        }
        await prisma.clientInvitation.update({
            where: { id: existing.id },
            data: { status: 'PENDING', token, expireAt, updatedBy: user.id }
        })
    } else {
        await prisma.clientInvitation.create({
            data: {
                clientId,
                email: normalizedEmail,
                personaId: persona.id,
                status: 'PENDING',
                token,
                expireAt,
                createdBy: user.id,
                updatedBy: user.id,
            }
        })
    }

    await maybeProvisionInviteeAccount(normalizedEmail)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    const { subject, html } = renderInviteEmail({
        firmName: client.firm?.name ?? '',
        clientName: client.name,
        inviteUrl,
    })
    await sendEmail(normalizedEmail, subject, html)

    audit(AUDIT_EVENT.CLIENT_MEMBER_INVITED)
        .scope(AUDIT_SCOPE.CLIENT)
        .firm(firmId)
        .actor(user.id)
        .meta({ invitedEmail: normalizedEmail, clientId })
        .fireAndForget()

    revalidatePath(`/d/f/[slug]/c/[clientSlug]`)
}

export async function resendClientInvitation(invitationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const invite = await prisma.clientInvitation.findUnique({
        where: { id: invitationId },
        include: { client: { select: { firmId: true, name: true, firm: { select: { name: true } } } } }
    })
    if (!invite) throw new Error('Invitation not found')
    if (invite.status === InvitationStatus.JOINED) throw new Error('User has already joined')
    if (invite.status === InvitationStatus.ACCEPTED) throw new Error('User is currently accepting this invitation — please wait')

    const canManage = await canManageClient(invite.client.firmId, invite.clientId)
    if (!canManage) throw new Error('Insufficient permissions')

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
        })
    }
    revalidatePath(`/d/f/[slug]/c/[clientSlug]`)
}

export async function revokeClientInvitation(invitationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const invite = await prisma.clientInvitation.findUnique({
        where: { id: invitationId },
        include: { client: { select: { firmId: true } } }
    })
    if (!invite) throw new Error('Invitation not found')

    const canManage = await canManageClient(invite.client.firmId, invite.clientId)
    if (!canManage) throw new Error('Insufficient permissions')

    await prisma.clientInvitation.delete({ where: { id: invitationId } })
    revalidatePath(`/d/f/[slug]/c/[clientSlug]`)
}
