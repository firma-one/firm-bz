import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth/session-user"
import { getHomeFirms, type HomeFirms } from "@/lib/home/home-firms"
import { InboxView } from "@/components/inbox/inbox-view"


/**
 * The cross-firm Inbox (.claude/plans/cross-firm-home-inbox.md): the caller's own reminders and
 * notifications across every firm they may open right now (getHomeFirms), filterable to one with
 * `?firm={slug}`. Notifications come from /api/notifications?firms=all, which derives the same
 * firm list on the server. Without the firm list the Inbox can't say what's in it, so it says it
 * didn't load (EM-1) rather than list nothing.
 */
export default async function InboxPage() {
    const user = await getSessionUser()
    if (!user) redirect("/signin")

    let homeFirms: HomeFirms | null = null
    try {
        homeFirms = await getHomeFirms(user.id)
    } catch {
        // getHomeFirms logged it; the Inbox says it.
    }
    if (!homeFirms) return <InboxView firms={[]} firmsFailed />
    const { firms, unavailable } = homeFirms
    return <InboxView firms={firms.map((f) => ({ id: f.id, slug: f.slug, name: f.name }))} unavailable={unavailable} />
}
