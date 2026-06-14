'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { profileCopy } from '@/lib/profile-copy'
import { prisma } from '@/lib/prisma'
import { resolveGroupId } from '@/lib/billing/billing-group'
import { updatePolarCustomerNameByExternalId } from '@/lib/billing/polar-customers'
import { logger } from '@/lib/logger'

const MAX_NAME_LEN = 80

export type UpdateProfileNamesResult = { ok: true } | { error: string }

export async function updateProfileNames(
    firstName: string,
    lastName: string
): Promise<UpdateProfileNamesResult> {
    const supabase = await createClient()
    const {
        data: { user },
        error: getUserError,
    } = await supabase.auth.getUser()

    if (getUserError || !user) {
        return { error: profileCopy.unauthorized }
    }

    const first = firstName.trim()
    const last = lastName.trim()

    if (!first && !last) {
        return { error: profileCopy.bothNamesEmpty }
    }

    if (first.length > MAX_NAME_LEN || last.length > MAX_NAME_LEN) {
        return { error: profileCopy.nameTooLong }
    }

    const fullName = `${first} ${last}`.trim()
    const existing = (user.user_metadata ?? {}) as Record<string, unknown>
    const existingFullName =
        (typeof existing.full_name === 'string' && existing.full_name.trim()) ||
        (typeof existing.name === 'string' && existing.name.trim()) ||
        ''

    const { error: updateError } = await supabase.auth.updateUser({
        data: {
            ...existing,
            first_name: first,
            last_name: last,
            full_name: fullName,
            name: fullName,
        },
    })

    if (updateError) {
        return { error: updateError.message || profileCopy.updateFailed }
    }

    if (fullName && fullName !== existingFullName) {
        try {
            const membership = await prisma.firmMember.findFirst({
                where: { userId: user.id, isDefault: true, firm: { deletedAt: null } },
                select: { firmId: true },
            })
            if (membership?.firmId) {
                const groupId = await resolveGroupId(membership.firmId)
                await updatePolarCustomerNameByExternalId({
                    externalId: groupId,
                    name: fullName,
                })
            }
        } catch (e) {
            logger.warn('[profile] Failed to sync updated name to Polar (best-effort)', {
                userId: user.id,
                message: e instanceof Error ? e.message : String(e),
            })
        }
    }

    revalidatePath('/d/u/profile')
    return { ok: true }
}
