'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { InvitationStatus } from '@prisma/client'
import { sendEmail } from '@/lib/email'
import { BRAND_NAME } from '@/config/brand'
import { canManageOrganization } from '@/lib/permission-helpers'
import { audit, AUDIT_EVENT, AUDIT_SCOPE } from '@/lib/audit'

const supabaseAdmin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getAvatarUrlFromSupabaseUser(dbUser: any): string | null {
    if (!dbUser) return null
    const meta = dbUser.user_metadata
    const fromMeta = (meta?.avatar_url ?? meta?.picture) as string | undefined
    if (fromMeta) return fromMeta
    const firstIdentity = dbUser.identities?.[0]?.identity_data
    const fromIdentity = (firstIdentity?.avatar_url ?? firstIdentity?.picture) as string | undefined
    return fromIdentity ?? null
}

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
            status: { not: InvitationStatus.JOINED }
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

export async function inviteFirmMember(firmId: string, email: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const canManage = await canManageOrganization(firmId)
    if (!canManage) throw new Error('Insufficient permissions to invite firm members')

    const firm = await prisma.firm.findUnique({
        where: { id: firmId },
        select: { sandboxOnly: true }
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
    let existingUserWithEmail: string | null = null
    for (const m of allMembers) {
        const uid = m.userId
        try {
            const { data: { user: u } } = await supabaseAdmin.auth.admin.getUserById(uid)
            if (u?.email?.toLowerCase() === normalizedEmail) {
                existingUserWithEmail = uid
                break
            }
        } catch {
            // skip
        }
    }
    if (existingUserWithEmail) {
        throw new Error('A member with this email is already in the firm')
    }

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    const existing = await prisma.firmInvitation.findUnique({
        where: { firmId_email: { firmId, email: normalizedEmail } }
    })

    if (existing) {
        if (existing.status === InvitationStatus.JOINED) {
            throw new Error('This user has already joined the firm')
        }
        await prisma.firmInvitation.update({
            where: { id: existing.id },
            data: { status: 'PENDING', token, expireAt, updatedBy: user.id }
        })
    } else {
        await prisma.firmInvitation.create({
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
    }

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    await sendEmail(
        normalizedEmail,
        `You've been invited to join a firm on ${BRAND_NAME}`,
        `<p>You have been invited to join a firm on ${BRAND_NAME} as a Firm Administrator.</p>
         <p>Click here to accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`
    )

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
        include: { firm: { select: { sandboxOnly: true } } }
    })
    if (!invite) throw new Error('Invitation not found')
    if (invite.status === InvitationStatus.JOINED) throw new Error('User has already joined')

    const canManage = await canManageOrganization(invite.firmId)
    if (!canManage) throw new Error('Insufficient permissions')

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    await prisma.firmInvitation.update({
        where: { id: invitationId },
        data: { token, status: 'PENDING', expireAt, updatedAt: new Date() }
    })

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    await sendEmail(
        invite.email,
        `You've been invited to join a firm on ${BRAND_NAME}`,
        `<p>You have been invited to join a firm on ${BRAND_NAME}.</p>
         <p>Click here to accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`
    )
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
    revalidatePath('/d/f/[slug]')
}
