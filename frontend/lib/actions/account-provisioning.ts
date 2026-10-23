import 'server-only'

/*
 * Creates a confirmed Supabase account for any email. Server-only rather than 'use server': as a
 * server action it was registered as a callable endpoint that could create accounts for arbitrary
 * addresses. Only invitation flows that have already authorized the inviter call it.
 *
 * Lives under lib/actions/ for history; it is not a server action.
 */

import { createAdminClient } from '@/utils/supabase/admin'
import { logger } from '@/lib/logger'
import { findAuthUserIdByEmail } from '@/lib/actions/auth-user-lookup'
import { inviteeNameMetadata, type InviteeName } from '@/lib/auth/invite-names'
import { needsName } from '@/lib/auth/display-name'

/**
 * Pre-provisions a Supabase auth account for an invitee if one doesn't exist.
 * Sets email_confirm: true so the user is routed to sign-in (OTP) rather than sign-up,
 * preserving the ?next= redirect through the auth flow.
 *
 * When the inviter supplied a name it is seeded onto the account here, so the invitee is rendered
 * properly from their first page load instead of as their email local part.
 */
export async function maybeProvisionInviteeAccount(email: string, invitee?: InviteeName | null): Promise<void> {
    const nameMetadata = inviteeNameMetadata(invitee)
    const existingId = await findAuthUserIdByEmail(email)
    if (existingId) {
        if (nameMetadata) await seedNameOnExistingAccount(existingId, nameMetadata)
        return
    }

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: true,
        ...(nameMetadata ? { user_metadata: nameMetadata } : {}),
    })
    if (error) {
        logger.error('Failed to pre-provision invitee account', new Error(error.message), 'Invitations', { email })
    }
}

/**
 * Seeds the inviter-supplied name onto an invitee's account as they accept.
 *
 * Invite-time provisioning already does this for accounts it creates; this covers the rest — an
 * invitee who signed in through OAuth before accepting, and invites that predate the name fields.
 */
export async function applyInvitedName(userId: string, invitee?: InviteeName | null): Promise<void> {
    const nameMetadata = inviteeNameMetadata(invitee)
    if (!nameMetadata) return
    await seedNameOnExistingAccount(userId, nameMetadata)
}

/**
 * Fills in the name of someone who already has an account but has never been named — an invitee
 * who signed up elsewhere first, or who was invited before the inviter knew their name.
 *
 * Deliberately only fills a gap: an account that already carries a name keeps it, because this
 * person may well have typed it themselves and an inviter's guess must not overwrite that.
 * Best-effort — a failure must not cost the invite.
 */
async function seedNameOnExistingAccount(userId: string, nameMetadata: Record<string, unknown>): Promise<void> {
    try {
        const adminClient = createAdminClient()
        const { data, error } = await adminClient.auth.admin.getUserById(userId)
        if (error || !data?.user) return

        const existing = (data.user.user_metadata ?? {}) as Record<string, unknown>
        if (!needsName(existing)) return

        await adminClient.auth.admin.updateUserById(userId, {
            user_metadata: { ...existing, ...nameMetadata },
        })
    } catch (e) {
        logger.warn('[invitations] Failed to seed invited name onto existing account (best-effort)', {
            userId,
            message: e instanceof Error ? e.message : String(e),
        })
    }
}
