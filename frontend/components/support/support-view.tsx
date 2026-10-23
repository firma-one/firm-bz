"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
    ArrowDownUp, ChevronDown, ChevronUp, CircleDot, Clock, Hash, Briefcase, LifeBuoy, Link2, Loader2, MessageCircle, Plus, Search, Tag as TagIcon, Type, UserRound, X, Zap,
} from "lucide-react"
import { PageHeading } from "@/components/ui/page-heading"
import { NotionTable, NotionTableBody, NotionTableCell, NotionTableHead, NotionTableHeader, NotionTableRow } from "@/components/ui/notion-table"
import { StatusPill } from "@/components/ui/status-pill"
import { FilterMenuRow, FilterPill } from "@/components/ui/filter-pill"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Hint } from "@/components/ui/tooltip"
import { RelativeDateTime } from "@/components/ui/relative-date-time"
import { useToast } from "@/components/ui/toast"
import { useRightPane } from "@/lib/right-pane-context"
import { cn } from "@/lib/utils"
import { TICKET_KIND_LABEL, inView, lastUpdate, wherePath, type SupportSide, type SupportTicket, type SupportView as View, type TicketKind } from "@/lib/support/ticket-view"
import { KindIcon, KindTag, SupportAvatar } from "./support-bits"
import { SupportRequestPanel } from "./support-request-panel"
import { SupportNewRequestPanel, type SupportEngagementOption } from "./support-new-request-panel"
import { SupportStore, liveSupportSource, useSupportState, type SupportSource } from "./support-store"

/*
 * Support (.claude/plans/app-design-refinements.md, section 14): the firm's requests to the Firma team in
 * the standard table, with Open, Resolved and All views; a request opens in the right pane with its
 * conversation, and New request opens there too, beside the list. Last update says whose turn it is.
 * `source` is the app's API unless the tour passes its demo data.
 *
 * `side="firma"` is the Firma team's view of every firm's requests (/system/customer-success): no New
 * request, each request names its firm, and it's the team's turn when the firm spoke last.
 */

const VIEWS: { id: View; label: string }[] = [
    { id: "open", label: "Open" },
    { id: "resolved", label: "Resolved" },
    { id: "all", label: "All" },
]

const KINDS: TicketKind[] = ["BUG", "REQUEST", "ENQUIRY"]
type Sort = "updated" | "created"

