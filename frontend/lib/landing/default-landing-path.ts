import 'server-only'

import { createClient } from '@/utils/supabase/server'
import { FirmService } from '@/lib/firm-service'
import { logger } from '@/lib/logger'
import { firmPath, groupFirmListPath } from '@/lib/navigation/firm-paths'

/*
 * Landing-path resolution for an explicit userId. Server-only rather than a server action in
 * lib/actions/firms.ts: as an action, any signed-in user could pass someone else's id and learn
 * their groups and firm slugs. Callers (the /d landing page, the auth callback, the billing page)
 * pass the id of the user they just authenticated.
 */

/**
 * v2 landing (.claude/plans/ui-ux-overhaul.md, Phase 3): last-visited firm from server-side recents,
 * else the FirmMember.isDefault firm (which the v2 workspace switcher keeps current), else the only
 * firm. Null — fall through to the v1 pickers — for v1 users and for multi-firm users with neither.
 */
async function resolveV2LandingPath(userId: string, firms: Awaited<ReturnType<typeof FirmService.getUserFirms>>): Promise<string | null> {
    const { getUserUiPrefs } = await import('@/lib/ui-prefs')
    const { shell } = await getUserUiPrefs(userId)
    if (shell !== 'v2') return null

    const landable = firms.filter((f) => f.slug && f.groupSlug)
    if (landable.length === 0) return null

    const { getLastVisitedFirmId } = await import('@/lib/recents')
    const lastId = await getLastVisitedFirmId(userId, landable.map((f) => f.id))
    const target =
        landable.find((f) => f.id === lastId) ??
        landable.find((f) => f.members.some((m) => m.userId === userId && m.isDefault)) ??
        (landable.length === 1 ? landable[0] : null)
    return target ? firmPath(target.groupSlug!, target.slug) : null
}

/**
 * Where to send the user when entering the app at `/d` (and when auth callback has no explicit `next`).
 *
 * Groups are the top-level routing unit, firms are the second-level unit within a group
 * (see .claude/plans/sandbox-firm-removal.md, Step 6).
 *
 * Routing rules (in order):
 * 1. No firm memberships at all → silently auto-provision a real Group+Firm (see
 *    lib/onboarding/auto-provision.ts) and land directly in it — no onboarding wizard. The
 *    provisioning runs inline here (server-side redirect); `app/(app)/d/page.tsx`'s own
 *    inner Suspense boundary covers it, scoped to that one route only.
 * 2. 2+ distinct groups → `/d/` (group picker — one card per group)
 * 3. Exactly 1 group, 2+ firms in it → `/d/{groupSlug}/f/` (firm picker, scoped to that group)
 * 4. Exactly 1 group, exactly 1 firm → `/d/{groupSlug}/f/{firmSlug}` (go straight in) — having
 *    any firm at all is treated as onboarding-complete, no per-firm Drive/settings gate
 * 5. Admin with joinable/already-joined domain orgs → `/d/{groupSlug}/f/` instead of step 4
 *
 * Returns `null` only if the resolved firm/group has no slug (malformed data).
 */
export async function resolveDefaultFirmLandingPath(userId: string): Promise<string | null> {
    const allFirms = await FirmService.getUserFirms(userId)

    logger.info('[resolveDefaultFirmLandingPath]', { userId, firmCount: allFirms.length, slugs: allFirms.map(f => f.slug) })

    if (allFirms.length === 0) {
        try {
            const supabase = await createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return '/d/onboarding'

            const { autoProvisionFirstFirm } = await import('@/lib/onboarding/auto-provision')
            const { groupSlug, firmSlug } = await autoProvisionFirstFirm(user)
            // `?landed=new` lets the destination firm page show a one-time "just landed"
            // overlay (loading phase -> a closing welcome message) — the /d loader itself
            // can't show this (it renders before we know a fresh auto-provision even
            // happened, or even whether this is a first-time vs. returning landing at all),
            // so the closing message lives on arrival instead. See resolveDefaultFirmLandingPath's
            // other two `firmPath(...)` returns below for the `?landed=returning` counterpart.
            return `${firmPath(groupSlug, firmSlug)}?landed=new`
        } catch (err) {
            // Auto-provisioning failure (e.g. DB down) shouldn't crash landing-path resolution —
            // fall back to the old onboarding route, which will retry provisioning on next visit.
            logger.error('[resolveDefaultFirmLandingPath] Auto-provisioning failed', err as Error, undefined, { userId })
            return '/d/onboarding'
        }
    }

    // New UI (v2): a returning user lands on the Home of the firm they last worked in — no group
    // or firm picker — falling back to their default firm. v1 keeps the rules below unchanged.
    const v2Path = await resolveV2LandingPath(userId, allFirms)
    if (v2Path) return v2Path

    const distinctGroupSlugs = Array.from(new Set(allFirms.map((f) => f.groupSlug).filter((s): s is string => Boolean(s))))
    if (distinctGroupSlugs.length === 0) return null

    // 2+ distinct groups → group picker. Nothing about which firm to land in is decided yet.
    if (distinctGroupSlugs.length > 1) return '/d/'

    const groupSlug = distinctGroupSlugs[0]
    const firmsInGroup = allFirms.filter((f) => f.groupSlug === groupSlug)

    // Exactly 1 group, but 2+ firms in it → firm picker, scoped to this group.
    if (firmsInGroup.length > 1) return groupFirmListPath(groupSlug)

    const targetFirm = firmsInGroup[0]
    if (!targetFirm?.slug) return null

    const membership = targetFirm.members.find((m) => m.userId === userId)
    const isFirmAdmin = membership?.role === 'firm_admin'

    if (!isFirmAdmin) {
        return `${firmPath(groupSlug, targetFirm.slug)}?landed=returning`
    }

    // Belonging to a group at all (checked at the top of this function) is now the only
    // "onboarding complete" signal — no per-firm Drive/settings gate. A user who already has a
    // firm never gets routed into /d/onboarding again.
    const { getDomainOnboardingOptions } = await import('@/lib/onboarding/domain-options')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
        const domainOpts = await getDomainOnboardingOptions(userId, user.email)
        if ((domainOpts.orgsToJoin.length + domainOpts.orgsAlreadyIn.length) > 0) {
            return groupFirmListPath(groupSlug)
        }
    }

    return `${firmPath(groupSlug, targetFirm.slug)}?landed=returning`
}
