import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth/session-user"
import { getHomeFirms, type HomeFirms } from "@/lib/home/home-firms"
import { getMyWork, type MyWork } from "@/lib/home/my-work"
import { getHomeBookmarks, type HomeBookmark } from "@/lib/home/bookmarks"
import { getRecentVisits } from "@/lib/recents"
import { loadCalendarData } from "@/lib/calendar/calendar-data"
import { getUserReminders, type ReminderWithContext } from "@/lib/actions/user-reminders"
import { HomeView } from "@/components/home/home-view"
import type { HomeLoadProblems } from "@/components/home/home-load-failed"
import { resolveNames } from "@/lib/auth/display-name"
import { logger } from "@/lib/logger"

const NO_WORK: MyWork = { engagements: [], needsYou: [], dueSoon: [] }

/** A load's value, or that it failed (logged). Each part of Home fails on its own and says so (EM-2). */
async function settle<T>(what: string, load: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    try {
        return { ok: true, value: await load }
    } catch (e) {
        logger.error(`Home couldn't load ${what}`, e instanceof Error ? e : new Error(String(e)), 'Home')
        return { ok: false }
    }
}

/**
 * The cross-firm Home (.claude/plans/cross-firm-home-inbox.md): one page across every firm the
 * viewer may open (getHomeFirms), or the one picked with `?firm={slug}`. A slug that isn't one of
 * those firms is ignored, not trusted.
 *
 * A part that didn't load is reported to HomeView (`failed`), which says so in place of its empty
 * line: "All caught up" or "Nothing overdue" after a failed load would be believed (EM-2).
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ firm?: string }> }) {
    const user = await getSessionUser()
    if (!user) redirect("/signin")

    const firstName = resolveNames(user.user_metadata, user.email).firstName
    const homeFirms = await settle<HomeFirms>("firms", getHomeFirms(user.id))
    if (!homeFirms.ok) {
        return (
            <HomeView
                firstName={firstName}
                firms={[]}
                selectedFirm={null}
                unavailable={[]}
                recents={[]}
                calendarEvents={[]}
                work={NO_WORK}
                bookmarks={[]}
                failed={{ firms: true }}
            />
        )
    }

    const { firms: allFirms, unavailable } = homeFirms.value
    const { firm: firmParam } = await searchParams
    const selectedFirm = allFirms.find((f) => f.slug === firmParam) ?? null
    const firms = selectedFirm ? [selectedFirm] : allFirms

    // The agenda draws this week; the margins cover any viewer timezone.
    const now = Date.now()
    const window = { from: new Date(now - 36 * 3600_000), to: new Date(now + 8 * 86400_000) }

    const [recents, reminders, calendar, bookmarks] = await Promise.all([
        getRecentVisits(user.id, firms.map((f) => f.id), 6),
        settle<ReminderWithContext[]>("reminders", getUserReminders()),
        settle("the calendar", loadCalendarData({ userId: user.id, firms, window, withAssignees: false })),
        settle<HomeBookmark[]>("bookmarks", getHomeBookmarks(user.id, firms)),
    ])
    const work = await settle("work", getMyWork({ userId: user.id, firms, reminders: reminders.ok ? reminders.value : [] }))

    const failed: HomeLoadProblems = {
        work: !work.ok,
        reminders: !reminders.ok,
        calendar: !calendar.ok,
        bookmarks: !bookmarks.ok,
    }

    return (
        <HomeView
            firstName={firstName}
            firms={allFirms}
            selectedFirm={selectedFirm}
            unavailable={unavailable}
            recents={recents}
            calendarEvents={calendar.ok ? calendar.value.events : []}
            work={work.ok ? work.value : NO_WORK}
            bookmarks={bookmarks.ok ? bookmarks.value : []}
            failed={failed}
        />
    )
}
