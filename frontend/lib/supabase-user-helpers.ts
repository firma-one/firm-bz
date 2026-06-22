import type { User } from '@supabase/supabase-js'

/** Extract avatar URL from a Supabase admin user object. */
export function getAvatarUrlFromSupabaseUser(dbUser: User | null | undefined): string | null {
    if (!dbUser) return null
    const meta = dbUser.user_metadata
    const fromMeta = (meta?.avatar_url ?? meta?.picture) as string | undefined
    if (fromMeta) return fromMeta
    const firstIdentity = dbUser.identities?.[0]?.identity_data
    const fromIdentity = (firstIdentity?.avatar_url ?? firstIdentity?.picture) as string | undefined
    return fromIdentity ?? null
}
