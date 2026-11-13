import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { endLinkedSessions, sessionIdOfAccessToken } from '@/lib/auth/sign-in-handoff'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/auth/linked-sessions
 *
 * Called by sign-out (lib/auth-context.tsx) just before it ends this browser's session. Ends the session a
 * sign-in hand-off linked to this one on the other host (www ↔ a workspace's custom domain), so signing out
 * on either signs out of both. Only the caller's own sessions, and only ones a hand-off linked.
 */
export async function DELETE() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ended: 0 })
    const { data: { session } } = await supabase.auth.getSession()
    const sessionId = sessionIdOfAccessToken(session?.access_token)
    if (!sessionId) return NextResponse.json({ ended: 0 })
    try {
        return NextResponse.json({ ended: await endLinkedSessions(user.id, sessionId) })
    } catch (e) {
        logger.error('Ending linked sessions failed', e instanceof Error ? e : new Error(String(e)), 'Auth')
        return NextResponse.json({ ended: 0 })
    }
}