export function SupportView({
    firmSlug,
    firmName,
    myEmail,
    engagements,
    source,
    engagementHrefTemplate,
    side = "firm",
    bare = false,
}: {
    /** The firm whose requests these are; null on the Firma team's view of every firm. */
    firmSlug: string | null
    firmName: string
    myEmail: string | null
    /** The firm's engagements the viewer can see, for New request's Where. */
    engagements: SupportEngagementOption[]
    source?: SupportSource
    /** Where a request's engagement opens, with {client} and {engagement} for the slugs. */
    engagementHrefTemplate?: string
    side?: SupportSide
    /** No page heading: the page around it has its own (the Firma team's /system page). */
    bare?: boolean
}) {
    const firma = side === "firma"
    const [store] = useState(() => new SupportStore(source ?? liveSupportSource(firmSlug)))
    const engagementHref = useCallback(
        (clientSlug: string, engagementSlug: string) =>
            engagementHrefTemplate ? engagementHrefTemplate.replace("{client}", clientSlug).replace("{engagement}", engagementSlug) : null,
        [engagementHrefTemplate]
    )
    const { tickets, loading, error, draft } = useSupportState(store)
    const rightPane = useRightPane()
    const { addToast } = useToast()
    const searchParams = useSearchParams()

    const [view, setView] = useState<View>("open")
    const [kinds, setKinds] = useState<Set<TicketKind>>(new Set())
    const [mineOnly, setMineOnly] = useState(false)
    const [sort, setSort] = useState<Sort>("updated")
    const [query, setQuery] = useState("")
    const [searching, setSearching] = useState(false)
    const [openTicket, setOpenTicket] = useState<string | null>(null)
    const dirtyRef = useRef(false)

    useEffect(() => {
        void store.load()
    }, [store])

    const counts = useMemo(
        () => Object.fromEntries(VIEWS.map((v) => [v.id, tickets.filter((t) => inView(t.status, v.id)).length])) as Record<View, number>,
        [tickets]
    )

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        const at = (t: SupportTicket) => (sort === "updated" ? lastUpdate(t, myEmail, side).at : t.createdAt)
        return tickets
            .filter((t) => inView(t.status, view))
            .filter((t) => kinds.size === 0 || kinds.has(t.kind))
            .filter((t) => !mineOnly || (!!myEmail && t.raisedBy?.email?.toLowerCase() === myEmail.toLowerCase()))
            .filter((t) => !q || `${t.ticketNumber} ${t.title} ${t.body}`.toLowerCase().includes(q))
            .sort((a, b) => at(b).localeCompare(at(a)))
    }, [tickets, view, kinds, mineOnly, query, sort, myEmail, side])

    // The pane's prev/next and copy link read the list as it is now, not as it was when the pane opened.
    const shownRef = useRef(shown)
    shownRef.current = shown

    const linkTo = (ticketNumber: string) => {
        const url = new URL(window.location.href)
        url.searchParams.set("ticket", ticketNumber)
        return url.toString()
    }

    const showTicket = useCallback(
        (ticketNumber: string) => {
            const step = (dir: 1 | -1) => {
                const list = shownRef.current
                const i = list.findIndex((t) => t.ticketNumber === ticketNumber)
                const next = list[i + dir]
                if (next) showTicket(next.ticketNumber)
            }
            setOpenTicket(ticketNumber)
            rightPane.setBeforeClose(null)
            rightPane.setTitle(ticketNumber)
            rightPane.setHeaderIcon(<LifeBuoy className="h-4 w-4" />)
            rightPane.setHeaderSubtitle("")
            rightPane.setHeaderActions(
                <>
                    <Hint label="Copy link" side="bottom">
                        <button
                            type="button"
                            aria-label="Copy link to this request"
                            onClick={() => {
                                void navigator.clipboard.writeText(linkTo(ticketNumber))
                                addToast({ type: "success", title: "Link copied" })
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg"
                        >
                            <Link2 className="h-4 w-4" />
                        </button>
                    </Hint>
                    <Hint label="Previous request" side="bottom">
                        <button type="button" aria-label="Previous request" onClick={() => step(-1)} className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg">
                            <ChevronUp className="h-4 w-4" />
                        </button>
                    </Hint>
                    <Hint label="Next request" side="bottom">
                        <button type="button" aria-label="Next request" onClick={() => step(1)} className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg">
                            <ChevronDown className="h-4 w-4" />
                        </button>
                    </Hint>
                </>
            )
            rightPane.setContent(<SupportRequestPanel store={store} ticketNumber={ticketNumber} myEmail={myEmail} engagementHref={engagementHref} side={side} />)
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rightPane, store, myEmail, engagementHref, side]
    )

    const newRequest = () => {
        setOpenTicket(null)
        dirtyRef.current = false
        rightPane.setTitle("New request")
        rightPane.setHeaderIcon(<Plus className="h-4 w-4" />)
        rightPane.setHeaderSubtitle("")
        rightPane.setHeaderActions(null)
        rightPane.setContent(
            <SupportNewRequestPanel
                store={store}
                firmName={firmName}
                engagements={engagements}
                onSent={(ticketNumber) => {
                    setView("open")
                    showTicket(ticketNumber)
                }}
                onCancel={() => {
                    if (!dirtyRef.current || window.confirm("Discard this request?")) rightPane.clearPane()
                }}
                onDirtyChange={(d) => { dirtyRef.current = d }}
            />
        )
        // Closing with something typed asks first; nothing typed, it just closes.
        rightPane.setBeforeClose(() => !dirtyRef.current || window.confirm("Discard this request?"))
    }

    // The pane closed (or showed something else): forget which request was open, and any draft.
    const paneOpen = !!rightPane.content
    useEffect(() => {
        if (!paneOpen) {
            setOpenTicket(null)
            store.setDraft(null)
        }
    }, [paneOpen, store])

    // ?ticket=TKT-… (a copied link) opens that request once the list has loaded.
    const ticketParam = searchParams?.get("ticket") ?? null
    const openedParam = useRef(false)
    useEffect(() => {
        if (loading || openedParam.current || !ticketParam) return
        openedParam.current = true
        const t = store.find(ticketParam)
        if (t) {
            setView(inView(t.status, "open") ? "open" : "resolved")
            showTicket(ticketParam)
        }
    }, [loading, ticketParam, store, showTicket])

    const toggle = (id: View) =>
        cn(
            "flex items-center gap-1.5 rounded-control px-2 py-1 text-small transition-colors",
            view === id ? "bg-surface-selected text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
        )

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col">
            {!bare && <PageHeading
                icon={<LifeBuoy />}
                title={firma ? "Customer requests" : "Support"}
                description={
                    firma
                        ? "Every firm's requests to Firma. Your replies reach whoever raised it by email and in their Inbox."
                        : "Requests from your firm to the Firma team. We reply here and by email."
                }
                actions={
                    firma ? undefined : <button
                        type="button"
                        onClick={newRequest}
                        className="inline-flex h-8 items-center gap-1.5 rounded-control bg-primary px-3 text-small font-medium text-white transition-[filter] hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/40"
                    >
                        <Plus className="h-4 w-4" /> New request
                    </button>
                }
                className="pb-4"
            />}

            <div className="mb-2 flex min-h-8 flex-wrap items-center gap-1" data-demo-tour="support-requests">
                <div className="flex items-center gap-0.5" role="tablist" aria-label="Show">
                    {VIEWS.map((v) => (
                        <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={toggle(v.id)}>
                            {v.label}
                            <span className="tabular-nums text-fg-subtle">{counts[v.id]}</span>
                        </button>
                    ))}
                </div>
                <span className="flex-1" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <FilterPill
                            icon={<TagIcon />}
                            label="Type"
                            value={kinds.size ? Array.from(kinds).map((k) => TICKET_KIND_LABEL[k]).join(", ") : undefined}
                            onClear={kinds.size ? () => setKinds(new Set()) : undefined}
                        />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        {KINDS.map((k) => (
                            <FilterMenuRow
                                key={k}
                                multi
                                icon={<KindIcon kind={k} />}
                                selected={kinds.has(k)}
                                onSelect={() => {
                                    setKinds((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(k)) next.delete(k)
                                        else next.add(k)
                                        return next
                                    })
                                }}
                            >
                                {TICKET_KIND_LABEL[k]}
                            </FilterMenuRow>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                {!firma && <FilterPill icon={<UserRound />} label="Raised by me" pressed={mineOnly} onClick={() => setMineOnly((v) => !v)} />}
                <FilterPill
                    icon={<ArrowDownUp />}
                    label="Sort"
                    value={sort === "updated" ? "Last update" : "Newest"}
                    neutral
                    onClick={() => setSort((s) => (s === "updated" ? "created" : "updated"))}
                />
                <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />
                {searching ? (
                    <span className="flex h-7 items-center gap-1.5 rounded-control border border-line px-2">
                        <Search aria-hidden className="h-3.5 w-3.5 text-fg-subtle" />
                        <input
                            autoFocus
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    setQuery("")
                                    setSearching(false)
                                }
                            }}
                            placeholder="Search requests"
                            aria-label="Search requests"
                            className="w-40 bg-transparent text-small text-fg outline-none placeholder:text-fg-subtle"
                        />
                        <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); setSearching(false) }} className="text-fg-subtle hover:text-fg">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </span>
                ) : (
                    <Hint label="Search requests" side="bottom">
                        <button type="button" aria-label="Search requests" onClick={() => setSearching(true)} className="flex h-7 w-7 items-center justify-center rounded-control text-fg-muted hover:bg-surface-hover hover:text-fg">
                            <Search className="h-4 w-4" />
                        </button>
                    </Hint>
                )}
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-fg-subtle"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : error ? (
                <p className="px-2 py-6 text-small text-danger">{error}</p>
            ) : (
                // Columns give way as the table narrows (the right pane takes room too): Where first, then
                // Raised by and Type; the request, its status and whose turn it is always stay.
                <div className="@container/support">
                <NotionTable className="table-fixed">
                    <NotionTableHeader>
                        <NotionTableHead icon={<Hash />} className="w-[112px]">ID</NotionTableHead>
                        <NotionTableHead icon={<Type />}>Request</NotionTableHead>
                        <NotionTableHead icon={<TagIcon />} className="hidden w-[136px] @[48rem]/support:table-cell">Type</NotionTableHead>
                        <NotionTableHead icon={<CircleDot />} className="w-[124px]">Status</NotionTableHead>
                        <NotionTableHead icon={<Briefcase />} className="hidden w-[200px] @[76rem]/support:table-cell">Where</NotionTableHead>
                        <NotionTableHead icon={<UserRound />} className="hidden w-[156px] @[58rem]/support:table-cell">Raised by</NotionTableHead>
                        <NotionTableHead icon={<Clock />} className="hidden w-[150px] @[34rem]/support:table-cell">Last update</NotionTableHead>
                    </NotionTableHeader>
                    <NotionTableBody>
                        {draft !== null && (
                            <NotionTableRow className="bg-action/[0.05] hover:bg-action/[0.05]">
                                <NotionTableCell className="text-small text-fg-subtle">New</NotionTableCell>
                                <NotionTableCell><span className="block truncate">{draft}</span></NotionTableCell>
                                <NotionTableCell className="hidden @[48rem]/support:table-cell" />
                                <NotionTableCell className="text-small text-fg-subtle">Draft</NotionTableCell>
                                <NotionTableCell className="hidden @[76rem]/support:table-cell" />
                                <NotionTableCell className="hidden @[58rem]/support:table-cell" />
                                <NotionTableCell className="hidden text-small text-fg-subtle @[34rem]/support:table-cell">Not sent yet</NotionTableCell>
                            </NotionTableRow>
                        )}
                        {shown.length === 0 && draft === null ? (
                            <tr>
                                <td colSpan={7} className="border-b border-line px-2.5 py-3 text-small text-fg-muted">
                                    {tickets.length === 0
                                        ? "No requests yet. Ask the Firma team anything with New request."
                                        : view === "open" && !query && kinds.size === 0 && !mineOnly
                                            ? "Nothing open. Everything you raised has been answered."
                                            : "No requests match."}
                                </td>
                            </tr>
                        ) : (
                            shown.map((t) => {
                                const last = lastUpdate(t, myEmail, side)
                                const where = wherePath(t)
                                return (
                                    <NotionTableRow key={t.ticketNumber} selected={openTicket === t.ticketNumber} onClick={() => showTicket(t.ticketNumber)}>
                                        <NotionTableCell className="text-small tabular-nums text-fg-muted">{t.ticketNumber}</NotionTableCell>
                                        <NotionTableCell>
                                            <span className="flex min-w-0 items-center gap-2">
                                                {t.auto && (
                                                    <Hint label="Filed automatically when an action failed">
                                                        <Zap aria-label="Filed automatically" className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                                                    </Hint>
                                                )}
                                                <button type="button" className="min-w-0 truncate text-left outline-none focus-visible:underline">{t.title}</button>
                                                {t.comments.length > 0 && (
                                                    <span className="flex shrink-0 items-center gap-0.5 text-caption font-normal text-fg-subtle" aria-label={`${t.comments.length} replies`}>
                                                        <MessageCircle aria-hidden className="h-3 w-3" />{t.comments.length}
                                                    </span>
                                                )}
                                            </span>
                                        </NotionTableCell>
                                        <NotionTableCell className="hidden @[48rem]/support:table-cell"><KindTag kind={t.kind} /></NotionTableCell>
                                        <NotionTableCell><StatusPill kind="ticket" status={t.status} /></NotionTableCell>
                                        <NotionTableCell className="hidden @[76rem]/support:table-cell">
                                            <span className="block truncate text-small text-fg-muted">
                                                {/* The Firma team sees every firm's, so each names its firm first. */}
                                                {firma && t.firm && (t.client || t.engagement) && <>{t.firm.name}<span className="text-fg-subtle"> · </span></>}
                                                {where[0]}{where[1] && <><span className="text-fg-subtle"> › </span>{where[1]}</>}
                                            </span>
                                        </NotionTableCell>
                                        <NotionTableCell className="hidden @[58rem]/support:table-cell">
                                            <span className="flex min-w-0 items-center gap-1.5 text-small">
                                                <SupportAvatar name={t.raisedBy?.name} auto={t.auto} />
                                                <span className="truncate">{t.auto ? "Automatic" : t.raisedBy?.name ?? "Unknown"}</span>
                                            </span>
                                        </NotionTableCell>
                                        <NotionTableCell className="hidden @[34rem]/support:table-cell">
                                            {/* Your side's turn on an open request (Firma spoke last, or on the Firma side the firm did): it reads darker. */}
                                            <span className="flex min-w-0 items-center gap-1 whitespace-nowrap text-small">
                                                <span className={cn("font-medium", last.yourTurn ? "text-fg" : "text-fg-muted")}>{last.who}</span>
                                                <span className="text-fg-subtle">·</span>
                                                <RelativeDateTime date={last.at} textClassName="text-small text-fg-muted" iconClassName="hidden" />
                                            </span>
                                        </NotionTableCell>
                                    </NotionTableRow>
                                )
                            })
                        )}
                    </NotionTableBody>
                </NotionTable>
                </div>
            )}
        </div>
    )
}
