import 'server-only'

import { createClient } from '@/utils/supabase/server'
import { isSystemAdminEmail } from '@/lib/system/admin-check'

/**
 * Throws unless the signed-in user is a system admin (SYSTEM_ADMIN_EMAILS). For server actions behind
 * /system: the /system layout only checks this in the browser, and a server action runs before any
 * page renders, so each admin action must check for itself.
 */
export async function requireSystemAdmin(): Promise<{ userId: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !isSystemAdminEmail(user.email)) throw new Error('Unauthorized')
    return { userId: user.id }
}
