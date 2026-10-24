"use client"

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
    BarChart3,
    Briefcase,
    Building2,
    CalendarDays,
    Clock,
    FileText,
    FolderOpen,
    Home,
    Inbox,
    Keyboard,
    Loader2,
    Search,
    Settings,
    UserCircle,
    Users,
} from "lucide-react"
import { WindowGlyph } from '@/components/ui/window-glyph'
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { getCommandRecents, quickSearch, type QuickResult } from "@/lib/actions/quick-search"
import type { RecentVisit } from "@/lib/recents"
import { firmPath, firmTabPath } from "@/lib/navigation/firm-paths"
import { cn } from "@/lib/utils"
import { useShellData } from "./shell-data-context"
import { useSwitchFirm } from "./workspace-switcher"

/** Opens the menu from anywhere (the sidebar's Search item and the legacy synthetic ⌘K both work). */
export const OPEN_COMMAND_MENU_EVENT = "firma:open-command-menu"

type Item = {
    id: string
    section: string
    icon: ReactNode
    label: string
    detail?: string
    hint?: ReactNode
    keywords?: string
    run: () => void
}

const SEARCH_DEBOUNCE_MS = 180

function matches(item: Item, q: string): boolean {
    const hay = `${item.label} ${item.detail ?? ""} ${item.keywords ?? ""}`.toLowerCase()
    return q
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .every((term) => hay.includes(term))
}

/**
 * New UI ⌘K (.claude/plans/ui-ux-overhaul.md, Phase 5): recents and navigation when empty; with a
 * query, engagements and clients across all the user's firms plus files in the current firm
 * (lib/actions/quick-search.ts — access-scoped server-side), then matching commands.
 */
