"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatDistanceToNowStrict, format } from "date-fns"
import { AlarmClock, ArrowLeft, Bell, Briefcase, Building2, CheckCheck, CheckCircle2, EyeOff, ExternalLink, FileText, HardDrive, Inbox as InboxIcon, Loader2, Mail, MessagesSquare, Users } from "lucide-react"
import { DeliverableGlyph } from '@/components/ui/deliverable-icon'
import { getAllUserReminders, hideReminder, markReminderDone, type ReminderWithContext } from "@/lib/actions/user-reminders"
import { getNeedsYou } from "@/lib/actions/inbox"
import type { NeedsYouItem } from "@/lib/home/my-work"
import { Button } from "@/components/ui/button"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { Kbd } from "@/components/ui/kbd"
import { PageHeading } from "@/components/ui/page-heading"
import { Tag } from "@/components/ui/tag"
import { Hint } from "@/components/ui/tooltip"
import { StatusIcon } from "@/components/ui/status-icon"
import { cn } from "@/lib/utils"
import { FirmFilter, UnavailableFirmsNote } from "@/components/home/firm-filter"
import type { UnavailableFirm } from "@/lib/home/home-firms"
import { needsYouLists, sortNotifications, INBOX_CHANGED_EVENT, type ApiNotification, type InboxEntity, type InboxItem } from "./inbox-items"

function notifyChanged() {
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT))
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
}

/**
 * What an item is about, in the icons the app already uses for it: Building2 a firm, Users a client
 * (and the Members tab), Briefcase an engagement, folder-plus a deliverable and FileText a document (as in
 * the calendar), MessagesSquare a comment, Mail an invitation, HardDrive storage. Anything else is a
 * generic alarm clock for a reminder or a bell for a notification.
 */
const ENTITY_ICON: Record<InboxEntity, React.ElementType> = {
    firm: Building2,
    client: Users,
    engagement: Briefcase,
    deliverable: DeliverableGlyph,
    document: FileText,
    comment: MessagesSquare,
    invitation: Mail,
    member: Users,
    storage: HardDrive,
}

function ItemIcon({ item, className }: { item: InboxItem; className?: string }) {
    const Icon = item.entity ? ENTITY_ICON[item.entity] : item.source === "reminder" ? AlarmClock : Bell
    return <Icon className={className} aria-hidden />
}

function ItemTime({ item }: { item: InboxItem }) {
    if (item.source === "reminder") {
        if (!item.dueLabel || !item.at) return null
        if (item.overdue) return <Tag color="red">{item.dueLabel}</Tag>
        return (
            <Hint label={item.dueLabel}>
                <span>{format(new Date(item.at), "MMM d, yyyy")}</span>
            </Hint>
        )
    }
    if (!item.at) return null
    return (
        <Hint label={format(new Date(item.at), "PPpp")}>
            <time dateTime={item.at} suppressHydrationWarning>
                {formatDistanceToNowStrict(new Date(item.at), { addSuffix: false })}
            </time>
        </Hint>
    )
}

/** Needs you: what is waiting on you, then your reminders by date. Updates: notifications, the history. */
type InboxTab = "needs" | "updates"

type Section = { id: string; title: string; icon: React.ReactNode; items: InboxItem[] }

type InboxFirm = { id: string; slug: string; name: string }

/** Where the Inbox reads and writes. The app uses the live one; the public demo passes static data. */
export type InboxSource = {
    /** `needsYou` is Home's list (lib/home/my-work.ts): approvals, client comments, changes requested, review or undated reminders. */
    load: () => Promise<{ reminders: ReminderWithContext[]; notifications: ApiNotification[]; needsYou: NeedsYouItem[] }>
    markRead: (notificationId: string) => Promise<void>
    dismiss: (notificationId: string) => Promise<void>
    markDone: (reminderId: string) => Promise<void>
    hide: (reminderId: string) => Promise<void>
    /** Every firm's notifications, or one firm's. */
    markAllRead: (firmId: string | null) => Promise<void>
}

