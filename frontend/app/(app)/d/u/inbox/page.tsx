import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { getHomeFirms } from "@/lib/home/home-firms"
import { InboxView } from "@/components/inbox/inbox-view"

export const metadata = { title: "Inbox" }

/**
 * The cross-firm Inbox (.claude/plans/cross-firm-home-inbox.md): the caller's own reminders and
 * notifications across every firm they may open right now (getHomeFirms), filterable to one with
 * `?firm={slug}`. Notifications come from /api/notifications?firms=all, which derives the same
 * firm list on the server.
 */
export default async function InboxPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/signin")

    const { firms, unavailable } = await getHomeFirms(user.id)
    return <InboxView firms={firms.map((f) => ({ id: f.id, slug: f.slug, name: f.name }))} unavailable={unavailable} />
}