export function CommandMenu({ onToggleSidebar, onShowShortcuts }: { onToggleSidebar: () => void; onShowShortcuts: () => void }) {
    const router = useRouter()
    const { firmSlug, groupSlug, canManage, firms, data } = useShellData()
    const { openFirm } = useSwitchFirm()
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [recents, setRecents] = useState<RecentVisit[]>([])
    const [results, setResults] = useState<QuickResult[]>([])
    const [searching, setSearching] = useState(false)
    const [active, setActive] = useState(0)
    const listRef = useRef<HTMLDivElement>(null)
    const searchSeq = useRef(0)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault()
                setOpen((o) => !o)
            }
        }
        const onOpen = () => setOpen(true)
        document.addEventListener("keydown", onKey)
        window.addEventListener(OPEN_COMMAND_MENU_EVENT, onOpen)
        return () => {
            document.removeEventListener("keydown", onKey)
            window.removeEventListener(OPEN_COMMAND_MENU_EVENT, onOpen)
        }
    }, [])

    useEffect(() => {
        if (!open) return
        setQuery("")
        setResults([])
        setActive(0)
        void getCommandRecents(firmSlug).then(setRecents).catch(() => setRecents([]))
    }, [open, firmSlug])

    useEffect(() => {
        const q = query.trim()
        if (!q) {
            setResults([])
            setSearching(false)
            return
        }
        const seq = ++searchSeq.current
        setSearching(true)
        const t = setTimeout(() => {
            void quickSearch(q, firmSlug)
                .then((r) => { if (seq === searchSeq.current) setResults(r) })
                .catch(() => { if (seq === searchSeq.current) setResults([]) })
                .finally(() => { if (seq === searchSeq.current) setSearching(false) })
        }, SEARCH_DEBOUNCE_MS)
        return () => clearTimeout(t)
    }, [query, firmSlug])

    const go = useCallback(
        (href: string) => {
            setOpen(false)
            router.push(href)
        },
        [router]
    )

    const commands = useMemo<Item[]>(() => {
        const items: Item[] = []
        const base = firmSlug && groupSlug ? firmPath(groupSlug, firmSlug) : null
        const tab = (t: string) => firmTabPath(groupSlug!, firmSlug!, t)
        // Home and Inbox span every firm (.claude/plans/cross-firm-home-inbox.md).
        items.push(
            { id: "go-home", section: "Go to", icon: <Home />, label: "Home", hint: <><Kbd>G</Kbd><Kbd>H</Kbd></>, run: () => go("/d/u/home") },
            { id: "go-inbox", section: "Go to", icon: <Inbox />, label: "Inbox", keywords: "notifications reminders mentions", hint: <><Kbd>G</Kbd><Kbd>I</Kbd></>, run: () => go("/d/u/inbox") }
        )
        if (base) {
            if (!data?.isExternalOnly) {
                items.push(
                    { id: "go-clients", section: "Go to", icon: <FolderOpen />, label: "Clients", hint: <><Kbd>G</Kbd><Kbd>C</Kbd></>, run: () => go(tab("clients")) },
                    { id: "go-calendar", section: "Go to", icon: <CalendarDays />, label: "Calendar", keywords: "due dates", hint: <><Kbd>G</Kbd><Kbd>L</Kbd></>, run: () => go(tab("calendar")) },
                    { id: "go-docsearch", section: "Go to", icon: <Search />, label: "Doc Search", keywords: "documents files find", hint: <><Kbd>G</Kbd><Kbd>D</Kbd></>, run: () => go(tab("doc-search")) }
                )
            }
            if (canManage) {
                items.push(
                    { id: "go-overview", section: "Go to", icon: <BarChart3 />, label: "Firm overview", keywords: "insights analytics action center", hint: <><Kbd>G</Kbd><Kbd>O</Kbd></>, run: () => go(tab("analytics")) },
                    { id: "go-members", section: "Go to", icon: <Users />, label: "Members", keywords: "team people invite", run: () => go(tab("members")) },
                    { id: "go-settings", section: "Go to", icon: <Settings />, label: "Firm settings", keywords: "branding storage drive", hint: <><Kbd>G</Kbd><Kbd>S</Kbd></>, run: () => go(tab("settings")) }
                )
            }
        }
        for (const f of firms) {
            if (f.slug === firmSlug) continue
            items.push({ id: `firm-${f.id}`, section: "Switch workspace", icon: <Building2 />, label: f.name, detail: f.groupName ?? undefined, keywords: "switch workspace firm", run: () => { setOpen(false); void openFirm(f) } })
        }
        items.push(
            { id: "act-profile", section: "Actions", icon: <UserCircle />, label: "Profile", run: () => go("/d/u/profile") },
            { id: "act-sidebar", section: "Actions", icon: <WindowGlyph variant="left" />, label: "Toggle sidebar", hint: <Kbd>[</Kbd>, run: () => { setOpen(false); onToggleSidebar() } },
            { id: "act-shortcuts", section: "Actions", icon: <Keyboard />, label: "Keyboard shortcuts", hint: <Kbd>?</Kbd>, run: () => { setOpen(false); onShowShortcuts() } }
        )
        return items
    }, [firmSlug, groupSlug, canManage, firms, data?.isExternalOnly, go, openFirm, onToggleSidebar, onShowShortcuts])

    const items = useMemo<Item[]>(() => {
        const q = query.trim()
        if (!q) {
            const recentItems: Item[] = recents.map((r) => ({
                id: `recent-${r.id}`,
                section: "Recent",
                icon: r.entityType === "client" ? <FolderOpen /> : <Clock />,
                label: r.title,
                detail: r.context ?? undefined,
                run: () => go(r.path),
            }))
            return [...recentItems, ...commands.filter((c) => c.section !== "Switch workspace" || firms.length <= 6)]
        }
        const found: Item[] = results.map((r) => ({
            id: r.id,
            section: r.kind === "engagement" ? "Engagements" : r.kind === "client" ? "Clients" : "Files",
            icon: r.kind === "engagement" ? <Briefcase /> : r.kind === "client" ? <FolderOpen /> : <FileText />,
            label: r.title,
            detail: r.context,
            run: () => go(r.href),
        }))
        return [...found, ...commands.filter((c) => matches(c, q))]
    }, [query, recents, results, commands, firms.length, go])

    useEffect(() => {
        setActive(0)
    }, [query, results])

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" })
    }, [active])

    function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((a) => Math.min(items.length - 1, a + 1))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
        } else if (e.key === "Enter") {
            e.preventDefault()
            items[active]?.run()
        }
    }

    let lastSection = ""
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
                hideClose
                className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%]"
            >
                <DialogTitle className="sr-only">Search and commands</DialogTitle>
                <div className="flex items-center gap-2 border-b border-line px-3">
                    <Search className="h-4 w-4 shrink-0 text-fg-subtle" />
                    <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onInputKey}
                        placeholder="Search engagements, clients, files, or type a command…"
                        className="h-12 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-subtle"
                        aria-label="Search"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls="command-menu-list"
                        aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
                    />
                    {searching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-fg-subtle" />}
                </div>
                <div ref={listRef} id="command-menu-list" role="listbox" className="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5">
                    {items.length === 0 ? (
                        <p className="px-3 py-8 text-center text-small text-fg-muted">
                            {searching ? "Searching…" : `No results for "${query.trim()}"`}
                        </p>
                    ) : (
                        items.map((item, i) => {
                            const header = item.section !== lastSection ? item.section : null
                            lastSection = item.section
                            return (
                                <div key={item.id}>
                                    {header && <p className="px-2 pb-1 pt-2.5 text-caption text-fg-subtle">{header}</p>}
                                    <button
                                        id={`cmd-${item.id}`}
                                        type="button"
                                        role="option"
                                        aria-selected={i === active}
                                        data-index={i}
                                        onMouseMove={() => setActive(i)}
                                        onClick={() => item.run()}
                                        className={cn(
                                            "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-control px-2 text-left text-ui text-fg",
                                            i === active && "bg-surface-hover"
                                        )}
                                    >
                                        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-fg-muted [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span>
                                        <span className="min-w-0 flex-1 truncate">
                                            {item.label}
                                            {item.detail && <span className="ml-2 text-small text-fg-muted">{item.detail}</span>}
                                        </span>
                                        {item.hint && <span className="flex shrink-0 items-center gap-0.5">{item.hint}</span>}
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>
                <div className="flex items-center gap-3 border-t border-line px-3 py-2 text-caption text-fg-subtle">
                    <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
                    <span className="flex items-center gap-1"><Kbd>↵</Kbd> open</span>
                    <span className="flex items-center gap-1"><Kbd>esc</Kbd> close</span>
                </div>
            </DialogContent>
        </Dialog>
    )
}
