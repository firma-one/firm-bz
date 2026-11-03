import 'server-only'
import { basePrisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/*
 * Ending sign-ins from the server.
 *
 * Supabase keeps each sign-in as a row in auth.sessions; its refresh tokens hang off that row and
 * are deleted with it (ON DELETE CASCADE). With the row gone, no browser or device can renew its
 * login, for page loads and API calls alike. The access token already issued keeps working until it
 * expires (at most an hour), which grants nothing new: every request checks membership itself.
 *
 * Why not supabase.auth.admin.signOut: it takes the user's JWT, not a user id, so the server can't
 * use it for someone else — calls passing a user id failed silently and signed nobody out.
 *
 * When to use it: removal from a firm, "Sign out of all devices", and the /system "Sign out
 * everyone" switch. Not for deploys, role changes or maintenance (see
 * .claude/plans/session-lifecycle.md).
 */

/** Ends every sign-in this user has, on every device. Returns how many ended. */
export async function endUserSessions(userId: string): Promise<number> {
    try {
        const ended = await basePrisma.$executeRaw`DELETE FROM auth.sessions WHERE user_id = ${userId}::uuid`
        logger.info(`Ended ${ended} session(s) for user ${userId}`, 'Sessions')
        return ended
    } catch (error) {
        // Loud on purpose: a silent failure here is how the old signOut(userId) calls went unnoticed.
        logger.error(`Couldn't end sessions for user ${userId}`, error instanceof Error ? error : new Error(String(error)), 'Sessions')
        throw error
    }
}

/** Ends every sign-in on the platform except one user's (the admin running it). Returns how many ended. */
export async function endAllSessions({ exceptUserId }: { exceptUserId: string }): Promise<number> {
    try {
        const ended = await basePrisma.$executeRaw`DELETE FROM auth.sessions WHERE user_id <> ${exceptUserId}::uuid`
        logger.warn(`Ended ${ended} session(s) for all users except ${exceptUserId}`, 'Sessions')
        return ended
    } catch (error) {
        logger.error("Couldn't end all sessions", error instanceof Error ? error : new Error(String(error)), 'Sessions')
        throw error
    }
}
