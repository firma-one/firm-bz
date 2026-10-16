import { redirect } from "next/navigation"

/**
 * The Inbox moved to `/d/u/inbox`, across firms (.claude/plans/cross-firm-home-inbox.md). Old
 * links to a firm's Inbox land there filtered to that firm; the Inbox ignores a slug the caller
 * can't open. Other query params (the tab) carry over.
 */
export default async function FirmInboxRedirect({
    params,
    searchParams,
}: {
    params: Promise<{ groupSlug: string; firmSlug: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
    const { firmSlug } = await params
    const next = new URLSearchParams()
    for (const [key, value] of Object.entries(await searchParams)) {
        if (typeof value === "string") next.set(key, value)
    }
    next.set("firm", firmSlug)
    redirect(`/d/u/inbox?${next.toString()}`)
}