const LIVE_SOURCE: InboxSource = {
    load: async () => {
        const [reminders, res, needsYou] = await Promise.all([
            getAllUserReminders().catch(() => [] as ReminderWithContext[]),
            fetch("/api/notifications?firms=all")
                .then((r) => (r.ok ? r.json() : { notifications: [] }))
                .catch(() => ({ notifications: [] })),
            getNeedsYou().catch(() => [] as NeedsYouItem[]),
        ])
        return { reminders, notifications: (res.notifications ?? []) as ApiNotification[], needsYou }
    },
    markRead: async (id) => {
        await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [id] }),
        }).catch(() => {})
    },
    dismiss: async (id) => {
        await fetch("/api/notifications?firms=all", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [id] }),
        })
    },
    markDone: (id) => markReminderDone(id),
    hide: (id) => hideReminder(id),
    markAllRead: async (firmId) => {
        await fetch(firmId ? `/api/notifications?firmId=${encodeURIComponent(firmId)}` : "/api/notifications?firms=all", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ markAllRead: true }),
        }).catch(() => {})
    },
}

/**
 * The New UI's unified Inbox at `/d/u/inbox`, across every firm the caller may open
 * (.claude/plans/cross-firm-home-inbox.md) or the one picked with `?firm={slug}`, in two views
 * (.claude/plans/app-design-refinements.md, section 13):
 *  - Needs you: what is waiting on you — Home's Needs you, which is also all the badge counts —
 *    then your dated reminders (overdue, today, upcoming however far out);
 *  - Updates: notifications, newest first, with their unread dots and Mark all read. They never
 *    count toward the badge.
 * The selected item's detail is on the right. With several firms on screen each item names its
 * firm. Keyboard: j/k or arrows to move, Enter to open, e to mark done or dismiss, h to hide a
 * reminder.
 */
