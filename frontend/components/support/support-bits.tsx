"use client"

import { Bug, HelpCircle, Lightbulb, Zap } from "lucide-react"
import { Tag } from "@/components/ui/tag"
import { initialsOf } from "@/lib/initials"
import { cn } from "@/lib/utils"
import { TICKET_KIND_LABEL, type TicketKind } from "@/lib/support/ticket-view"

/*
 * Small pieces the Support table and sidebars share (.claude/plans/app-design-refinements.md, section 14).
 * A request's kind is a gray tag with a colored icon, so it never reads as a status: the status
 * language owns the pastel pills.
 */

const KIND_ICON: Record<TicketKind, React.ReactNode> = {
    BUG: <Bug className="text-status-problem-icon" />,
    REQUEST: <Lightbulb className="text-status-waiting-icon" />,
    ENQUIRY: <HelpCircle className="text-status-underway-icon" />,
}

export function KindIcon({ kind, className }: { kind: TicketKind; className?: string }) {
    return <span aria-hidden className={cn("flex shrink-0 items-center [&_svg]:h-3.5 [&_svg]:w-3.5", className)}>{KIND_ICON[kind]}</span>
}

export function KindTag({ kind }: { kind: TicketKind }) {
    return <Tag color="gray" icon={KIND_ICON[kind]}>{TICKET_KIND_LABEL[kind]}</Tag>
}

/** A person's initials, Firma's mark, or the bolt of a request the app filed by itself. */
export function SupportAvatar({ name, firma = false, auto = false, size = 20 }: { name?: string | null; firma?: boolean; auto?: boolean; size?: 20 | 24 }) {
    const box = size === 24 ? "h-6 w-6 text-[10px]" : "h-5 w-5 text-[9px]"
    if (firma) return <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-control bg-primary font-semibold text-white", box)}>F</span>
    if (auto) return <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-surface-muted text-fg-muted", box)}><Zap className="h-3 w-3" /></span>
    return <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full bg-surface-muted font-medium text-fg-muted", box)}>{initialsOf(name ?? "")}</span>
}

/** "240 KB", "1.4 MB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
