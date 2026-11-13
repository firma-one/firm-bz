import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'
import { platformLink } from '@/lib/navigation/platform-link'
import { consumeHandoff, recordTargetSession, sessionIdOfAccessToken } from '@/lib/auth/sign-in-handoff'

export const dynamic = 'force-dynamic'

/**
 * GET /auth/handoff?t=<ticket> on a workspace's custom domain: the second half of the sign-in hand-off
 * (lib/auth/sign-in-handoff.ts). Uses the ticket once, verifies its one-time token here, which sets this
 * host's own session cookie, and opens the page. Any failure goes back to the main address, where the
 * person is still signed in, so a hand-off can never stop someone signing in.
 */
export async function GET(request: Request) {
    const url = new URL(request.url)
    const ticket = url.searchParams.get('t') ?? ''
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host

    const noReferrer = (res: NextResponse) => {
        res.headers.set('Referrer-Policy', 'no-referrer')
        res.headers.set('Cache-Control', 'no-store')
        return res
    }

    let nextPath = '/d?entry=auth'
    try {
        const used = await consumeHandoff(ticket, host)
        if (!used) {
            logger.warn('Sign-in hand-off ticket unusable', 'Auth', { host })
            return noReferrer(NextResponse.redirect(platformLink(nextPath)))
        }
        nextPath = used.nextPath
        const supabase = await createClient()
        const { data, error } = await supabase.auth.verifyOtp({ token_hash: used.tokenHash, type: 'magiclink' })
        if (error || !data.session || data.session.user.id !== used.userId) {
            logger.warn('Sign-in hand-off verify failed', 'Auth', { host, error: error?.message })
            return noReferrer(NextResponse.redirect(platformLink(nextPath)))
        }
        await recordTargetSession(used.id, sessionIdOfAccessToken(data.session.access_token))
        return noReferrer(NextResponse.redirect(new URL(nextPath, `https://${host}`)))
    } catch (e) {
        logger.error('Sign-in hand-off failed', e instanceof Error ? e : new Error(String(e)), 'Auth', { host })
        return noReferrer(NextResponse.redirect(platformLink(nextPath)))
    }
}
