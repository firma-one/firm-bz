"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { AlertCircle, Sparkles } from "lucide-react"
import { Brio } from "@/components/ui/brio"
import { LoadingAnnouncement, ShimmerBar } from "@/components/ui/shimmer"
import { Hint } from "@/components/ui/tooltip"
import { useOptionalShellData } from "@/components/shell/shell-data-context"
import { ASSISTANT, ASSISTANT_POLICY, BRIO_GREEN } from "@/lib/ai/assistant"
import { BRIO_DAY_FAILED, BRIO_TOO_SLOW, BRIO_UNREACHABLE_RETRY } from "@/lib/ai/brio-failure"
import { AI_TIMEOUT_MS, AiTimeoutError, fetchWithTimeout } from "@/lib/ai/fetch-timeout"
import type { MyWork } from "@/lib/home/my-work"
import type { DayBriefResponse, DayBriefShown } from "@/app/api/me/day-brief/route"
import { cn } from "@/lib/utils"
import { HomeEmptyLine, HomeSection } from "./home-section"

/*
 * "Your day": Brio's few lines at the top of Home, above Needs you
 * (.claude/plans/brio-features-round-2.md, §3.2). Fetched after the page renders, so the rest of Home
 * never waits for it: a quiet skeleton while it loads, Brio's failure words with Try again if it
 * can't be written. Its heading is a Home section's, with the Brio mark where the icon goes.
 *
 * Nothing to brief reads as one quiet line, like every other Home section that's empty. With no
 * model configured the section is left out.
 */

/** The Needs you section's anchor (#needs-you), kept for links into Home. */
export const NEEDS_YOU_ANCHOR = "needs-you"

/**
 * Where the brief's items are: the sections below it, which the person scrolls to. Agenda too, as the
 * brief also covers what is due this week.
 */
export const DAY_BRIEF_ITEMS_LINE = "The items are below, in Needs you and Agenda."

/**
 * Rewrite's tooltip: what it costs, and whose credits. Home spans every firm, so a rewrite is billed to
 * the firm selected in the sidebar (app/api/me/day-brief/route.ts).
 */
export function rewriteHint(firmName?: string | null): string {
    return firmName ? `Uses 1 ${firmName} credit, only when your items have changed` : "1 credit, only when your items have changed"
}

/** What Rewrite says when nothing has changed since the brief was written. */
export const DAY_BRIEF_UNCHANGED = `Nothing has changed since ${ASSISTANT.name} wrote this.`

/** What the section says when there is nothing to brief. */
export const DAY_BRIEF_EMPTY = "Nothing needs you today and your week is clear."

// ─── Text ────────────────────────────────────────────────────────────────────

/**
 * The brief as paragraphs (three at most): the first paragraph's first **phrase** in bold, any other
 * asterisks dropped. Plain text otherwise; nothing in it is rendered as HTML.
 */
export function briefParagraphs(text: string): ReactNode[] {
    return text
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
        .map((p, i) => {
            if (i === 0) {
                const m = p.match(/^([\s\S]*?)\*\*([\s\S]+?)\*\*([\s\S]*)$/)
                if (m) {
                    return (
                        <>
                            {m[1].replace(/\*\*/g, "")}
                            <strong className="font-semibold">{m[2]}</strong>
                            {m[3].replace(/\*\*/g, "")}
                        </>
                    )
                }
            }
            return p.replace(/\*\*/g, "")
        })
}

/** "Written 8:02 AM · Thursday, November 12", in the viewer's own locale and timezone. */
export function writtenLabel(iso: string): string {
    const at = new Date(iso)
    if (Number.isNaN(at.getTime())) return "Written today"
    const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(at)
    const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(at)
    return `Written ${time} · ${day}`
}

// ─── Layout ──────────────────────────────────────────────────────────────────

/** Rewrite, as the sparkle at the heading's right: the brief on screen, and whether one is being written. */
type RewriteControl = {
    rewriting: boolean
    onRewrite: () => void
    /** The firm a rewrite is billed to, for the tooltip. */
    firmName?: string | null
}

/** A 28px icon button, as on the Overview's Summary and the RAID log. */
const ICON_BUTTON =
    "inline-flex h-7 w-7 items-center justify-center rounded-control text-fg-muted transition-colors duration-ui-fast hover:bg-surface-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"

