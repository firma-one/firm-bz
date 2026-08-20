'use server'

import { prisma } from "@/lib/prisma"
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/email'
import { BRAND_NAME } from '@/config/brand'
import { renderAddedToEngagementEmail } from '@/lib/email-templates/added-to-engagement'
import { safeInngestSend } from '@/lib/inngest/client'
import { grantEngagementDriveFolderAccess } from '@/lib/grant-engagement-drive-folder-access'
import { invalidateUserSettingsPlus } from '@/lib/actions/user-settings'
import { removeRemindersByEntity } from '@/lib/actions/user-reminders'
import { createAdminClient } from '@/utils/supabase/admin'
import { mergeLeanAppMetadata } from '@/lib/auth/supabase-jwt-metadata'
import { getPermissionAdapter } from '@/lib/connectors/registry'
import { resolveEngagementConnectorId } from '@/lib/connectors/resolve-client-connector'
import { Prisma } from '@prisma/client'

type EngagementInvitationWithRelations = Prisma.EngagementInvitationGetPayload<{
    include: {
        persona: true
        engagement: {
            include: {
                client: { include: { firm: true } }
            }
        }
    }
}>

/**
 * Create EngagementMember/ClientMember/FirmMember rows (if missing) for a user joining an
 * engagement invite, mark the invitation JOINED, and run the associated side effects
 * (JWT update on first firm join, Drive folder grant, cache invalidation, Inngest event).
 * Idempotent — safe to call again for a user who already holds these memberships.
 */
