"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Loader2 } from "lucide-react"
import { LoadFailed } from "@/components/ui/load-failed"

/*
 * What Home says when part of it didn't load (EM-2). Home's data comes from the server page, so
 * trying again re-renders it (router.refresh). A failed part never shows its empty line ("All caught
 * up", "Nothing overdue or on the calendar this week"): the person would believe it.
 */

/** Which of Home's loads failed. The page sets these; the demo never does. */
export type HomeLoadProblems = {
    /** The firm list: without it Home can't say what's in them. */
    firms?: boolean
    /** Needs you, Due soon and My engagements (getMyWork). */
    work?: boolean
    /** The reminders that feed Needs you and the Agenda. */
    reminders?: boolean
    /** The week's calendar events. */
    calendar?: boolean
    bookmarks?: boolean
}

/** All of Home, in place of the page's sections. */
export function HomeLoadFailed({ what = "your Home" }: { what?: string }) {
    const router = useRouter()
    return <LoadFailed what={what} reason="Something went wrong on our side." onRetry={() => router.refresh()} />
}

/**
 * One section's quiet line: "Couldn't load your agenda. Try again". `partial` says the rows shown
 * aren't all there is.
 */
export function HomeLoadNote({ what, partial = false }: { what: string; partial?: boolean }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    return (
        <p role="alert" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 text-small text-fg-muted">
            <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-danger" />
            <span>{partial ? `Couldn't load all of ${what}, so some may be missing.` : `Couldn't load ${what}.`}</span>
            <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => router.refresh())}
                className="inline-flex items-center gap-1 rounded-control font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:opacity-60"
            >
                {pending && <Loader2 aria-hidden className="h-3 w-3 animate-spin" />}
                Try again
            </button>
        </p>
    )
}