function RewriteButton({ rewriting, onRewrite, firmName }: RewriteControl) {
    return (
        // The morning brief is free; a rewrite is a choice, so it costs a credit, and only when the
        // items changed (an unchanged day answers without asking Brio).
        <Hint
            label={
                <span className="flex flex-col gap-0.5">
                    <span>
                        Rewrite with <Brio />
                    </span>
                    <span className="opacity-70">{rewriteHint(firmName)}</span>
                </span>
            }
        >
            {/* aria-disabled, not disabled, while rewriting: a disabled button shows no tooltip. */}
            <button
                type="button"
                onClick={() => {
                    if (!rewriting) onRewrite()
                }}
                aria-disabled={rewriting}
                aria-label={`Rewrite with ${ASSISTANT.name}`}
                className={cn(ICON_BUTTON, rewriting && "cursor-default hover:bg-transparent")}
            >
                {/* Brio's sparkle, in Brio's green. */}
                <Sparkles aria-hidden className={cn("h-4 w-4", rewriting && "animate-pulse")} style={{ color: BRIO_GREEN }} />
            </button>
        </Hint>
    )
}

function DayBriefSection({ written, rewrite, children }: { written?: string | null; rewrite?: RewriteControl; children: ReactNode }) {
    const label = rewrite?.rewriting ? `${ASSISTANT.name} is rewriting…` : written
    return (
        <HomeSection
            // The Brio mark in the icon's place. The slot sizes icons to 16px; the sparkle keeps its own
            // size beside the name.
            icon={<Brio className="text-ui text-action" iconClassName="!h-[0.82em] !w-[0.82em]" />}
            title="Your day"
            actions={
                label || rewrite ? (
                    // When it was written, then the sparkle that rewrites it, as on the Overview's Summary.
                    <span className="flex items-center gap-1.5">
                        {label && <span className="text-caption font-normal text-fg-muted">{label}</span>}
                        {rewrite && <RewriteButton {...rewrite} />}
                    </span>
                ) : undefined
            }
        >
            {children}
        </HomeSection>
    )
}

type Note = { tone: "info" | "error"; text: string }

/** Words with a Try again button after them don't also need to say "Try again.". */
const withoutTryAgain = (words: string) => words.replace(/\s*Try again\.$/, "")

