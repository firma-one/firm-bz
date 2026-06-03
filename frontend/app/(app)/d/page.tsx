import { redirect, RedirectType } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { FirmsView } from '@/components/projects/firms-view'
import { getUserFirms, resolveDefaultFirmLandingPath, type FirmOption } from '@/lib/actions/firms'
import { createClient } from '@/utils/supabase/server'

export default async function FirmsPage() {
    let firms: FirmOption[] = []
    try {
        firms = await getUserFirms()
    } catch (e) {
        // Re-throw Next.js redirect errors so they aren't swallowed into /d/onboarding
        if (isRedirectError(e)) throw e
        redirect('/d/onboarding')
    }

    if (firms.length === 0) {
        redirect('/d/onboarding')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/signin')
    }

    try {
        const path = await resolveDefaultFirmLandingPath(user.id)
        if (path) {
            redirect(path)
        }
    } catch (e) {
        if (isRedirectError(e)) throw e
        redirect('/d/onboarding')
    }

    // Defensive fallback: in case all firm rows are malformed (missing slug), render picker instead of spinning.
    return (
        <div className="h-full flex flex-col p-8 bg-stone-50/30">
            <FirmsView firms={firms} activeOrgIdFromJWT={null} />
        </div>
    )
}
