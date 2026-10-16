import { HomeView } from '@/components/home/home-view'
import {
    DEMO_HOME_FIRM,
    demoBookmarks,
    demoCalendarEvents,
    demoRecents,
    demoWork,
} from '@/lib/demo/demo-personal-data'

// Recents, due dates and the agenda count from today, so build per request, not once at build time.
export const dynamic = 'force-dynamic'

/** The app's Home (components/home/home-view.tsx) over the demo user's sample data. */
export default function DemoHomePage() {
    const now = new Date()
    return (
        <HomeView
            firstName={null}
            firms={[DEMO_HOME_FIRM]}
            selectedFirm={null}
            unavailable={[]}
            recents={demoRecents(now)}
            calendarEvents={demoCalendarEvents()}
            work={demoWork(now)}
            bookmarks={demoBookmarks()}
            calendarHref="/tour?tab=calendar"
            readOnly
        />
    )
}
