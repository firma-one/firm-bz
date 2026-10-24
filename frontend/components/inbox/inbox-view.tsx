"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { formatDistanceToNowStrict, format } from "date-fns"
import { AlarmClock, ArrowLeft, ArrowRight, Bell, Briefcase, Building2, Check, CheckCheck, ChevronRight, ExternalLink, FileText, HardDrive, Inbox as InboxIcon, Loader2, Mail, MessagesSquare, Users } from "lucide-react"
import { ClientIcon } from "@/components/ui/client-icon"
import { DeliverableGlyph } from '@/components/ui/deliverable-icon'
import { getAllUserReminders, markReminderDone, type ReminderWithContext } from "@/lib/actions/user-reminders"
import { getNeedsYou } from "@/lib/actions/inbox"
import type { NeedsYouItem } from "@/lib/home/my-work"
import { Button } from "@/components/ui/button"
import { EmptyPanel } from "@/components/ui/empty-panel"
import { PageHeading } from "@/components/ui/page-heading"
import { Tag } from "@/components/ui/tag"
import { Hint } from "@/components/ui/tooltip"
import { Kbd } from "@/components/ui/kbd"
import { useToast } from "@/components/ui/toast"
import { StatusIcon } from "@/components/ui/status-icon"
import { cn, formatFullDate } from "@/lib/utils"
import type { TagColor } from "@/lib/ui/status-colors"
import { FirmFilter, UnavailableFirmsNote } from "@/components/home/firm-filter"
import type { UnavailableFirm } from "@/lib/home/home-firms"
import { needsYouLists, sortNotifications, INBOX_CHANGED_EVENT, type ApiNotification, type InboxEntity, type InboxItem, type InboxMention } from "./inbox-items"

function notifyChanged() {
    window.dispatchEvent(new Event(INBOX_CHANGED_EVENT))
}

