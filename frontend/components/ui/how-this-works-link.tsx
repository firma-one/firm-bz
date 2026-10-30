import { MapPinned } from "lucide-react"
import { Hint } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { tourGuideHref, type TourNodeId } from "@/lib/demo/tour-chapters"

/**
 * "How this works" beside a page title: opens the page's part of the tour on /tour, in a
 * new tab so the user keeps their place (.claude/plans/tour-chapters.md). The tour shows the firm's
 * view, so pages leave it out for client roles.
 */
export function HowThisWorksLink({ guide, className }: { guide: TourNodeId; className?: string }) {
    return (
        <Hint label="A short tour of this page, in a new tab" side="bottom">
            <a
                href={tourGuideHref(guide)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-control px-1.5 text-caption text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg print:hidden",
                    className,
                )}
            >
                <MapPinned className="h-3.5 w-3.5" aria-hidden />
                How this works
            </a>
        </Hint>
    )
}
