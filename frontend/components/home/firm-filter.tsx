"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Building2, Check, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type FirmOption = { slug: string; name: string }

/**
 * "All firms ▾" for the cross-firm Home and Inbox (.claude/plans/cross-firm-home-inbox.md). The
 * choice lives in the URL (`?firm={slug}`), so a filtered view can be linked to and the old
 * per-firm Inbox URL can land on it; other query params (the Inbox tab) are kept. Hidden for
 * someone in a single firm.
 */
export function FirmFilter({ firms, selected }: { firms: FirmOption[]; selected: string | null }) {
    const pathname = usePathname() ?? ""
    const params = useSearchParams()
    if (firms.length < 2) return null

    const hrefFor = (slug: string | null) => {
        const next = new URLSearchParams(params?.toString() ?? "")
        if (slug) next.set("firm", slug)
        else next.delete("firm")
        const qs = next.toString()
        return qs ? `${pathname}?${qs}` : pathname
    }
    const current = firms.find((f) => f.slug === selected) ?? null

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" aria-label={`Showing ${current?.name ?? "all firms"}`}>
                    <Building2 className="h-4 w-4 text-fg-muted" />
                    <span className="max-w-[12rem] truncate">{current?.name ?? "All firms"}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-fg-subtle" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[12rem]">
                <DropdownMenuItem asChild className="gap-2">
                    <Link href={hrefFor(null)}>
                        <Check className={`h-4 w-4 ${current ? "invisible" : "text-fg-muted"}`} />
                        All firms
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {firms.map((f) => (
                    <DropdownMenuItem key={f.slug} asChild className="gap-2">
                        <Link href={hrefFor(f.slug)}>
                            <Check className={`h-4 w-4 ${current?.slug === f.slug ? "text-fg-muted" : "invisible"}`} />
                            <span className="truncate">{f.name}</span>
                        </Link>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

type Unavailable = { id: string; name: string; reason: "subscription" | "maintenance"; href: string }

/** One muted line for firms whose pages are closed right now, so their absence isn't a mystery. */
export function UnavailableFirmsNote({ firms }: { firms: Unavailable[] }) {
    if (firms.length === 0) return null
    return (
        <p className="flex flex-wrap items-center gap-x-1 text-small text-fg-subtle">
            {firms.map((f, i) => (
                <span key={f.id}>
                    <Link href={f.href} className="underline decoration-line-strong underline-offset-2 hover:text-fg">
                        {f.name}
                    </Link>{" "}
                    {f.reason === "maintenance" ? "is under maintenance" : "has an inactive subscription"}
                    {i < firms.length - 1 ? ";" : firms.length === 1 ? ", so it isn't shown here." : ", so they aren't shown here."}
                </span>
            ))}
        </p>
    )
}