/** Done for a reminder; an update asked nothing of you, so it's dismissed. Same check, same place, same E. */
function doneVerb(item: InboxItem): "Done" | "Dismiss" {
    return item.source === "notification" ? "Dismiss" : "Done"
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
    client: ClientIcon,
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

/** A name as a chip with its icon, in the icons the app uses for each: sized to the text around it. */
function MentionChip({ mention }: { mention: InboxMention }) {
    const Icon = ENTITY_ICON[mention.kind]
    return (
        <span className="mx-px inline-flex max-w-full items-center gap-[0.3em] rounded-control bg-surface-muted px-[0.35em] align-baseline leading-snug text-fg">
            <Icon aria-hidden className="h-[0.85em] w-[0.85em] shrink-0 text-fg-muted" />
            <span className="min-w-0 break-words">{mention.text}</span>
        </span>
    )
}

const EMAIL = "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+"

/**
 * Text with the names it carries as chips, and any email address as a member's. A text that is
 * only the name (a reminder's title is its engagement's) stays plain: a chip is for a name in a sentence.
 */
function withChips(text: string, mentions: InboxMention[]): React.ReactNode {
    const known = new Map(mentions.filter((m) => m.text.trim() && m.text.trim() !== text.trim()).map((m) => [m.text, m]))
    const names = Array.from(known.keys())
        .sort((a, b) => b.length - a.length)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    const pattern = new RegExp(`(${[...names, EMAIL].join("|")})`, "g")
    const parts = text.split(pattern)
    if (parts.length === 1) return text
    return parts.map((part, i) =>
        i % 2 === 1 ? <MentionChip key={i} mention={known.get(part) ?? { text: part, kind: "member" }} /> : part
    )
}

function ItemTime({ item }: { item: InboxItem }) {
    if (item.source === "reminder") {
        if (!item.dueLabel || !item.at) return null
        if (item.overdue) return <Tag color="red">{item.dueLabel}</Tag>
        return (
            <Hint label={item.dueLabel}>
                <span>{formatFullDate(item.at)}</span>
            </Hint>
        )
    }
    if (!item.at) return null
    return (
        <Hint label={`${formatFullDate(item.at)}, ${format(new Date(item.at), "h:mm a")}`}>
            <time dateTime={item.at} suppressHydrationWarning>
                {formatDistanceToNowStrict(new Date(item.at), { addSuffix: false })}
            </time>
        </Hint>
    )
}

type DueStyle = NonNullable<InboxItem["dueStyle"]>

/** The due chip's color, and the calendar leaf's band: green with time to spare, then amber, orange, red. */
const DUE_TAG: Record<DueStyle, TagColor> = { slate: "gray", amber: "yellow", orange: "orange", red: "red" }
const LEAF_BAND: Record<DueStyle, string> = { slate: "bg-action", amber: "bg-tag-yellow-fg", orange: "bg-tag-orange-fg", red: "bg-tag-red-fg" }

/** A dated reminder's date as a calendar leaf: the month on a band in its due tone, the day large. */
function DateLeaf({ at, tone }: { at: string; tone: DueStyle }) {
    const d = new Date(at)
    return (
        <div aria-hidden className="flex w-14 shrink-0 flex-col overflow-hidden rounded-card bg-surface text-center shadow-card">
            <span className={cn("py-0.5 text-[10px] font-semibold uppercase leading-4 tracking-wider text-white", LEAF_BAND[tone])}>{format(d, "MMM")}</span>
            <span className="pt-1 text-[22px] font-semibold leading-7 tabular-nums text-fg">{format(d, "d")}</span>
            <span className="pb-1.5 text-[10px] leading-3 text-fg-subtle">{format(d, "yyyy")}</span>
        </div>
    )
}

/**
 * The read pane's message: what happened or is due, and when. A dated reminder leads with its date
 * as a calendar leaf, then "Engagement due", the full date and its due chip; the rest say what they
 * are and how long ago.
 */
function ItemMessage({ item }: { item: InboxItem }) {
    if (item.source === "reminder" && item.at) {
        const tone = item.dueStyle ?? "slate"
        return (
            <div className="flex items-center gap-4">
                <DateLeaf at={item.at} tone={tone} />
                <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-ui font-medium text-fg">{item.label}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-fg-muted">
                        <span>{formatFullDate(item.at)}</span>
                        {item.dueLabel && <Tag color={DUE_TAG[tone]}>{item.dueLabel}</Tag>}
                    </p>
                </div>
            </div>
        )
    }
    // An update's body is its message; its type would only restate the title.
    if (item.source === "notification") {
        return (
            <div className="flex flex-col gap-1">
                <p className="whitespace-pre-wrap text-body text-fg">{item.body ? withChips(item.body, item.mentions) : item.label}</p>
                {item.at && (
                    <p className="flex items-center gap-1.5 text-small text-fg-muted">
                        {item.stage && <StatusIcon stage={item.stage} size={13} />}
                        <span><ItemTime item={item} /> ago</span>
                    </p>
                )}
            </div>
        )
    }
    return (
        <div className="flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-ui font-medium text-fg">
                {item.stage && <StatusIcon stage={item.stage} size={14} />}
                {item.label}
            </p>
            {item.source === "work" && item.at && (
                <p className="text-small text-fg-muted">
                    <ItemTime item={item} /> ago
                </p>
            )}
        </div>
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
    /** Done on an update: it leaves the Inbox. */
    dismiss: (notificationId: string) => Promise<void>
    /** Done on a reminder: it leaves your list; the date it watches stays. */
    markDone: (reminderId: string) => Promise<void>
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
        const res = await fetch("/api/notifications?firms=all", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: [id] }),
            // Done can be committed as the tab closes (see the pagehide flush), so let it finish.
            keepalive: true,
        })
        if (!res.ok) throw new Error(`Dismiss failed: ${res.status}`)
    },
    markDone: (id) => markReminderDone(id),
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
 * The selected item's detail is on the right: what it is and where it sits, the message, and an
 * Open named for where it goes. Done (top right, or e; Dismiss on an update) takes the item out of
 * the Inbox only — never the date a reminder watches — and offers Undo; what's waiting on you clears
 * itself once it's dealt with. With several firms on screen each item names its firm. Keyboard:
 * j/k or arrows to move, Enter to open, e for Done.
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
    /** The read pane's chips under the title: the firm (when several share the list), then where it sits. */
    const placeOf = (item: InboxItem): InboxMention[] => {
        const firm = multiFirm && item.firmId ? firmNames.get(item.firmId) : null
        return [...(firm ? [{ text: firm, kind: "firm" as const }] : []), ...item.place]
    }
    const [reminders, setReminders] = useState<ReminderWithContext[]>([])
    const [notifications, setNotifications] = useState<ApiNotification[]>([])
    const [work, setWork] = useState<NeedsYouItem[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedKey, setSelectedKey] = useState<string | null>(null)
    const [showDetailOnMobile, setShowDetailOnMobile] = useState(false)
    /**
     * Items marked done whose Undo is still on screen: gone from the list, not yet from the server.
     * Done is sent when the toast goes without Undo (or as the tab closes), so Undo needs no way back.
     */
    const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
    const pendingRef = useRef(new Map<string, InboxItem>())
    const { addToast } = useToast()
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

    const shownReminders = useMemo(() => reminders.filter((r) => !pending.has(`r:${r.id}`)), [reminders, pending])
    const lists = useMemo(() => needsYouLists(shownIds, work, shownReminders), [shownIds, work, shownReminders])
    // Platform-wide notifications (no firm) show whichever firm is picked, as they always have.
    const notes = useMemo(
        () => sortNotifications(notifications.filter((n) => (!n.firmId || shownIds.has(n.firmId)) && !pending.has(`n:${n.id}`))),
        [notifications, shownIds, pending]
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

    const unpend = useCallback((key: string) => {
        pendingRef.current.delete(key)
        setPending((prev) => {
            const next = new Set(prev)
            next.delete(key)
            return next
        })
    }, [])

    /** Sends a Done whose Undo has passed. Once only: the toast and the pagehide flush may both ask. */
    const commitDone = useCallback(
        async (item: InboxItem) => {
            if (!pendingRef.current.has(item.key)) return
            pendingRef.current.delete(item.key)
            try {
                if (item.source === "reminder") {
                    await source.markDone(item.sourceId)
                    setReminders((prev) => prev.filter((r) => r.id !== item.sourceId))
                } else {
                    await source.dismiss(item.sourceId)
                    setNotifications((prev) => prev.filter((n) => n.id !== item.sourceId))
                }
                notifyChanged()
            } catch {
                addToast({
                    type: "error",
                    title: item.source === "notification" ? "Couldn't dismiss it" : "Couldn't mark it done",
                    message: `${item.title} is back in your Inbox.`,
                })
            } finally {
                unpend(item.key)
            }
        },
        [source, addToast, unpend]
    )

    /** Done: out of the Inbox at once, with Undo; the next item is selected. Work clears itself. */
    const done = useCallback(
        (item: InboxItem) => {
            if (item.source === "work" || pendingRef.current.has(item.key)) return
            const idx = flat.findIndex((i) => i.key === item.key)
            const next = flat[idx + 1] ?? flat[idx - 1] ?? null
            pendingRef.current.set(item.key, item)
            setPending((prev) => new Set(prev).add(item.key))
            setSelectedKey(next?.key ?? null)
            addToast({
                type: "success",
                title: item.source === "notification" ? "Dismissed" : "Done",
                message: item.title,
                duration: 6000,
                action: {
                    label: "Undo",
                    onClick: () => {
                        unpend(item.key)
                        setSelectedKey(item.key)
                    },
                },
                onDismiss: () => void commitDone(item),
            })
        },
        [flat, addToast, unpend, commitDone]
    )

    // Closing the tab while an Undo is on screen still sends that Done.
    useEffect(() => {
        const flush = () => pendingRef.current.forEach((item) => void commitDone(item))
        window.addEventListener("pagehide", flush)
        return () => window.removeEventListener("pagehide", flush)
    }, [commitDone])

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
            if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
            const prev = lastKey.current
            lastKey.current = { key: e.key.toLowerCase(), at: Date.now() }
            if (prev?.key === "g" && Date.now() - prev.at < 1000) return
            if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); moveSelection(1) }
            else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); moveSelection(-1) }
            else if (e.key === "Enter" && selected) { e.preventDefault(); open(selected) }
            else if (e.key === "e" && selected) { e.preventDefault(); done(selected) }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [moveSelection, open, done, selected])

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
                {/* A dot (and bold) means unread, so only Updates have one; a reminder's urgency is its due chip. */}
                {item.source === "notification" && item.unread && <span className="h-2 w-2 rounded-full bg-action" aria-label="Unread" />}
            </span>
            <ItemIcon item={item} className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className={cn("truncate text-ui text-fg", item.source === "notification" && item.unread && "font-semibold")}>{item.title}</span>
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
                            <article key={selected.key} className="flex w-full max-w-3xl flex-col gap-6 p-5 animate-in fade-in-0 duration-ui-fast motion-reduce:animate-none md:p-8">
                                <button
                                    type="button"
                                    onClick={() => setShowDetailOnMobile(false)}
                                    className="flex items-center gap-1 self-start text-small text-fg-muted hover:text-fg lg:hidden"
                                >
                                    <ArrowLeft className="h-4 w-4" /> Inbox
                                </button>
                                {/* What it is and where it sits; Done stays in the same place for every item. */}
                                <header className="flex items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-surface-muted text-fg-muted">
                                        <ItemIcon item={selected} className="h-5 w-5" />
                                    </span>
                                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <h2 className="text-h2 text-fg">{withChips(selected.title, selected.mentions)}</h2>
                                        {placeOf(selected).length > 0 && (
                                            <p className="flex flex-wrap items-center gap-1 text-small" aria-label="Where it sits">
                                                {placeOf(selected).map((m, i) => (
                                                    <span key={m.kind} className="flex items-center gap-1">
                                                        {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 text-fg-subtle" />}
                                                        <MentionChip mention={m} />
                                                    </span>
                                                ))}
                                            </p>
                                        )}
                                    </div>
                                    {selected.source !== "work" && (
                                        <Hint label={`${doneVerb(selected)} · E`} side="bottom">
                                            {/* A task's round check: it fills green on hover, as the item is about to leave. */}
                                            <button
                                                type="button"
                                                aria-label={doneVerb(selected)}
                                                onClick={() => done(selected)}
                                                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg-subtle outline-none transition-colors duration-ui-fast hover:border-action hover:bg-action hover:text-action-fg focus-visible:ring-2 focus-visible:ring-action/30"
                                            >
                                                <Check className="h-4 w-4" strokeWidth={2.25} />
                                            </button>
                                        </Hint>
                                    )}
                                </header>
                                {/* The message, as a card: what it says, then where to go with it. */}
                                <section className="flex flex-col overflow-hidden rounded-card border border-line">
                                    <div className="flex flex-col gap-3 bg-surface-subtle p-4">
                                        <ItemMessage item={selected} />
                                        {selected.body && selected.source !== "notification" && (
                                            <p className="whitespace-pre-wrap text-body text-fg-muted">{withChips(selected.body, selected.mentions)}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                                        {selected.href ? (
                                            <Button size="sm" onClick={() => open(selected)}>
                                                {selected.actionLabel ?? "Open"}
                                                {selected.href.startsWith("/") ? <ArrowRight className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                                            </Button>
                                        ) : (
                                            <span />
                                        )}
                                        {selected.source === "work" ? (
                                            <span className="text-small text-fg-subtle">Leaves your Inbox once it&apos;s dealt with.</span>
                                        ) : (
                                            <span className="hidden items-center gap-1 text-caption text-fg-subtle lg:flex">
                                                <Kbd>J</Kbd><Kbd>K</Kbd> move · <Kbd>↵</Kbd> go to · <Kbd>E</Kbd> {doneVerb(selected).toLowerCase()}
                                            </span>
                                        )}
                                    </div>
                                </section>
                            </article>
                        ) : (
                            <EmptyPanel icon={<InboxIcon />} title="Select an item" />
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
