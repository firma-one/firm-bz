import 'server-only'
import { cache } from 'react'
import { createClient } from '@/utils/supabase/server'

/**
 * The signed-in user from the request's session cookie, asked of Supabase Auth once per server
 * render instead of once per permission check. React's cache() scopes it to a single request: it
 * is never shared between requests or users, and outside a render it simply asks every time.
 */
export const getSessionUser = cache(async () => {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
})
