"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, LayoutGrid, Loader2 } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { switchFirm } from "@/lib/actions/firms"
import { firmPath } from "@/lib/navigation/firm-paths"
import { cn } from "@/lib/utils"
import { useShellData, type ShellFirm } from "./shell-data-context"

/** Firm logo, or its initial on a neutral tile — the only place the firm's brand shows in v2. */
export function FirmMark({ firm, size = "md" }: { firm: Pick<ShellFirm, "name" | "logoUrl"> | null; size?: "sm" | "md" }) {
    const box = size === "sm" ? "h-5 w-5 text-[11px]" : "h-6 w-6 text-xs"
    if (firm?.logoUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firm.logoUrl} alt="" className={cn(box, "shrink-0 rounded-control bg-surface object-contain")} />
        )
    }
    return (
        <span className={cn(box, "flex shrink-0 items-center justify-center rounded-control bg-fg font-semibold text-white")}>
            {(firm?.name ?? "?").trim().charAt(0).toUpperCase()}
        </span>
    )
}

/**
 * Notion/Linear-style workspace switcher. Switching runs the same sequence as FirmSwitchDialog —
 * switchFirm (sets FirmMember.isDefault and the JWT's active firm), session refresh, permission
 * rebuild — then a hard navigation, so the next sign-in lands on the firm the user last chose.
 */
/** Switch-and-navigate, shared by the switcher and the ⌘K menu. `switching` is the target slug. */
export function useSwitchFirm() {
    const { firmSlug } = useShellData()
    const [switching, setSwitching] = useState<string | null>(null)

    async function openFirm(firm: ShellFirm) {
        if (firm.slug === firmSlug || switching) return
        setSwitching(firm.slug)
        try {
            await switchFirm(firm.slug)
            const { supabase } = await import("@/lib/supabase")
            await supabase.auth.refreshSession()
            const { buildUserSettingsPlus } = await import("@/lib/actions/user-settings")
            await buildUserSettingsPlus()
        } catch {
            // The firm page itself re-checks membership; navigate regardless.
        }
        window.location.href = firm.groupSlug ? firmPath(firm.groupSlug, firm.slug) : "/d"
    }

    return { openFirm, switching }
}

export function WorkspaceSwitcher() {
    const { firms, firmSlug, inboxCountFor } = useShellData()
    const { openFirm, switching } = useSwitchFirm()
    const current = firms.find((f) => f.slug === firmSlug) ?? null

    const groups = new Map<string, ShellFirm[]>()
    for (const f of firms) {
        const key = f.groupName ?? f.groupSlug ?? ""
        groups.set(key, [...(groups.get(key) ?? []), f])
    }
    const showGroupHeaders = groups.size > 1

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-left text-ui font-medium text-fg transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
                    aria-label="Switch workspace"
                >
                    <FirmMark firm={current} />
                    <span className="min-w-0 flex-1 truncate">{current?.name ?? "Choose a workspace"}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                {Array.from(groups.entries()).map(([groupName, groupFirms], i) => (
                    <div key={groupName || i}>
                        {i > 0 && <DropdownMenuSeparator />}
                        {showGroupHeaders && <DropdownMenuLabel>{groupName || "Workspaces"}</DropdownMenuLabel>}
                        {groupFirms.map((f) => (
                            <DropdownMenuItem key={f.id} onSelect={() => void openFirm(f)} className="gap-2">
                                <FirmMark firm={f} size="sm" />
                                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                                {switching === f.slug ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-fg-subtle" />
                                ) : f.slug === firmSlug ? (
                                    <Check className="h-3.5 w-3.5 text-fg-muted" />
                                ) : inboxCountFor(f.id) > 0 ? (
                                    <span className="text-caption tabular-nums text-fg-subtle" title="Unread in Inbox">{inboxCountFor(f.id)}</span>
                                ) : null}
                            </DropdownMenuItem>
                        ))}
                    </div>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { window.location.href = "/d/" }} className="gap-2 text-fg-muted">
                    <LayoutGrid className="h-4 w-4" />
                    All workspaces…
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
