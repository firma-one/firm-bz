'use server'

import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { BRAND_NAME } from '@/config/brand'
import { safeInngestSend } from '@/lib/inngest/client'
import { grantEngagementDriveFolderAccess } from '@/lib/grant-engagement-drive-folder-access'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { createAdminClient } from '@/utils/supabase/admin'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { InvitationStatus } from '@prisma/client'

/**
 * Invite a member to a project (V2)
 */
export async function inviteMember(projectId: string, email: string, personaId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Sandbox restriction: disallow invites for sandbox orgs
    const projectOrg = await prisma.engagement.findFirst({
        where: { id: projectId, isDeleted: false },
        select: { client: { select: { firm: { select: { sandboxOnly: true } } } } },
    })
    if (projectOrg?.client?.firm?.sandboxOnly) {
        throw new Error('Inviting members is restricted for Sandbox Organizations. Upgrade to invite teammates.')
    }

    // 1. Check if invitation exists (V2)
    const existing = await prisma.engagementInvitation.findUnique({
        where: { engagementId_email: { engagementId: projectId, email } },
    })

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    if (existing) {
        if (existing.status === InvitationStatus.JOINED) {
            throw new Error("User has already joined the project")
        }

        await prisma.engagementInvitation.update({
            where: { id: existing.id },
            data: {
                personaId,
                status: InvitationStatus.PENDING,
                token,
                expireAt,
                updatedAt: new Date()
            }
        })

        const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
        await sendEmail(
            email,
            `You've been invited to join a project on ${BRAND_NAME}`,
            `<p>You have been invited to join a project on ${BRAND_NAME}.</p>
             <p>Click here to accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`
        )

        return existing
    }

    // 2. Create new invite (V2)
    const invite = await prisma.engagementInvitation.create({
        data: {
            engagementId: projectId,
            email,
            personaId,
            token,
            status: InvitationStatus.PENDING,
            expireAt
        }
    })

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    await sendEmail(
        email,
        `You've been invited to join a project on ${BRAND_NAME}`,
        `<p>You have been invited to join a project on ${BRAND_NAME}.</p>
         <p>Click here to accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`
    )

    return invite
}

/**
 * Resend invitation (V2)
 */
export async function resendInvitation(invitationId: string) {
    const invite = await prisma.engagementInvitation.findUnique({ where: { id: invitationId } })
    if (!invite) throw new Error("Invitation not found")
    if (invite.status === InvitationStatus.JOINED) throw new Error("User has already joined")

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    const updated = await prisma.engagementInvitation.update({
        where: { id: invitationId },
        data: { token, updatedAt: new Date(), status: InvitationStatus.PENDING, expireAt }
    })

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    await sendEmail(
        invite.email,
        `You've been invited to join a project on ${BRAND_NAME}`,
        `<p>You have been invited to join a project on ${BRAND_NAME}.</p>
         <p>Click here to accept: <a href="${inviteUrl}">${inviteUrl}</a></p>`
    )

    return updated
}

/** Discriminated invite payload for landing page (firm, client, or engagement). redirectUrl set when status is JOINED. */
export type VerifyInvitationResult =
    | { type: 'firm'; id: string; token: string; email: string; status: string; firm: { name: string; slug: string }; redirectUrl?: string }
    | { type: 'client'; id: string; token: string; email: string; status: string; client: { name: string; slug: string }; firm: { name: string; slug: string }; redirectUrl?: string }
    | {
          type: 'engagement'
          id: string
          token: string
          email: string
          status: string
          project: { name: string }
          persona: { role: { displayLabel: string }; organization: { name: string } }
          redirectUrl?: string
      }

/**
 * Verify invitation token (V2) — resolves firm, client, or engagement invite.
 */
