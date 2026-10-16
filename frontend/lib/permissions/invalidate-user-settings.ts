import 'server-only'

import { userSettingsPlus } from '@/lib/user-settings-plus'

/*
 * Permission-cache invalidation for explicit user ids, called after membership and settings
 * mutations. Server-only: as server actions (they used to live in lib/actions/user-settings.ts) any
 * signed-in user could have flushed other users' permission caches at will.
 */

/**
 * Invalidate UserSettingsPlus cache
 * Call after permission/settings mutations
 */
export async function invalidateUserSettingsPlus(userId: string): Promise<void> {
  userSettingsPlus.invalidateUser(userId)
}

/**
 * Invalidate UserSettingsPlus cache for multiple users
 */
export async function invalidateUsersSettingsPlus(userIds: string[]): Promise<void> {
  userSettingsPlus.invalidateUsers(userIds)
}
