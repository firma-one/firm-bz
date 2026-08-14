'use server'

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
