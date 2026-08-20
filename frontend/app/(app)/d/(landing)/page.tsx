import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { FirmsView } from '@/components/projects/firms-view'
import { getUserFirms, resolveDefaultFirmLandingPath, type FirmOption } from '@/lib/actions/firms'
import { createClient } from '@/utils/supabase/server'

/**
 * Bare `/d` entry point — resolves where a signed-in user lands, including auto-provisioning
 * a Group+Firm for users with zero firm memberships (see resolveDefaultFirmLandingPath).
 *
 * IMPORTANT: do NOT wrap this in a manual `<Suspense>` boundary around a `redirect()`-calling
 * component. Next.js's Suspense-wrapped-redirect() interaction is a documented React/Next.js
 * bug — the redirecting Server Component throwing NEXT_REDIRECT while inside a `<Suspense>`
 * boundary races the App Router's internal navigation reducer and throws minified React error
 * #310 ("rendered more hooks than during the previous render") inside React/Next's own
 * internals, not application code (see vercel/next.js#78396, #63121, #63388). Instead rely on
 * this route group's own `(landing)/loading.tsx` file-convention boundary, which Next places
 * around `page.tsx` at the framework level — same working pattern already used successfully
 * by `d/[groupSlug]/f/[firmSlug]/loading.tsx` elsewhere in this app.
 *
 * This lives in a `(landing)` route group (not directly in `app/(app)/d/`) specifically so its
 * `loading.tsx` boundary is scoped to ONLY this one route — `d/layout.tsx` is shared by every
 * `/d/*` route including firm-scoped pages, so a loading.tsx there (or wrapping `{children}`
 * at that level) would show this blocker modal on every `/d/*` navigation, including
 * refreshing an already-resolved firm URL, not just the bare `/d` landing case.
 */
export default async function FirmsPage() {
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

    // Defensive fallback: only reached if resolveDefaultFirmLandingPath returns null
    // (malformed firm/group data) rather than a redirect — render picker instead of spinning.
    let firms: FirmOption[] = []
    try {
        firms = await getUserFirms()
    } catch (e) {
        if (isRedirectError(e)) throw e
    }

    return (
        <div className="h-full flex flex-col p-8 bg-stone-50/30">
            <FirmsView firms={firms} activeOrgIdFromJWT={null} />
        </div>
    )
}