export function InboxView({
    firms,
    unavailable = [],
    source = LIVE_SOURCE,
}: {
    firms: InboxFirm[]
    unavailable?: UnavailableFirm[]
    source?: InboxSource
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const selectedFirm = firms.find((f) => f.slug === searchParams?.get("firm")) ?? null
    const shownKey = (selectedFirm ? [selectedFirm] : firms).map((f) => f.id).join(",")
    const shownIds = useMemo(() => new Set(shownKey ? shownKey.split(",") : []), [shownKey])
    const multiFirm = shownIds.size > 1
    const firmNames = useMemo(() => new Map(firms.map((f) => [f.id, f.name])), [firms])
    /** "FirmaOne · Review comment" — only when items from several firms share the list. */
    const labelOf = (item: InboxItem) => {
        const name = multiFirm && item.firmId ? firmNames.get(item.firmId) : null
        return name ? `${name} · ${item.label}` : item.label
    }
    const [reminders, setReminders] = useState<ReminderWithContext[]>([])
    const [notifications, setNotifications] = useState<ApiNotification[]>([])
    const [work, setWork] = useState<NeedsYouItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [showDetailOnMobile, setShowDetailOnMobile] = useState(false)
    const [busy, setBusy] = useState(false)
    // ?tab=updates (or the old ?tab=notifications, where /d/u/notifications lands); anything else is Needs you.
    const tabParam = searchParams?.get("tab")
    const [tab, setTab] = useState<InboxTab>(tabParam === "updates" || tabParam === "notifications" ? "updates" : "needs")

    const listRef = useRef<HTMLDivElement>(null)

    const load = useCallback(async () => {
        const data = await source.load()
        setReminders(data.reminders)
        setNotifications(data.notifications)
        setWork(data.needsYou)
        setLoading(false)
    }, [source])

    useEffect(() => {
        void load()
    }, [load])

    const lists = useMemo(() => needsYouLists(shownIds, work, reminders), [shownIds, work, reminders])
    // Platform-wide notifications (no firm) show whichever firm is picked, as they always have.
    const notes = useMemo(
        () => sortNotifications(notifications.filter((n) => !n.firmId || shownIds.has(n.firmId))),
        [notifications, shownIds]
    )
    const unreadNotes = notes.filter((n) => n.unread).length

    // Needs you leads with what is waiting on you (the badge's count), then reminders by date.
    const sections = useMemo<Section[]>(() => {
        const all: Section[] =
            tab === "updates"
                ? [{ id: "updates", title: unreadNotes > 0 ? `Updates · ${unreadNotes} unread` : "Updates", icon: <Bell className="h-3.5 w-3.5" />, items: notes }]
                : [
                    { id: "needs", title: "Waiting on you", icon: <InboxIcon className="h-3.5 w-3.5" />, items: lists.needsYou },
                    { id: "overdue", title: "Overdue", icon: <AlarmClock className="h-3.5 w-3.5" />, items: lists.overdue },
                    { id: "today", title: "Due today", icon: <AlarmClock className="h-3.5 w-3.5" />, items: lists.today },
                    { id: "upcoming", title: "Upcoming", icon: <AlarmClock className="h-3.5 w-3.5" />, items: lists.upcoming },
                ]
        return all.filter((sec) => sec.items.length > 0)
    }, [lists, notes, unreadNotes, tab])

    const flat = useMemo(() => sections.flatMap((sec) => sec.items), [sections])
    const selected = flat.find((i) => i.key === selectedKey) ?? null

    // Keep a selection on desktop so the detail pane is never empty while there is something to show.
    useEffect(() => {
        if (!loading && !selected && flat.length > 0) setSelectedKey(flat[0].key)
    }, [loading, selected, flat])

    const markRead = useCallback(async (item: InboxItem) => {
        if (item.source !== "notification" || !item.unread) return
        setNotifications((prev) => prev.map((n) => (n.id === item.sourceId ? { ...n, readAt: new Date().toISOString() } : n)))
        await source.markRead(item.sourceId)
        notifyChanged()
    }, [source])

    const select = useCallback(
        (item: InboxItem) => {
            setSelectedKey(item.key)
            setShowDetailOnMobile(true)
            void markRead(item)
        },
        [markRead]
    )

    const moveSelection = useCallback(
        (dir: 1 | -1) => {
            if (flat.length === 0) return
            const idx = flat.findIndex((i) => i.key === selectedKey)
            const next = flat[Math.min(flat.length - 1, Math.max(0, idx + dir))]
            if (next) {
                select(next)
                listRef.current?.querySelector(`[data-key="${CSS.escape(next.key)}"]`)?.scrollIntoView({ block: "nearest" })
            }
        },
        [flat, selectedKey, select]
    )

    const open = useCallback(
        (item: InboxItem) => {
            if (!item.href) return
            void markRead(item)
            if (item.href.startsWith("/")) router.push(item.href)
            else window.open(item.href, "_blank", "noopener")
        },
        [markRead, router]
    )

    /** Done (reminder) or dismiss (notification) — removes it and selects the next item. Work clears itself. */
    const complete = useCallback(
        async (item: InboxItem) => {
            if (item.source === "work") return
            setBusy(true)
            const idx = flat.findIndex((i) => i.key === item.key)
            const next = flat[idx + 1] ?? flat[idx - 1] ?? null
            try {
                if (item.source === "reminder") {
                    await source.markDone(item.sourceId)
                    setReminders((prev) => prev.filter((r) => r.id !== item.sourceId))
                } else {
                    await source.dismiss(item.sourceId)
                    setNotifications((prev) => prev.filter((n) => n.id !== item.sourceId))
                }
                setSelectedKey(next?.key ?? null)
                notifyChanged()
            } finally {
                setBusy(false)
            }
        },
        [flat, source]
    )

    const hide = useCallback(
        async (item: InboxItem) => {
            if (item.source !== "reminder") return
            setBusy(true)
            const idx = flat.findIndex((i) => i.key === item.key)
            const next = flat[idx + 1] ?? flat[idx - 1] ?? null
            try {
                await source.hide(item.sourceId)
                setReminders((prev) => prev.map((r) => (r.id === item.sourceId ? { ...r, hiddenAt: new Date().toISOString() } : r)))
                setSelectedKey(next?.key ?? null)
                notifyChanged()
            } finally {
                setBusy(false)
            }
        },
        [flat, source]
    )

    // Marks what the list shows: every firm, or only the picked one's.
    const markAllRead = useCallback(async () => {
        const now = new Date().toISOString()
        setNotifications((prev) =>
            prev.map((n) => (n.readAt || (selectedFirm && n.firmId !== selectedFirm.id) ? n : { ...n, readAt: now }))
        )
        await source.markAllRead(selectedFirm?.id ?? null)
        notifyChanged()
    }, [selectedFirm, source])

    // The shell's "G then <letter>" navigation shares h/i/… with this list; a key straight after G
    // belongs to the shell, not the Inbox.
    const lastKey = useRef<{ key: string; at: number } | null>(null)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || busy) return
            const prev = lastKey.current
            lastKey.current = { key: e.key.toLowerCase(), at: Date.now() }
            if (prev?.key === "g" && Date.now() - prev.at < 1000) return
            if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); moveSelection(1) }
            else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); moveSelection(-1) }
            else if (e.key === "Enter" && selected) { e.preventDefault(); open(selected) }
            else if (e.key === "e" && selected) { e.preventDefault(); void complete(selected) }
            else if (e.key === "h" && selected?.source === "reminder") { e.preventDefault(); void hide(selected) }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [moveSelection, open, complete, hide, selected, busy])

    const renderRow = (item: InboxItem) => (
        <button
            key={item.key}
            data-key={item.key}
            type="button"
            onClick={() => select(item)}
            onDoubleClick={() => open(item)}
            className={cn(
                "flex w-full min-w-0 items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors hover:bg-surface-hover",
                item.key === selectedKey && "bg-surface-selected hover:bg-surface-selected"
            )}
        >
            <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                {item.unread && <span className={cn("h-2 w-2 rounded-full", item.overdue ? "bg-danger" : "bg-action")} aria-label="Needs attention" />}
            </span>
            <ItemIcon item={item} className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className={cn("truncate text-ui text-fg", item.unread && "font-semibold")}>{item.title}</span>
                    <span className="shrink-0 text-caption font-normal text-fg-subtle">
                        <ItemTime item={item} />
                    </span>
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-small text-fg-muted">
                    {item.stage && <StatusIcon stage={item.stage} size={13} />}
                    <span className="truncate">{labelOf(item)}</span>
                </span>
            </span>
        </button>
    )

    return (
        <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-col">
            <PageHeading
                icon={<InboxIcon />}
                title="Inbox"
                description={selectedFirm?.name}
                className="pb-4"
                actions={
                    <>
                        {tab === "updates" && unreadNotes > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => void markAllRead()}>
                                <CheckCheck className="h-4 w-4" /> Mark all read
                            </Button>
                        )}
                        <FirmFilter firms={firms} selected={selectedFirm?.slug ?? null} />
                    </>
                }
            >
                <UnavailableFirmsNote firms={unavailable} />
            </PageHeading>

            <div className="mb-3 flex items-center gap-0.5" role="tablist" aria-label="Show">
                {([
                    ["needs", "Needs you", lists.needsYou.length],
                    ["updates", "Updates", unreadNotes],
                ] as [InboxTab, string, number][]).map(([id, label, count]) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => { setTab(id); setSelectedKey(null) }}
                        className={cn(
                            "flex items-center gap-1.5 rounded-control px-2 py-1 text-small transition-colors",
                            tab === id ? "bg-surface-selected text-fg" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
                        )}
                    >
                        {label}
                        {(id === "needs" || count > 0) && <span className="tabular-nums text-fg-subtle">{count}</span>}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex flex-1 items-center justify-center py-16 text-fg-subtle">
                    <Loader2 className="h-5 w-5 animate-spin" />
                </div>
            ) : flat.length === 0 ? (
                <EmptyPanel
                    icon={<InboxIcon />}
                    title={tab === "updates" ? "No updates" : "You're all caught up"}
                    description={
                        tab === "updates"
                            ? "Notifications about your engagements land here."
                            : "Approvals, client comments, changes requested, review requests and your reminders show up here."
                    }
                />
            ) : (
                <div className="flex min-h-[28rem] flex-1 overflow-hidden rounded-card border border-line">
                    {/* List */}
                    <div
                        ref={listRef}
                        className={cn(
                            "flex w-full min-w-0 flex-col gap-4 overflow-y-auto p-2 lg:w-[22rem] lg:shrink-0 lg:border-r lg:border-line",
                            showDetailOnMobile && "hidden lg:flex"
                        )}
                    >
                        {sections.map((sec) => (
                            <div key={sec.id} className="flex flex-col gap-px">
                                <p className="flex items-center gap-1.5 px-2 pb-1 text-caption text-fg-subtle">
                                    {sec.icon} {sec.title}{sec.id === "updates" ? "" : ` · ${sec.items.length}`}
                                </p>
                                {sec.items.map(renderRow)}
                            </div>
                        ))}
                    </div>

                    {/* Detail */}
                    <div className={cn("min-w-0 flex-1 flex-col overflow-y-auto", showDetailOnMobile ? "flex" : "hidden lg:flex")}>
                        {selected ? (
                            <div className="flex flex-col gap-5 p-5 md:p-8">
                                <button
                                    type="button"
                                    onClick={() => setShowDetailOnMobile(false)}
                                    className="flex items-center gap-1 self-start text-small text-fg-muted hover:text-fg lg:hidden"
                                >
                                    <ArrowLeft className="h-4 w-4" /> Inbox
                                </button>
                                <div className="flex flex-col gap-2">
                                    <span className="flex flex-wrap items-center gap-2 text-small text-fg-muted">
                                        <ItemIcon item={selected} className="h-4 w-4" />
                                        {labelOf(selected)}
                                        <span aria-hidden>·</span>
                                        <ItemTime item={selected} />
                                    </span>
                                    <h2 className="text-h2 text-fg">{selected.title}</h2>
                                    {selected.body && <p className="whitespace-pre-wrap text-body text-fg-muted">{selected.body}</p>}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {selected.href && (
                                        <Button onClick={() => open(selected)}>
                                            <ExternalLink className="h-4 w-4" /> {selected.actionLabel ?? "Open"}
                                        </Button>
                                    )}
                                    {selected.source !== "work" && (
                                        <Button variant="outline" disabled={busy} onClick={() => void complete(selected)}>
                                            <CheckCircle2 className="h-4 w-4" /> {selected.source === "reminder" ? "Mark done" : "Dismiss"}
                                        </Button>
                                    )}
                                    {selected.source === "reminder" && (
                                        <Button variant="ghost" disabled={busy} onClick={() => void hide(selected)}>
                                            <EyeOff className="h-4 w-4" /> Hide
                                        </Button>
                                    )}
                                </div>
                                {selected.source === "work" && (
                                    <p className="text-small text-fg-muted">Leaves your Inbox once it&apos;s dealt with.</p>
                                )}
                                <p className="hidden items-center gap-1.5 text-caption text-fg-subtle lg:flex">
                                    <Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>↵</Kbd> open
                                    {selected.source !== "work" && <> · <Kbd>E</Kbd> {selected.source === "reminder" ? "done" : "dismiss"}</>}
                                    {selected.source === "reminder" && <> · <Kbd>H</Kbd> hide</>}
                                </p>
                            </div>
                        ) : (
                            <EmptyPanel icon={<InboxIcon />} title="Select an item" />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