export async function joinEngagementForUser(
    userId: string,
    userEmail: string | undefined | null,
    invite: EngagementInvitationWithRelations
): Promise<{ redirectUrl: string; newEngagementMemberCreated: boolean }> {
    const firmId = invite.engagement.client.firmId
    const clientId = invite.engagement.clientId
    let newFirmMemberCreated = false
    let newFirmIsDefault = false
    let newEngagementMemberCreated = false

    await prisma.$transaction(async (tx) => {
        const projectRole = invite.persona.slug as 'eng_admin' | 'eng_member' | 'eng_ext_collaborator' | 'eng_viewer'
        const existingEngMember = await tx.engagementMember.findFirst({
            where: { engagementId: invite.engagementId, userId }
        })
        if (!existingEngMember) {
            newEngagementMemberCreated = true
            await tx.engagementMember.create({
                data: {
                    engagementId: invite.engagementId,
                    userId,
                    role: projectRole,
                    createdBy: userId,
                    updatedBy: userId,
                }
            })
        }

        const existingClientMember = await tx.clientMember.findFirst({
            where: { clientId, userId }
        })
        if (!existingClientMember) {
            await tx.clientMember.create({
                data: { clientId, userId, personaId: invite.personaId, createdBy: userId, updatedBy: userId }
            })
        }

        const firmMember = await tx.firmMember.findFirst({
            where: { firmId, userId }
        })
        if (!firmMember) {
            const hasDefault = await tx.firmMember.findFirst({
                where: { userId, isDefault: true },
                select: { id: true }
            })
            newFirmIsDefault = !hasDefault
            await tx.firmMember.create({
                data: {
                    firmId,
                    userId,
                    role: 'firm_member',
                    isDefault: newFirmIsDefault,
                    createdBy: userId,
                    updatedBy: userId,
                }
            })
            newFirmMemberCreated = true
        }

        await tx.engagementInvitation.update({
            where: { id: invite.id },
            data: { status: 'JOINED', joinedAt: new Date(), updatedBy: userId }
        })
    })

    await invalidateUserSettingsPlus(userId)

    if (invite.createdBy) {
        await removeRemindersByEntity(invite.createdBy, 'platform.engagement_invitations.id', invite.id).catch(() => {})
    }

    if (newFirmMemberCreated && newFirmIsDefault) {
        try {
            const adminClient = createAdminClient()
            const { data: { user } } = await adminClient.auth.admin.getUserById(userId)
            await adminClient.auth.admin.updateUserById(userId, {
                app_metadata: mergeLeanAppMetadata((user?.app_metadata ?? {}) as Record<string, unknown>, {
                    active_firm_id: firmId,
                    active_persona: 'firm_member',
                }),
            })
            logger.info('JWT app_metadata updated after invitation acceptance', { userId, firmId })
        } catch (jwtError) {
            logger.error('Failed to update JWT app_metadata after invitation acceptance', jwtError as Error)
        }
    }

    // Resolve via the canonical client-first-then-firm-fallback chain, not a hand-rolled
    // firm.connectorId read — Client.connectorId is the authoritative, newer field (Firm.connectorId
    // is a legacy fallback for clients not yet backfilled). See resolve-client-connector.ts and
    // .claude/plans/connector-microsoft-impl.md, item 19.
    const resolvedConnectorId = await resolveEngagementConnectorId(invite.engagementId)

    if (userEmail && invite.engagement.connectorRootFolderId) {
        try {
            if (resolvedConnectorId) {
                await grantEngagementDriveFolderAccess({
                    connectorId: resolvedConnectorId,
                    engagementSlug: invite.engagement.slug,
                    email: userEmail,
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

    // Pre-create the Entra ID guest object at join-time (not first file-open) for
    // tenant-backed Microsoft connectors, so the OTP/consent onboarding friction is
    // already resolved by the time the member reaches Files. Only applies when the
    // connector's account is itself an Entra tenant member (SharePoint site drive, or
    // a work/school /me/drive) — a true personal Microsoft consumer account (MSA) has
    // no backing tenant, so preInviteGuest is skipped entirely for that case. See
    // .claude/plans/connector-microsoft-impl.md, item 19, Part 2.
    if (userEmail) {
        try {
            if (resolvedConnectorId) {
                const connector = await prisma.connector.findUnique({
                    where: { id: resolvedConnectorId },
                    select: { type: true, settings: true },
                })
                const settings = connector?.settings as Record<string, unknown> | null
                if (connector?.type === 'ONEDRIVE' && settings?.isPersonalAccount !== true) {
                    const adapter = await getPermissionAdapter(resolvedConnectorId)
                    if (adapter?.preInviteGuest) {
                        await adapter.preInviteGuest(resolvedConnectorId, userEmail)
                    }
                }
            }
        } catch (error) {
            logger.warn('[joinEngagementForUser] preInviteGuest failed', { userId, error: error instanceof Error ? error.message : String(error) })
        }
    }

    // Only fire if we actually created a new engagement membership (idempotent re-accepts skip this)
    if (newEngagementMemberCreated) {
        await safeInngestSend('project.member.added', {
            projectId: invite.engagementId,
            organizationId: firmId,
            memberId: invite.id,
            userId,
            email: userEmail || '',
            personaSlug: invite.persona.slug,
            timestamp: new Date().toISOString()
        })
    }

    return {
        redirectUrl: `/d/f/${invite.engagement.client.firm.slug}/c/${invite.engagement.client.slug}/e/${invite.engagement.slug}/files`,
        newEngagementMemberCreated,
    }
}

/**
 * Immediate-join path for an invitee who is already a registered user: creates the
 * membership rows synchronously, then sends a direct "added to engagement" email
 * instead of the accept-invite flow. Email failures are logged only — the membership
 * already exists regardless of whether the notification lands.
 */
export async function provisionAndNotifyExistingUser(
    existingUserId: string,
    normalizedEmail: string,
    invite: EngagementInvitationWithRelations,
    projectOrg: {
        slug: string
        name: string
        client: { slug: string; name: string; firm: { name: string; slug: string } }
    }
): Promise<{ redirectUrl: string; newEngagementMemberCreated: boolean }> {
    const result = await joinEngagementForUser(existingUserId, normalizedEmail, invite)

    const engagementUrl = `${process.env.NEXT_PUBLIC_APP_URL}${result.redirectUrl}`
    try {
        const { subject, html } = renderAddedToEngagementEmail({
            firmName: projectOrg.client.firm.name ?? BRAND_NAME,
            engagementName: projectOrg.name,
            clientName: projectOrg.client.name,
            engagementUrl,
        })
        await sendEmail(normalizedEmail, subject, html)
    } catch (err) {
        logger.error('Added-to-engagement email failed', err instanceof Error ? err : new Error(String(err)), 'Email', { to: normalizedEmail })
    }

    return result
}
