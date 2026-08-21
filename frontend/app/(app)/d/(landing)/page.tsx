import { redirect } from 'next/navigation'
import { isRedirectError } from 'next/dist/client/components/redirect-error'
import { FirmsView } from '@/components/projects/firms-view'
import { getUserFirms, resolveDefaultFirmLandingPath, shouldShowSwitchWorkspace, type FirmOption } from '@/lib/actions/firms'
import { createClient } from '@/utils/supabase/server'
import { GroupPicker } from './group-picker'

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
export default async function FirmsPage({
    searchParams,
}: {
    searchParams: Promise<{ entry?: string }>
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        redirect('/signin')
    }

    // Auto-routing (redirect straight into a resolved firm/group-picker/onboarding target)
    // only applies when arriving fresh from sign-in/sign-up (`?entry=auth` — see
    // components/signup/signup-form.tsx, app/(app)/signin/use-sign-in-flow.ts, proxy.ts).
    // A plain `/d/` with no param (typed manually, bookmarked, or the Profile menu's
    // "Switch Workspace" link) always shows the picker/fallback below instead — otherwise a
    // single-group user could never reach `/d/` at all to use the "Create your own workspace"
    // action, since resolveDefaultFirmLandingPath always resolves them straight into their
    // one firm.
    const { entry } = await searchParams
    if (entry === 'auth') {
        try {
            const path = await resolveDefaultFirmLandingPath(user.id)
            // `resolveDefaultFirmLandingPath` returns the literal string '/d/' for the
            // 2+-distinct-groups case — since THIS page already handles `/d`, redirecting
            // there would be a self-redirect. Render the group picker directly instead.
            if (path === '/d/') {
                return (
                    <div className="h-full flex flex-col p-8 bg-stone-50/30">
                        <GroupPicker />
                    </div>
                )
            }
            if (path) {
                redirect(path)
            }
        } catch (e) {
            if (isRedirectError(e)) throw e
            redirect('/d/onboarding')
        }
    }

    // No `?entry=auth` — deliberate navigation to `/d/`. Show the group picker whenever there's
    // something meaningful to do here (2+ groups, or a single group where the user isn't admin
    // and can create their own workspace); otherwise fall through to the defensive firm-picker
    // fallback below.
    if (await shouldShowSwitchWorkspace()) {
        return (
            <div className="h-full flex flex-col p-8 bg-stone-50/30">
                <GroupPicker />
            </div>
        )
    }

    // Defensive fallback: reached when deliberately navigating to `/d/` with nothing for the
    // group picker to show (single group, already its admin), or if resolveDefaultFirmLandingPath
    // returned null (malformed firm/group data) during auto-routing above.
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
