import 'server-only'

/*
 * Looks up any account id by email, with no caller check. Server-only rather than 'use server':
 * as a server action it was registered as a callable endpoint (account enumeration). Callers are
 * invitation actions and the files agent, which have already authorized the caller.
 *
 * Lives under lib/actions/ for history; it is not a server action.
 */

import { prisma } from "@/lib/prisma"

/**
 * Look up a Supabase auth.users id by email. Returns null if no account exists.
 */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id::text FROM auth.users WHERE lower(email) = ${email.toLowerCase()} LIMIT 1
    `
    return existing.length > 0 ? existing[0].id : null
}
