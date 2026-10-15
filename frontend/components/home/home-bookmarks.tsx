"use client"

import { useState } from "react"
import { Bookmark, Briefcase, FileText, X } from "lucide-react"
import { ListGroup, ListRow } from "@/components/ui/list-row"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { Hint } from "@/components/ui/tooltip"
import type { ShellFavorite } from "@/lib/actions/shell"

/** Rows shown before "Show all", so a long list doesn't push My engagements off the page. */
const COLLAPSED_COUNT = 8

/**
 * The viewer's bookmarks in this firm (.claude/plans/ui-ux-overhaul.md, Phase 6). They used to be a
 * sidebar section and a Personalization tab; Home keeps the sidebar lean. Only bookmarks on
 * engagements the viewer can see here arrive (getShellSidebarData). The section shows even when
 * empty, saying how to add one, since a hidden section can't be discovered.
 */
export function HomeBookmarks({ bookmarks }: { bookmarks: ShellFavorite[] }) {
    const [items, setItems] = useState(bookmarks)
    const [removing, setRemoving] = useState<string | null>(null)
    const [expanded, setExpanded] = useState(false)

    async function remove(id: string) {
        setRemoving(id)
        try {
            const res = await fetch("/api/bookmarks", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
            })
            if (res.ok) {
                setItems((prev) => prev.filter((b) => b.id !== id))
                window.dispatchEvent(new Event("pockett-bookmarks-updated"))
            }
        } finally {
            setRemoving(null)
        }
    }

    const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT)
    const hidden = items.length - shown.length

    return (
        <ListGroup title="Bookmarks" count={items.length} icon={<Bookmark className="h-3.5 w-3.5 text-fg-muted" />}>
            {items.length === 0 && (
                <EmptyPanel
                    compact
                    icon={<Bookmark />}
                    title="No bookmarks yet"
                    description="Bookmark a document from its ⋯ menu to keep it one click away here."
                />
            )}
            {shown.map((b) => (
                // The remove button sits beside the link, not inside it, so it never navigates.
                <div key={b.id} className="group/bookmark relative">
                    <ListRow
                        href={b.href}
                        leading={b.kind === "document" ? <FileText /> : <Briefcase />}
                        title={b.label}
                        meta={b.context ?? undefined}
                        className="pr-10"
                    />
                    <Hint label="Remove from bookmarks">
                        <button
                            type="button"
                            onClick={() => remove(b.id)}
                            disabled={removing === b.id}
                            aria-label={`Remove ${b.label} from bookmarks`}
                            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-control text-fg-subtle opacity-0 transition-opacity hover:bg-surface-selected hover:text-fg focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30 disabled:opacity-50 group-hover/bookmark:opacity-100"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </Hint>
                </div>
            ))}
            {hidden > 0 && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex h-8 items-center rounded-control px-2 text-left text-small text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                >
                    Show {hidden} more
                </button>
            )}
        </ListGroup>
    )
}
