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
import { canManageOrganization } from '@/lib/permission-helpers'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'
import { upsertFollowUpReminder, removeRemindersByEntity } from '@/lib/actions/user-reminders'
import { getAvatarUrlFromSupabaseUser } from '@/lib/supabase-user-helpers'

const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function getFirmMembers(firmId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const members = await prisma.firmMember.findMany({
        where: { firmId },
        orderBy: { id: 'asc' }
    })

    const invitations = await prisma.firmInvitation.findMany({
        where: {
            firmId,
            status: { in: [InvitationStatus.PENDING, InvitationStatus.ACCEPTED, InvitationStatus.ERROR] }
        },
        include: { persona: true },
        orderBy: { createdAt: 'desc' }
    })

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
                    user: {
                        email: dbUser?.email,
                        name: dbUser?.user_metadata?.full_name || dbUser?.user_metadata?.name || dbUser?.email?.split('@')[0],
                        avatarUrl: getAvatarUrlFromSupabaseUser(dbUser)
                    }
                }
            } catch {
                return {
                    ...m,
                    ownsConnector: connectorUserIds.has(m.userId),
                    user: { email: 'Unknown', name: 'Unknown User', avatarUrl: null }
                }
            }
        })
    )

    return { members: enrichedMembers, invitations }
}

export async function removeFirmMember(firmId: string, memberId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const canManage = await canManageOrganization(firmId)
    if (!canManage) throw new Error('Insufficient permissions')

    const member = await prisma.firmMember.findUnique({ where: { id: memberId } })
    if (!member || member.firmId !== firmId) throw new Error('Member not found')

    if (member.role === 'firm_admin') {
        const adminCount = await prisma.firmMember.count({ where: { firmId, role: 'firm_admin' } })
        if (adminCount <= 1) throw new Error('Cannot remove the last Firm Administrator')
    }

    await prisma.firmMember.delete({ where: { id: memberId } })

    // Mark the firm invitation as SUPERSEDED so the member can be re-invited
    try {
        const { data: { user: removedUser } } = await supabaseAdmin.auth.admin.getUserById(member.userId)
        if (removedUser?.email) {
            await prisma.firmInvitation.updateMany({
                where: { firmId, email: removedUser.email, status: InvitationStatus.JOINED },
                data: { status: InvitationStatus.SUPERSEDED }
            })
        }
    } catch {
        // Non-fatal — member is removed regardless
    }

    // Kick the removed user's active sessions — fire-and-forget
    supabaseAdmin.auth.admin.signOut(member.userId).catch(() => {})

    audit(AUDIT_EVENT.FIRM_MEMBER_REMOVED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firmId)
        .actor(user.id)
        .meta({ removedUserId: member.userId })
        .fireAndForget()

    revalidatePath('/d/f/[slug]')
}

export async function inviteFirmMember(firmId: string, email: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const canManage = await canManageOrganization(firmId)
    if (!canManage) throw new Error('Insufficient permissions to invite firm members')

    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { sandboxOnly: true, slug: true, name: true }
    })
    if (!firm) throw new Error('Firm not found')
    if (firm.sandboxOnly) {
        throw new Error('Inviting members is restricted for Sandbox firms. Upgrade to invite teammates.')
    }

    const persona = await prisma.persona.findUnique({
        where: { slug: 'firm_admin' }
    })
    if (!persona) throw new Error('System Error: firm_admin persona not found')

    const normalizedEmail = email.trim().toLowerCase()
    const allMembers = await prisma.firmMember.findMany({ where: { firmId }, select: { userId: true } })
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
        throw new Error('A member with this email is already in the firm')
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
            throw new Error('This user has already joined the firm')
        }
        await prisma.firmInvitation.update({
            where: { id: existing.id },
            data: { status: 'PENDING', token, expireAt, updatedBy: user.id }
        })
        invitationId = existing.id
    } else {
        const created = await prisma.firmInvitation.create({
            data: {
                firmId,
                email: normalizedEmail,
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
        ctaUrl: `/d/f/${firm.slug}/settings`,
    }).catch(() => {})

    await maybeProvisionInviteeAccount(normalizedEmail)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    const { subject, html } = renderInviteEmail({ firmName: firm.name, inviteUrl })
    await sendEmail(normalizedEmail, subject, html)

    audit(AUDIT_EVENT.FIRM_MEMBER_INVITED)
        .scope(AUDIT_SCOPE.FIRM)
        .firm(firmId)
        .actor(user.id)
        .meta({ invitedEmail: normalizedEmail })
        .fireAndForget()

    revalidatePath('/d/f/[slug]')
}

export async function resendFirmInvitation(invitationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const invite = await prisma.firmInvitation.findUnique({
        where: { id: invitationId },
        include: { firm: { select: { sandboxOnly: true, slug: true, name: true } } }
    })
    if (!invite) throw new Error('Invitation not found')
    if (invite.status === InvitationStatus.JOINED) throw new Error('User has already joined')
    if (invite.status === InvitationStatus.ACCEPTED) throw new Error('User is currently accepting this invitation — please wait')

    const canManage = await canManageOrganization(invite.firmId)
    if (!canManage) throw new Error('Insufficient permissions')

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
        ctaUrl: `/d/f/${invite.firm?.slug}/settings`,
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
        })
    }
    revalidatePath('/d/f/[slug]')
}

export async function revokeFirmInvitation(invitationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const invite = await prisma.firmInvitation.findUnique({
        where: { id: invitationId }
    })
    if (!invite) throw new Error('Invitation not found')

    const canManage = await canManageOrganization(invite.firmId)
    if (!canManage) throw new Error('Insufficient permissions')

    await prisma.firmInvitation.delete({ where: { id: invitationId } })
    await removeRemindersByEntity(invite.createdBy ?? user.id, 'platform.firm_invitations', invitationId).catch(() => {})
    revalidatePath('/d/f/[slug]')
}