export async function verifyInvitation(token: string): Promise<VerifyInvitationResult> {
    if (!token || token.trim().length === 0) throw new Error("Invalid token")

    const now = new Date()

    const firmInvite = await prisma.firmInvitation.findUnique({
        where: { token },
        include: { firm: true, persona: true }
    })
    if (firmInvite) {
        if (firmInvite.expireAt && now > firmInvite.expireAt) {
            if (firmInvite.status !== 'EXPIRED') {
                await prisma.firmInvitation.update({ where: { id: firmInvite.id }, data: { status: 'EXPIRED' } })
            }
            throw new Error("Invitation expired")
        }
        if (firmInvite.status === 'EXPIRED') throw new Error("Invitation expired")
        return {
            type: 'firm',
            id: firmInvite.id,
            token: firmInvite.token,
            email: firmInvite.email,
            status: firmInvite.status,
            firm: { name: firmInvite.firm.name, slug: firmInvite.firm.slug },
            ...(firmInvite.status === 'JOINED' && { redirectUrl: `/d/f/${firmInvite.firm.slug}` })
        }
    }

    const clientInvite = await prisma.clientInvitation.findUnique({
        where: { token },
        include: { client: { include: { firm: true } }, persona: true }
    })
    if (clientInvite) {
        if (clientInvite.expireAt && now > clientInvite.expireAt) {
            if (clientInvite.status !== 'EXPIRED') {
                await prisma.clientInvitation.update({ where: { id: clientInvite.id }, data: { status: 'EXPIRED' } })
            }
            throw new Error("Invitation expired")
        }
        if (clientInvite.status === 'EXPIRED') throw new Error("Invitation expired")
        return {
            type: 'client',
            id: clientInvite.id,
            token: clientInvite.token,
            email: clientInvite.email,
            status: clientInvite.status,
            client: { name: clientInvite.client.name, slug: clientInvite.client.slug },
            firm: { name: clientInvite.client.firm.name, slug: clientInvite.client.firm.slug },
            ...(clientInvite.status === 'JOINED' && { redirectUrl: `/d/f/${clientInvite.client.firm.slug}/c/${clientInvite.client.slug}` })
        }
    }

    const engageInvite = await prisma.engagementInvitation.findUnique({
        where: { token },
        include: {
            persona: true,
            engagement: {
                include: {
                    client: { include: { firm: true } }
                }
            }
        }
    })
    if (engageInvite) {
        if (engageInvite.expireAt && now > engageInvite.expireAt) {
            if (engageInvite.status !== 'EXPIRED') {
                await prisma.engagementInvitation.update({ where: { id: engageInvite.id }, data: { status: 'EXPIRED' } })
            }
            throw new Error("Invitation expired")
        }
        if (engageInvite.status === 'EXPIRED') throw new Error("Invitation expired")
        if (engageInvite.status === 'PENDING') {
            await prisma.engagementInvitation.update({
                where: { id: engageInvite.id },
                data: { status: 'ACCEPTED', acceptedAt: now }
            })
        }
        const firmSlug = engageInvite.engagement.client.firm.slug
        const clientSlug = engageInvite.engagement.client.slug
        const projectSlug = engageInvite.engagement.slug
        const status = engageInvite.status === 'PENDING' ? 'ACCEPTED' : engageInvite.status
        return {
            type: 'engagement',
            id: engageInvite.id,
            token: engageInvite.token,
            email: engageInvite.email,
            status,
            project: { name: engageInvite.engagement.name },
            persona: {
                role: { displayLabel: engageInvite.persona.displayName },
                organization: { name: engageInvite.engagement.client.firm.name }
            },
            ...(status === 'JOINED' && { redirectUrl: `/d/f/${firmSlug}/c/${clientSlug}/e/${projectSlug}/files` })
        }
    }

    throw new Error("Invalid token")
}

export async function acceptInvitationAction(token: string) {
    try {
        return await acceptInvitation(token)
    } catch (e: unknown) {
        logger.error("Accept Invitation Action Error (V2)", e as Error)
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' }
    }
}

/** Resolve token to invite type and record (read-only). */
async function resolveInviteByToken(token: string): Promise<'firm' | 'client' | 'engagement'> {
    const [firm, client, engagement] = await Promise.all([
        prisma.firmInvitation.findUnique({ where: { token }, select: { id: true } }),
        prisma.clientInvitation.findUnique({ where: { token }, select: { id: true } }),
        prisma.engagementInvitation.findUnique({ where: { token }, select: { id: true } })
    ])
    if (firm) return 'firm'
    if (client) return 'client'
    if (engagement) return 'engagement'
    throw new Error("Invalid invitation")
}

