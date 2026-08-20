import { getUserFirms } from '@/lib/actions/firms'
import { createClient } from '@/utils/supabase/server'
import { isSystemAdminEmail } from '@/lib/system/admin-check'
import { DLayoutClient } from './d-layout-client'

/**
 * Server layout: loads firms for the shell (shared by EVERY route under `/d/*`, including
 * firm-scoped pages — do not wrap this in a Suspense boundary with a full-screen fallback,
 * that would show the bare-`/d`-landing blocker modal on every `/d/*` navigation, including
 * refreshing an already-resolved firm URL). Landing-path resolution + its own loading UI for
 * the bare `/d` entry specifically live in `page.tsx`, scoped to that one route only.
 */
export default async function DLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const firms = await getUserFirms()

    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const isSystemAdmin = isSystemAdminEmail(user?.email)

    return <DLayoutClient initialFirms={firms} isSystemAdmin={isSystemAdmin}>{children}</DLayoutClient>
}
