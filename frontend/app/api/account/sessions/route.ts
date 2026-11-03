import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { endUserSessions } from '@/lib/auth/sessions'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/account/sessions
 *
 * "Sign out of all devices": ends every sign-in the caller has, this browser's included. The
 * browser then drops its own copy (auth-context's signOutEverywhere). Only ever the caller's own
 * sessions — the user comes from their sign-in, never from the request.
 */
export async function DELETE() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const ended = await endUserSessions(user.id)
        return NextResponse.json({ ended })
    } catch {
        return NextResponse.json({ error: "Couldn't sign out of other devices" }, { status: 500 })
    }
}