/**
 * Accept invitation and join firm, client, or project (V2).
 */
export async function acceptInvitation(token: string): Promise<{ success: true; redirectUrl: string } | { success: false; error: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Must be logged in")

    const kind = await resolveInviteByToken(token)

    if (kind === 'firm') {
        const invite = await prisma.firmInvitation.findUnique({
            where: { token },
            include: { firm: true }
        })
        if (!invite) throw new Error("Invalid invitation")
        if (invite.status === 'JOINED') {
            return { success: true, redirectUrl: `/d/f/${invite.firm.slug}` }
        }
        if (invite.expireAt && new Date() > invite.expireAt) throw new Error("Invitation expired")
        if (user.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
            throw new Error(`This invitation is for ${invite.email}`)
        }
        const existing = await prisma.firmMember.findFirst({
            where: { firmId: invite.firmId, userId: user.id }
        })
        let hadDefaultFirm = true
        if (!existing) {
            const defaultMember = await prisma.firmMember.findFirst({
                where: { userId: user.id, isDefault: true },
                select: { id: true }
            })
            hadDefaultFirm = !!defaultMember
            await prisma.$transaction(async (tx) => {
                await tx.firmMember.create({
                    data: {
                        firmId: invite.firmId,
                        userId: user.id,
                        role: 'firm_admin',
                        isDefault: !hadDefaultFirm,
                        createdBy: user.id,
                        updatedBy: user.id,
                    }
                })
                await tx.firmInvitation.update({
                    where: { id: invite.id },
                    data: { status: 'JOINED', joinedAt: new Date(), updatedBy: user.id }
                })
            })
        } else {
            await prisma.firmInvitation.update({
                where: { id: invite.id },
                data: { status: 'JOINED', joinedAt: new Date(), updatedBy: user.id }
            })
        }
        await invalidateUserSettingsPlus(user.id)
        if (!existing && !hadDefaultFirm) {
            try {
                const adminClient = createAdminClient()
                await adminClient.auth.admin.updateUserById(user.id, {
                    app_metadata: mergeLeanAppMetadata(user.app_metadata as Record<string, unknown>, {
                        active_firm_id: invite.firmId,
                        active_persona: 'firm_admin',
                    }),
                })
            } catch (e) {
                logger.error('Failed to update JWT after firm invite accept', e as Error)
            }
        }
        return { success: true, redirectUrl: `/d/f/${invite.firm.slug}` }
    }

    if (kind === 'client') {
        const invite = await prisma.clientInvitation.findUnique({
            where: { token },
            include: { client: { include: { firm: true } } }
        })
        if (!invite) throw new Error("Invalid invitation")
        if (invite.status === 'JOINED') {
            return { success: true, redirectUrl: `/d/f/${invite.client.firm.slug}/c/${invite.client.slug}` }
        }
        if (invite.expireAt && new Date() > invite.expireAt) throw new Error("Invitation expired")
        if (user.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
            throw new Error(`This invitation is for ${invite.email}`)
        }
        const existing = await prisma.clientMember.findFirst({
            where: { clientId: invite.clientId, userId: user.id }
        })
        if (!existing) {
            await prisma.$transaction(async (tx) => {
                await tx.clientMember.create({
                    data: {
                        clientId: invite.clientId,
                        userId: user.id,
                        personaId: invite.personaId,
                        createdBy: user.id,
                        updatedBy: user.id,
                    }
                })
                await tx.clientInvitation.update({
                    where: { id: invite.id },
                    data: { status: 'JOINED', joinedAt: new Date(), updatedBy: user.id }
                })
            })
        } else {
            await prisma.clientInvitation.update({
                where: { id: invite.id },
                data: { status: 'JOINED', joinedAt: new Date(), updatedBy: user.id }
            })
        }
        await invalidateUserSettingsPlus(user.id)
        return { success: true, redirectUrl: `/d/f/${invite.client.firm.slug}/c/${invite.client.slug}` }
    }

    // Engagement (project) invite — use Engagement/Firm schema
    const invite = await prisma.engagementInvitation.findUnique({
        where: { token },
        include: {
            persona: true,
            engagement: {
                include: {
                    client: { include: { firm: true } }
                }
            }
        }
    })

    if (!invite) throw new Error("Invalid invitation")

    if (invite.status === 'JOINED') {
        return {
            success: true,
            redirectUrl: `/d/f/${invite.engagement.client.firm.slug}/c/${invite.engagement.client.slug}/e/${invite.engagement.slug}/files`
        }
    }

    if (invite.expireAt && new Date() > invite.expireAt) throw new Error("Invitation expired")

    if (user.email && invite.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error(`This invitation is for ${invite.email}`)
    }

    const firmId = invite.engagement.client.firmId
    const clientId = invite.engagement.clientId
    let newFirmMemberCreated = false
    let newFirmIsDefault = false

    await prisma.$transaction(async (tx) => {
        const projectRole = invite.persona.slug as 'eng_admin' | 'eng_member' | 'eng_ext_collaborator' | 'eng_viewer'
        await tx.engagementMember.create({
            data: {
                engagementId: invite.engagementId,
                userId: user.id,
                role: projectRole,
                createdBy: user.id,
                updatedBy: user.id,
            }
        })

        const existingClientMember = await tx.clientMember.findFirst({
            where: { clientId, userId: user.id }
        })
        if (!existingClientMember) {
            await tx.clientMember.create({
                data: { clientId, userId: user.id, personaId: invite.personaId, createdBy: user.id, updatedBy: user.id }
            })
        }

        const firmMember = await tx.firmMember.findFirst({
            where: { firmId, userId: user.id }
        })
        if (!firmMember) {
            const hasDefault = await tx.firmMember.findFirst({
                where: { userId: user.id, isDefault: true },
                select: { id: true }
            })
            newFirmIsDefault = !hasDefault
            await tx.firmMember.create({
                data: {
                    firmId,
                    userId: user.id,
                    role: 'firm_member',
                    isDefault: newFirmIsDefault,
                    createdBy: user.id,
                    updatedBy: user.id,
                }
            })
            newFirmMemberCreated = true
        }

        await tx.engagementInvitation.update({
            where: { id: invite.id },
            data: { status: 'JOINED', joinedAt: new Date(), updatedBy: user.id }
        })
    })

    await invalidateUserSettingsPlus(user.id)

    if (newFirmMemberCreated && newFirmIsDefault) {
        try {
            const adminClient = createAdminClient()
            await adminClient.auth.admin.updateUserById(user.id, {
                app_metadata: mergeLeanAppMetadata(user.app_metadata as Record<string, unknown>, {
                    active_firm_id: firmId,
                    active_persona: 'firm_member',
                }),
            })
            logger.info('JWT app_metadata updated after invitation acceptance', { userId: user.id, firmId })
        } catch (jwtError) {
            logger.error('Failed to update JWT app_metadata after invitation acceptance', jwtError as Error)
        }
    }

    if (user.email && invite.engagement.connectorRootFolderId) {
        try {
            const firm = invite.engagement.client.firm as { connectorId?: string | null }
            const connectorId = firm?.connectorId
            if (connectorId) {
                await grantEngagementDriveFolderAccess({
                    connectorId,
                    engagementSlug: invite.engagement.slug,
                    email: user.email,
                    role: invite.persona.slug as 'eng_admin' | 'eng_member' | 'eng_ext_collaborator' | 'eng_viewer',
                    projectName: invite.engagement.name,
                    clientSlug: invite.engagement.client.slug,
                    clientName: invite.engagement.client.name,
                    projectFolderId: invite.engagement.connectorRootFolderId,
                })
            }
        } catch (error) {
            logger.error('Error granting Drive folder access (V2)', error as Error)
        }
    }

    await safeInngestSend('project.member.added', {
        projectId: invite.engagementId,
        organizationId: firmId,
        memberId: invite.id,
        userId: user.id,
        email: user.email || '',
        personaSlug: invite.persona.slug,
        timestamp: new Date().toISOString()
    })

    return {
        success: true,
        redirectUrl: `/d/f/${invite.engagement.client.firm.slug}/c/${invite.engagement.client.slug}/e/${invite.engagement.slug}/files`
    }
}
