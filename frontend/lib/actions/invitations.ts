'use server'

import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"
import { upsertFollowUpReminder, removeRemindersByEntity } from '@/lib/actions/user-reminders'
import { sendEmail } from '@/lib/email'
import { logger } from '@/lib/logger'
import { BRAND_NAME } from '@/config/brand'
import { renderInviteEmail } from '@/lib/email-templates/invite'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { createAdminClient } from '@/utils/supabase/admin'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { maybeProvisionInviteeAccount } from '@/lib/actions/account-provisioning'
import { findAuthUserIdByEmail } from '@/lib/actions/auth-user-lookup'
import { joinEngagementForUser, provisionAndNotifyExistingUser } from '@/lib/actions/engagement-membership'
import { InvitationStatus } from '@prisma/client'
import { engagementPath, clientPath, firmPath } from '@/lib/navigation/firm-paths'

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
        select: { slug: true, name: true, client: { select: { slug: true, name: true, firm: { select: { id: true, slug: true, name: true, sandboxOnly: true, group: { select: { slug: true } } } } } } },
    })
    if (!projectOrg) throw new Error("Engagement not found")
    if (projectOrg.client?.firm?.sandboxOnly) {
        throw new Error('Inviting members is restricted for Sandbox Organizations. Upgrade to invite teammates.')
    }
    const invReminderCtx = {
        firmId: projectOrg?.client?.firm?.id ?? '',
        ctaUrl: projectOrg?.client?.firm?.slug && projectOrg?.client?.slug && projectOrg?.slug
            ? engagementPath(projectOrg.client.firm.group.slug, projectOrg.client.firm.slug, projectOrg.client.slug, projectOrg.slug, { tab: 'members' })
            : null,
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Detect up front whether this email already belongs to a registered user.
    const existingAuthUserId = await findAuthUserIdByEmail(normalizedEmail)

    // 1. Check if invitation exists (V2)
    const existing = await prisma.engagementInvitation.findUnique({
        where: { engagementId_email: { engagementId: projectId, email: normalizedEmail } },
    })

    const token = crypto.randomUUID()
    const expireAt = new Date()
    expireAt.setDate(expireAt.getDate() + 7)

    if (existing) {
        if (existing.status === InvitationStatus.JOINED) {
            throw new Error("User has already joined the engagement")
        }
        if (existing.status === InvitationStatus.ACCEPTED) {
            throw new Error("User is currently accepting this invitation — please wait")
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

        if (existingAuthUserId) {
            const inviteWithRelations = await prisma.engagementInvitation.findUniqueOrThrow({
                where: { id: existing.id },
                include: { persona: true, engagement: { include: { client: { include: { firm: { include: { group: { select: { slug: true } } } } } } } } }
            })
            return await provisionAndNotifyExistingUser(existingAuthUserId, normalizedEmail, inviteWithRelations, projectOrg)
        }

        await maybeProvisionInviteeAccount(normalizedEmail)

        const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
        try {
            const { subject, html } = renderInviteEmail({
                firmName: projectOrg?.client?.firm?.name ?? BRAND_NAME,
                engagementName: projectOrg?.name,
                clientName: projectOrg?.client?.name,
                inviteUrl,
            })
            await sendEmail(normalizedEmail, subject, html)
        } catch (err) {
            logger.error('Invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: normalizedEmail })
            await prisma.engagementInvitation.update({
                where: { id: existing.id },
                data: { status: InvitationStatus.ERROR, updatedAt: new Date() }
            })
        }

        upsertFollowUpReminder({
            userId: user.id,
            entityKey: 'platform.engagement_invitations.id',
            entityValue: existing.id,
            action: 'Invitation expiring',
            dateKey: 'platform.engagement_invitations.expireAt',
            dateValue: expireAt.toISOString(),
            entityName: normalizedEmail,
            firmId: invReminderCtx.firmId,
            ctaUrl: invReminderCtx.ctaUrl,
        }).catch(() => {})

        return existing
    }

    // 2. Create new invite (V2)
    const invite = await prisma.engagementInvitation.create({
        data: {
            engagementId: projectId,
            email: normalizedEmail,
            personaId,
            token,
            status: InvitationStatus.PENDING,
            expireAt,
            createdBy: user.id,
        }
    })

    if (existingAuthUserId) {
        const inviteWithRelations = await prisma.engagementInvitation.findUniqueOrThrow({
            where: { id: invite.id },
            include: { persona: true, engagement: { include: { client: { include: { firm: { include: { group: { select: { slug: true } } } } } } } } }
        })
        return await provisionAndNotifyExistingUser(existingAuthUserId, normalizedEmail, inviteWithRelations, projectOrg)
    }

    await maybeProvisionInviteeAccount(normalizedEmail)

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
    try {
        const { subject, html } = renderInviteEmail({
            firmName: projectOrg?.client?.firm?.name ?? BRAND_NAME,
            engagementName: projectOrg?.name,
            clientName: projectOrg?.client?.name,
            inviteUrl,
        })
        await sendEmail(normalizedEmail, subject, html)
    } catch (err) {
        logger.error('Invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: normalizedEmail })
        await prisma.engagementInvitation.update({
            where: { id: invite.id },
            data: { status: InvitationStatus.ERROR, updatedAt: new Date() }
        })
    }

    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.engagement_invitations.id',
        entityValue: invite.id,
        action: 'Invitation expiring',
        dateKey: 'platform.engagement_invitations.expireAt',
        dateValue: expireAt.toISOString(),
        entityName: normalizedEmail,
        firmId: invReminderCtx.firmId,
        ctaUrl: invReminderCtx.ctaUrl,
    }).catch(() => {})

    return invite
}

/**
 * Resend invitation (V2)
 */
export async function resendInvitation(invitationId: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

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
    const engDetails = await prisma.engagement.findFirst({
        where: { id: invite.engagementId },
        select: { slug: true, name: true, client: { select: { slug: true, name: true, firm: { select: { id: true, slug: true, name: true, group: { select: { slug: true } } } } } } },
    })
    try {
        const { subject, html } = renderInviteEmail({
            firmName: engDetails?.client?.firm?.name ?? BRAND_NAME,
            engagementName: engDetails?.name,
            clientName: engDetails?.client?.name,
            inviteUrl,
        })
        await sendEmail(invite.email, subject, html)
    } catch (err) {
        logger.error('Resend invitation email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: invite.email })
        await prisma.engagementInvitation.update({
            where: { id: invitationId },
            data: { status: InvitationStatus.ERROR, updatedAt: new Date() }
        })
    }
    upsertFollowUpReminder({
        userId: user.id,
        entityKey: 'platform.engagement_invitations.id',
        entityValue: invitationId,
        action: 'Invitation expiring',
        dateKey: 'platform.engagement_invitations.expireAt',
        dateValue: expireAt.toISOString(),
        entityName: invite.email,
        firmId: engDetails?.client?.firm?.id ?? '',
        ctaUrl: engDetails?.client?.firm?.slug && engDetails?.client?.slug && engDetails?.slug
            ? engagementPath(engDetails.client.firm.group.slug, engDetails.client.firm.slug, engDetails.client.slug, engDetails.slug, { tab: 'members' })
            : null,
    }).catch(() => {})

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
        include: { firm: { include: { group: { select: { slug: true } } } }, persona: true }
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
            ...(firmInvite.status === 'JOINED' && { redirectUrl: firmPath(firmInvite.firm.group.slug, firmInvite.firm.slug) })
        }
    }

    const clientInvite = await prisma.clientInvitation.findUnique({
        where: { token },
        include: { client: { include: { firm: { include: { group: { select: { slug: true } } } } } }, persona: true }
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
            ...(clientInvite.status === 'JOINED' && { redirectUrl: clientPath(clientInvite.client.firm.group.slug, clientInvite.client.firm.slug, clientInvite.client.slug) })
        }
    }

    const engageInvite = await prisma.engagementInvitation.findUnique({
        where: { token },
        include: {
            persona: true,
            engagement: {
                include: {
                    client: { include: { firm: { include: { group: { select: { slug: true } } } } } }
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
        const groupSlug = engageInvite.engagement.client.firm.group.slug
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
            ...(status === 'JOINED' && { redirectUrl: engagementPath(groupSlug, firmSlug, clientSlug, projectSlug, { tab: 'files' }) })
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
            include: { firm: { include: { group: { select: { slug: true } } } } }
        })
        if (!invite) throw new Error("Invalid invitation")
        if (invite.status === 'JOINED') {
            return { success: true, redirectUrl: firmPath(invite.firm.group.slug, invite.firm.slug) }
        }
        if (invite.expireAt && new Date() > invite.expireAt) throw new Error("Invitation expired")
        if (!user.email) throw new Error("Cannot verify email: your account has no email address")
        if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
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
        if (invite.createdBy) {
            await removeRemindersByEntity(invite.createdBy, 'platform.firm_invitations', invite.id).catch(() => {})
        }
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
        return { success: true, redirectUrl: firmPath(invite.firm.group.slug, invite.firm.slug) }
    }

    if (kind === 'client') {
        const invite = await prisma.clientInvitation.findUnique({
            where: { token },
            include: { client: { include: { firm: { include: { group: { select: { slug: true } } } } } } }
        })
        if (!invite) throw new Error("Invalid invitation")
        if (invite.status === 'JOINED') {
            return { success: true, redirectUrl: clientPath(invite.client.firm.group.slug, invite.client.firm.slug, invite.client.slug) }
        }
        if (invite.expireAt && new Date() > invite.expireAt) throw new Error("Invitation expired")
        if (!user.email) throw new Error("Cannot verify email: your account has no email address")
        if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
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
        if (invite.createdBy) {
            await removeRemindersByEntity(invite.createdBy, 'platform.client_invitations.id', invite.id).catch(() => {})
        }
        return { success: true, redirectUrl: clientPath(invite.client.firm.group.slug, invite.client.firm.slug, invite.client.slug) }
    }

    // Engagement (project) invite — use Engagement/Firm schema
    const invite = await prisma.engagementInvitation.findUnique({
        where: { token },
        include: {
            persona: true,
            engagement: {
                include: {
                    client: { include: { firm: { include: { group: { select: { slug: true } } } } } }
                }
            }
        }
    })

    if (!invite) throw new Error("Invalid invitation")

    if (invite.status === 'JOINED') {
        return {
            success: true,
            redirectUrl: engagementPath(
                invite.engagement.client.firm.group.slug,
                invite.engagement.client.firm.slug,
                invite.engagement.client.slug,
                invite.engagement.slug,
                { tab: 'files' }
            )
        }
    }

    if (invite.expireAt && new Date() > invite.expireAt) throw new Error("Invitation expired")

    if (!user.email) throw new Error("Cannot verify email: your account has no email address")
    if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new Error(`This invitation is for ${invite.email}`)
    }

    const { redirectUrl } = await joinEngagementForUser(user.id, user.email, invite)

    return { success: true, redirectUrl }
}

/**
 * Pre-provision an auth.user record for an invitee who doesn't have an account yet.
 * This ensures the invitee is routed to sign-in (OTP) rather than sign-up when they
 * click the invite link, so the `next=/invite/{token}` redirect is preserved end-to-end.
 * Safe to call when the user already exists — it's a no-op in that case.
 */