function DayBriefCard({ brief, rewriting, note }: { brief: DayBriefShown; rewriting: boolean; note: Note | null }) {
    return (
        <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface px-4 py-3.5 text-ui text-fg" aria-busy={rewriting}>
            <div className={cn("flex flex-col gap-2.5 transition-opacity", rewriting && "opacity-60")}>
                {briefParagraphs(brief.text).map((p, i) => (
                    <p key={i}>{p}</p>
                ))}
            </div>
            {/* No link down to them: the sections are right below, a scroll away. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-caption font-normal text-fg-muted">
                <span>{DAY_BRIEF_ITEMS_LINE}</span>
                <span className="ml-auto">{ASSISTANT_POLICY.short}</span>
            </div>
            {note && (
                <p role={note.tone === "error" ? "alert" : "status"} className="flex items-center gap-1.5 text-small text-fg-muted">
                    {note.tone === "error" && <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-danger" />}
                    {note.text}
                </p>
            )}
        </div>
    )
}

function DayBriefSkeleton() {
    return (
        <div className="flex flex-col gap-2.5 rounded-card border border-line bg-surface px-4 py-4" aria-busy="true">
            <LoadingAnnouncement label={`${ASSISTANT.name} is writing your day`} />
            <ShimmerBar className="w-full" />
            <ShimmerBar className="w-[92%]" />
            <ShimmerBar className="w-[64%]" />
        </div>
    )
}

function DayBriefFailed({ reason, onRetry }: { reason: string; onRetry: () => void }) {
    return (
        <p role="alert" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2 text-small text-fg-muted">
            <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-danger" />
            <span>{withoutTryAgain(reason)}</span>
            <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-control font-medium text-action hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/30"
            >
                Try again
            </button>
        </p>
    )
}

// ─── Live ────────────────────────────────────────────────────────────────────

type State =
    | { kind: "loading" }
    | { kind: "brief"; brief: DayBriefShown }
    | { kind: "empty" }
    | { kind: "hidden" }
    | { kind: "failed"; reason: string }

/** The route's own words for a failure, carried to the card. */
class DayBriefRequestError extends Error {}

/** `firmId`: the firm selected in the sidebar, which pays for what the brief costs; the server checks it. */
async function requestDayBrief(method: "GET" | "POST", firmId: string | null): Promise<DayBriefResponse> {
    const url = firmId ? `/api/me/day-brief?firm=${encodeURIComponent(firmId)}` : "/api/me/day-brief"
    const res = await fetchWithTimeout(url, { method, cache: "no-store" }, AI_TIMEOUT_MS.brief)
    const body = (await res.json().catch(() => null)) as (DayBriefResponse & { error?: string }) | null
    if (!res.ok || !body) {
        // A signed-out answer ("Unauthorized") isn't words for a person.
        throw new DayBriefRequestError(res.status !== 401 && body?.error ? body.error : BRIO_DAY_FAILED)
    }
    return body
}

/**
 * One GET at a time: a second card mounting (React's development double-mount, or a fast remount)
 * shares the request in flight instead of asking for a second brief on a new day.
 */
let pendingGet: Promise<DayBriefResponse> | null = null
function getDayBrief(firmId: string | null): Promise<DayBriefResponse> {
    pendingGet ??= requestDayBrief("GET", firmId).finally(() => {
        pendingGet = null
    })
    return pendingGet
}

function failureWords(e: unknown): string {
    if (e instanceof AiTimeoutError) return BRIO_TOO_SLOW
    if (e instanceof DayBriefRequestError) return e.message
    // fetch threw: the request never reached the server.
    if (e instanceof TypeError) return BRIO_UNREACHABLE_RETRY
    return BRIO_DAY_FAILED
}

function stateOf(d: DayBriefResponse): State {
    if (d.available === false) return { kind: "hidden" }
    if (d.brief) return { kind: "brief", brief: d.brief }
    if (d.empty) return { kind: "empty" }
    return { kind: "failed", reason: BRIO_DAY_FAILED }
}

/** The signed-in person's day, from /api/me/day-brief. */
export function DayBrief() {
    const [state, setState] = useState<State>({ kind: "loading" })
    // The firm selected in the sidebar pays for the brief. Read through a ref so the sidebar's firms
    // arriving after the first render don't ask for the brief a second time.
    const shell = useOptionalShellData()
    const firm = shell?.firms.find((f) => f.slug === shell.firmSlug) ?? null
    const firmIdRef = useRef<string | null>(null)
    firmIdRef.current = firm?.id ?? null
    const [loadTick, setLoadTick] = useState(0)
    const [rewriting, setRewriting] = useState(false)
    const [note, setNote] = useState<Note | null>(null)
    const mounted = useRef(true)

    useEffect(() => {
        mounted.current = true
        return () => {
            mounted.current = false
        }
    }, [])

    // Starts in "loading"; Try again sets it before asking again.
    useEffect(() => {
        let cancelled = false
        getDayBrief(firmIdRef.current)
            .then((d) => !cancelled && setState(stateOf(d)))
            .catch((e) => !cancelled && setState({ kind: "failed", reason: failureWords(e) }))
        return () => {
            cancelled = true
        }
    }, [loadTick])

    const rewrite = useCallback(async () => {
        if (rewriting) return
        setRewriting(true)
        setNote(null)
        try {
            const d = await requestDayBrief("POST", firmIdRef.current)
            if (!mounted.current) return
            setState(stateOf(d))
            if (d.unchanged) setNote({ tone: "info", text: DAY_BRIEF_UNCHANGED })
        } catch (e) {
            // The brief on screen stays; the note says why there isn't a new one.
            if (mounted.current) setNote({ tone: "error", text: failureWords(e) })
        } finally {
            if (mounted.current) setRewriting(false)
        }
    }, [rewriting])

    if (state.kind === "hidden") return null
    return (
        <DayBriefSection
            written={state.kind === "brief" ? writtenLabel(state.brief.generatedAt) : null}
            rewrite={state.kind === "brief" ? { rewriting, onRewrite: rewrite, firmName: firm?.name } : undefined}
        >
            {state.kind === "loading" ? (
                <DayBriefSkeleton />
            ) : state.kind === "failed" ? (
                <DayBriefFailed
                    reason={state.reason}
                    onRetry={() => {
                        setState({ kind: "loading" })
                        setLoadTick((t) => t + 1)
                    }}
                />
            ) : state.kind === "empty" ? (
                <HomeEmptyLine>{DAY_BRIEF_EMPTY}</HomeEmptyLine>
            ) : (
                <DayBriefCard brief={state.brief} rewriting={rewriting} note={note} />
            )}
        </DayBriefSection>
    )
}

// ─── Demo (/tour) ────────────────────────────────────────────────────────────

const COUNT_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
const countWord = (n: number) => COUNT_WORDS[n] ?? String(n)
const listOf = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)
const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** "today", "tomorrow", "on Friday", from the visitor's own today. */
function dueWhen(iso: string, now: Date): string {
    const day = new Date(iso)
    const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round((start(day) - start(now)) / 86_400_000)
    if (days === 0) return "today"
    if (days === 1) return "tomorrow"
    if (days < 0) return days === -1 ? "yesterday" : `${-days} days ago`
    return `on ${new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(day)}`
}

/**
 * The tour's brief, written from the demo's own Home data in the shape Brio writes it, never by the
 * model: the demo makes no calls. Null when the demo day has nothing in it.
 */
export function demoDayBriefText(work: MyWork, now: Date): string | null {
    const of = (kind: MyWork["needsYou"][number]["kind"]) => work.needsYou.filter((i) => i.kind === kind).map((i) => i.title)
    const reviews = of("deliverable_review")
    const comments = of("client_comment")
    const changes = of("changes_requested")
    const uploads = of("intake")
    const reminders = work.needsYou.filter((i) => i.kind === "reminder")

    const paragraphs: string[] = []
    if (reviews.length) {
        paragraphs.push(
            `**${countWord(reviews.length)} deliverable${reviews.length === 1 ? " is" : "s are"} waiting for your approval**: ${listOf(reviews)}.`,
        )
    } else if (comments.length) {
        paragraphs.push(`**${countWord(comments.length)} client comment${comments.length === 1 ? " awaits" : "s await"} your reply**: ${listOf(comments)}.`)
    }

    const waiting: string[] = []
    // Comments not already the lead.
    const commentsLeft = reviews.length ? comments : []
    if (commentsLeft.length) {
        waiting.push(`${listOf(commentsLeft)} ${commentsLeft.length === 1 ? "has a client comment" : "have client comments"} awaiting your reply`)
    }
    if (changes.length) waiting.push(`${listOf(changes)} came back to you with changes requested`)
    if (uploads.length) waiting.push(`a client upload (${listOf(uploads)}) is waiting for your approval`)
    if (waiting.length) paragraphs.push(`${capitalized(listOf(waiting))}.`)

    const later: string[] = []
    const due = work.dueSoon.filter((d) => d.kind !== "reminder").slice(0, 2)
    if (due.length) later.push(due.map((d) => `${d.title} is due ${dueWhen(d.dueDate, now)}`).join(", and "))
    if (reminders[0]) later.push(`your reminder "${reminders[0].title}" (${reminders[0].context}) is still open`)
    if (later.length) paragraphs.push(`${capitalized(later.join("; "))}.`)

    if (paragraphs.length === 0) return null
    // A lead phrase in bold, as Brio writes it, even when the day opens with something else.
    if (!paragraphs[0].startsWith("**")) paragraphs[0] = paragraphs[0].replace(/^([^,.:;]+)/, "**$1**")
    return paragraphs.slice(0, 3).join("\n\n")
}

/**
 * "Your day" on the tour's Home: the same section and card, written from the demo's data after
 * mount (it reads "today", and the server's day may not be the visitor's). Rewrite answers as the
 * app does when nothing has changed.
 */
export function DemoDayBrief({ work, firmName }: {
    work: MyWork
    /** The tour's firm, named in Rewrite's tooltip as the app names the sidebar's. */
    firmName?: string | null
}) {
    const [brief, setBrief] = useState<DayBriefShown | null | undefined>(undefined)
    const [rewriting, setRewriting] = useState(false)
    const [note, setNote] = useState<Note | null>(null)
    const timer = useRef<number | null>(null)

    useEffect(() => {
        const now = new Date()
        const text = demoDayBriefText(work, now)
        setBrief(text ? { text, date: now.toISOString().slice(0, 10), generatedAt: now.toISOString() } : null)
    }, [work])
    useEffect(() => () => {
        if (timer.current !== null) window.clearTimeout(timer.current)
    }, [])

    const rewrite = () => {
        setNote(null)
        setRewriting(true)
        // A moment, as the app takes to check, then the app's answer when nothing changed.
        timer.current = window.setTimeout(() => {
            setRewriting(false)
            setNote({ tone: "info", text: DAY_BRIEF_UNCHANGED })
        }, 700)
    }

    return (
        <DayBriefSection
            written={brief ? writtenLabel(brief.generatedAt) : null}
            rewrite={brief ? { rewriting, onRewrite: rewrite, firmName } : undefined}
        >
            {brief === undefined ? (
                <DayBriefSkeleton />
            ) : brief === null ? (
                <HomeEmptyLine>{DAY_BRIEF_EMPTY}</HomeEmptyLine>
            ) : (
                <DayBriefCard brief={brief} rewriting={rewriting} note={note} />
            )}
        </DayBriefSection>
    )
}
