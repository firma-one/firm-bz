import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getUserFirms, resolveDefaultFirmLandingPath } from '@/lib/actions/firms'
import { createClient } from '@/utils/supabase/server'
import { isSystemAdminEmail } from '@/lib/system/admin-check'
import { DLayoutClient } from './d-layout-client'

const INVOKE_PATH_HEADER = 'x-invoke-path'

/**
 * Server layout: loads firms for the shell; for the bare `/d` entry only, redirects to the
 * resolved workspace (`/d/f/{slug}`) or `/d/onboarding` when workspace setup is incomplete.
 * Child routes (`/d/onboarding`, `/d/billing`, `/d/f/...`) are unchanged.
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

    const h = await headers()
    const rawPath = h.get(INVOKE_PATH_HEADER) ?? ''
    const invokePath = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath

    if (invokePath === '/d') {
        if (user?.id) {
            try {
                const path = await resolveDefaultFirmLandingPath(user.id)
                if (path) redirect(path)
            } catch {
                redirect('/d/onboarding')
            }
        }
    }

    // Signup-success is a standalone full-page experience — no app shell
    if (invokePath === '/d/signup-success') {
        return <>{children}</>
    }

    return <DLayoutClient initialFirms={firms} isSystemAdmin={isSystemAdmin}>{children}</DLayoutClient>
}
