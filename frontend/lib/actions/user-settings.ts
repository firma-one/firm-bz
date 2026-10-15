'use server'

import { createClient } from '@/utils/supabase/server'
import { userSettingsPlus } from '@/lib/user-settings-plus'
import { logger } from '@/lib/logger'

/**
 * Build UserSettingsPlus cache on login
 * Called from client-side auth flow
 */
export async function buildUserSettingsPlus(): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Build and cache UserSettingsPlus
    await userSettingsPlus.getUserSettingsPlus(user.id)
    
    logger.info('Built UserSettingsPlus cache on login', 'UserSettingsPlus', { userId: user.id })
    
    return { success: true }
  } catch (error) {
    logger.error('Failed to build UserSettingsPlus', error instanceof Error ? error : new Error(String(error)))
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  }
}

/**
 * Drop and rebuild the current user's UserSettingsPlus cache.
 * Used for self-healing a stale permission cache (e.g. an engagement 404ing
 * until sign-out/sign-in) — scoped to the caller, so it can't touch other users.
 */
export async function refreshMyUserSettingsPlus(): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return { success: false }

    userSettingsPlus.invalidateUser(user.id)
    await userSettingsPlus.getUserSettingsPlus(user.id)
    logger.info('Refreshed UserSettingsPlus cache on request', 'UserSettingsPlus', { userId: user.id })
    return { success: true }
  } catch (error) {
    logger.error('Failed to refresh UserSettingsPlus', error instanceof Error ? error : new Error(String(error)))
    return { success: false }
  }
}

// invalidateUserSettingsPlus / invalidateUsersSettingsPlus take arbitrary user ids, so they live in
// lib/permissions/invalidate-user-settings.ts (server-only) rather than here as client-callable actions.
