'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { logger } from '@/lib/logger'
import { findAuthUserIdByEmail } from '@/lib/actions/auth-user-lookup'

/**
 * Pre-provisions a Supabase auth account for an invitee if one doesn't exist.
 * Sets email_confirm: true so the user is routed to sign-in (OTP) rather than sign-up,
 * preserving the ?next= redirect through the auth flow.
 */
export async function maybeProvisionInviteeAccount(email: string): Promise<void> {
    const existingId = await findAuthUserIdByEmail(email)
    if (existingId) return

    const adminClient = createAdminClient()
    const { error } = await adminClient.auth.admin.createUser({
        email: email.toLowerCase(),
        email_confirm: true,
    })
    if (error) {
        logger.error('Failed to pre-provision invitee account', new Error(error.message), 'Invitations', { email })
    }
}
