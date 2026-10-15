import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * New UI (v2) section label — sentence case, 12px, muted. Replaces the uppercase mono micro-label
 * pattern (`font-mono text-[10px] font-bold uppercase tracking-widest text-[#45474c]`).
 */
export function SectionLabel({
    as: Comp = "h3",
    className,
    ...props
}: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" | "p" | "span" | "div" }) {
    return <Comp className={cn("text-caption text-fg-muted", className)} {...props} />
}
