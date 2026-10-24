import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { getHomeFirms } from "@/lib/home/home-firms"
import { getMyWork } from "@/lib/home/my-work"
import { getHomeBookmarks } from "@/lib/home/bookmarks"
import { getRecentVisits } from "@/lib/recents"
import { loadCalendarData } from "@/lib/calendar/calendar-data"
import { getUserReminders } from "@/lib/actions/user-reminders"
import { HomeView } from "@/components/home/home-view"
import { resolveNames } from "@/lib/auth/display-name"


/**
 * The cross-firm Home (.claude/plans/cross-firm-home-inbox.md): one page across every firm the
 * viewer may open (getHomeFirms), or the one picked with `?firm={slug}`. A slug that isn't one of
 * those firms is ignored, not trusted.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ firm?: string }> }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/signin")

    const { firms: allFirms, unavailable } = await getHomeFirms(user.id)
    const { firm: firmParam } = await searchParams
    const selectedFirm = allFirms.find((f) => f.slug === firmParam) ?? null
    const firms = selectedFirm ? [selectedFirm] : allFirms

    // The agenda draws this week; the margins cover any viewer timezone.
    const now = Date.now()
    const window = { from: new Date(now - 36 * 3600_000), to: new Date(now + 8 * 86400_000) }

    const [recents, reminders, calendar, bookmarks] = await Promise.all([
        getRecentVisits(user.id, firms.map((f) => f.id), 6),
        getUserReminders().catch(() => []),
        loadCalendarData({ userId: user.id, firms, window, withAssignees: false }).catch(() => null),
        getHomeBookmarks(user.id, firms),
    ])
    const work = await getMyWork({ userId: user.id, firms, reminders })

    const firstName = resolveNames(user.user_metadata, user.email).firstName

    return (
        <HomeView
            firstName={firstName}
            firms={allFirms}
            selectedFirm={selectedFirm}
            unavailable={unavailable}
            recents={recents}
            calendarEvents={calendar?.events ?? []}
            work={work}
            bookmarks={bookmarks}
        />
    )
}
