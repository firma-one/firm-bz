import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isSysAdminUser } from '@/lib/system/user-data-map'
import { endAllSessions } from '@/lib/auth/sessions'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/system/sessions
 *
 * /system → Sessions → "Sign out everyone": ends every sign-in on the platform except the admin's
 * own, so they can watch what happens. For a release that needs everyone to sign in again, or a
 * suspected leak. It takes effect at once — nobody can renew their login — with no env var or
 * redeploy. Returns how many sessions ended.
 */
export async function DELETE() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isSysAdminUser(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
        const ended = await endAllSessions({ exceptUserId: user.id })
        return NextResponse.json({ ended })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Couldn't end sessions" },
            { status: 500 },
        )
    }
}
