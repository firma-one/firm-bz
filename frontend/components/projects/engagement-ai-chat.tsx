'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Send, Loader2, Sparkles, Copy, Check, RotateCcw, History, ThumbsUp, ThumbsDown, ClipboardList, Square, Clock, GripVertical, ChevronDown, Trash2, PanelLeft, Pin, PinOff, SquarePen } from 'lucide-react'
import { ASSISTANT } from '@/lib/ai/assistant'
import { Brio } from '@/components/ui/brio'
import { RelativeDateTime } from '@/components/ui/relative-date-time'
import { fetchWithTimeout, AI_TIMEOUT_MS, AiTimeoutError, AiAbortedError } from '@/lib/ai/fetch-timeout'
import { StreamingText } from '@/components/ui/streaming-text'
import { ChatMarkdown } from '@/components/ui/chat-markdown'
import {
    listConversations, saveConversation, getConversation, deleteConversation,
    setConversationPinned, clearConversations, MAX_PINNED, MAX_AGE_DAYS,
    type Conversation,
} from '@/lib/ai/chat-conversations'
import { ElapsedTime } from '@/components/ui/elapsed-time'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
// The same list the API narrows against, so the slider can never offer a scope the
// server would silently reject.
import { CHAT_SCOPES, type ChatScope } from '@/lib/ai/engagement-chat'
import { formatRelativeTime, formatDateTimeWithTZ } from '@/lib/utils'
import { reasonsFor, type FeedbackReason } from '@/lib/ai/feedback-reasons'
import { useToast } from '@/components/ui/toast'
import { buildChatTranscript } from '@/lib/ai/chat-transcript'
import { buildChatSuggestions } from '@/lib/ai/chat-suggestions'
import { isObviouslyOutOfScope, OUT_OF_SCOPE_REPLY, parseChatReply } from '@/lib/ai/engagement-chat'
import type { EngagementInsightsResponse } from '@/lib/insights/engagement-insights'

/** What a panel rendered inside the thread can do to it. */
export interface ChatThreadApi {
    /** Appends a turn. Persisted and rendered exactly like a typed question or a streamed answer. */
    append: (role: 'user' | 'assistant', content: string) => void
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    /** When the turn was created, for the relative timestamp in the action bar. */
    at: number
    /**
     * Stable identity for an assistant turn, minted here because nothing about the thread exists
     * server-side — the chat endpoint is stateless and receives the whole array each turn.
     *
     * Sent with a rating so that correcting one replaces the stored row rather than adding a second
     * and double-counting in the efficacy report. Lives only as long as the thread does, which is
     * exactly the window in which an answer is on screen to be re-rated.
     */
    answerId?: string
    /**
     * Set when the user stopped this answer mid-stream. The text is kept — the first paragraph is
     * often the useful part — but the turn is marked so it is never presented as a complete answer,
     * and so it cannot be rated: a thumbs-down on half an answer would poison the efficacy data.
     */
    stopped?: boolean
}

/**
 * Three lines at the composer's 1.5rem line-height. Past this it scrolls rather than growing, so a
 * pasted paragraph cannot push the Action Center off the page.
 */
const MAX_COMPOSER_HEIGHT_PX = 72
/** One line of text at the composer's line-height. The box never shrinks below a usable row. */
const MIN_COMPOSER_HEIGHT_PX = 24

/**
 * How far from the bottom still counts as "following along".
 *
 * Generous enough to survive a part-rendered line, small enough that a reader who has deliberately
 * scrolled up is not dragged back down by the next token.
 */
const AUTOSCROLL_SLACK_PX = 80

/**
 * A rating already given on an answer. `null`/`undefined` means not yet rated.
 *
 * `undefined` is in the type deliberately: the caller looks the rating up out of a sparse
 * `Record<number, …>`, so an unrated answer arrives as `undefined`, not `null`. Typing this as
 * `| null` alone made every `rating !== null` guard true on first paint and left both thumbs
 * permanently disabled. Guards below test falsiness rather than a specific empty value.
 */
type Rating = { helpful: boolean; reason?: FeedbackReason } | null | undefined

/**
 * Icon-only actions under a settled answer: copy, retry, and a thumbs rating.
 *
 * Labels were dropped because four actions with text crowded a narrow column and competed with the
 * answer for attention. Each icon carries the shared Radix tooltip and an `aria-label`, so the
 * meaning is available on hover and to a screen reader without taking horizontal space.
 *
 * ## Ratings stay editable
 *
 * A rating used to lock on the first click, to stop someone toggling and double-counting themselves
 * in the efficacy report. That is now handled where it belongs — the server upserts on `answerId`,
 * so a correction replaces the row — which frees the UI to let people fix a mistake.
 *
 * It matters because the chip panel opens *after* the thumb is clicked: a locked rating meant
 * anyone who dismissed the panel was stuck with a reason-less rating they could never complete, and
 * anyone who picked the wrong chip was stuck with the wrong one.
 */
function AnswerActions({
    at, copied, rating, disabled, rateable = true, onCopy, onRetry, onRate,
}: {
    at: number
    copied: boolean
    rating: Rating
    disabled: boolean
    /** False for an answer the user stopped — see the call site. */
    rateable?: boolean
    onCopy: () => void
    onRetry: () => void
    onRate: (helpful: boolean, reason?: FeedbackReason) => void
}) {
    /** Which chip list is open, if any. Both signs have one, so this holds the sign rather than a flag. */
    const [picking, setPicking] = useState<boolean | null>(null)

    const iconButton =
        'inline-flex h-6 w-6 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted disabled:opacity-40'

    // Clicking a thumb records the rating immediately and opens its chips. Recording first means a
    // user who ignores the chips has still been counted — the chip is detail, the thumb is the
    // signal. Clicking the thumb that is already set just reopens its chips to change the answer.
    const onThumb = (helpful: boolean) => {
        if (rating?.helpful !== helpful) onRate(helpful, undefined)
        setPicking((cur) => (cur === helpful ? null : helpful))
    }

    return (
        <div className="mt-1.5 border-t border-line pt-1">
            <TooltipProvider delayDuration={150}>
                <div className="flex items-center gap-0.5">
                    {/* Relative time, with the absolute timestamp in its own tooltip. Answers are
                        regenerated against live data, so how old one is tells the reader whether
                        its figures still stand. */}
                    <RelativeDateTime
                        date={new Date(at)}
                        className="mr-1.5"
                        textClassName="text-caption text-fg-subtle"
                        iconClassName="hidden"
                    />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" onClick={onCopy} className={iconButton} aria-label="Copy answer">
                                {copied ? <Check className="h-3.5 w-3.5 text-action" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">{copied ? 'Copied' : 'Copy'}</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" onClick={onRetry} disabled={disabled} className={iconButton} aria-label="Ask again">
                                <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Ask again</TooltipContent>
                    </Tooltip>

                    {rateable && (
                    <>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => onThumb(true)}
                                aria-label="Good response"
                                aria-pressed={rating?.helpful === true}
                                className={`${iconButton} ${rating?.helpful === true ? 'text-action' : ''}`}
                            >
                                <ThumbsUp className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            {rating?.helpful === true ? 'Marked helpful — click to change' : 'Good response'}
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => onThumb(false)}
                                aria-label="Bad response"
                                aria-pressed={rating?.helpful === false}
                                className={`${iconButton} ${rating?.helpful === false ? 'text-amber-600' : ''}`}
                            >
                                <ThumbsDown className="h-3.5 w-3.5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            {rating?.helpful === false ? 'Marked unhelpful — click to change' : 'Bad response'}
                        </TooltipContent>
                    </Tooltip>
                    </>
                    )}
                </div>
            </TooltipProvider>

            {/* Single-select: one click records and closes. Each list is a single ordered axis whose
                options are mutually exclusive, so "the strongest thing you felt" always has one
                right answer — multi-select would need a confirm button and cost us ratings. */}
            {rateable && picking !== null && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className="text-caption text-fg-muted">
                        {picking ? 'What was good about it?' : 'What went wrong?'}
                    </span>
                    {reasonsFor(picking).map((r) => {
                        const active = rating?.helpful === picking && rating?.reason === r.value
                        const tone = picking
                            ? 'hover:border-action/40 hover:bg-action/10 hover:text-action'
                            : 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
                        const activeTone = picking
                            ? 'border-action/40 bg-action/10 text-action'
                            : 'border-amber-300 bg-amber-50 text-amber-800'
                        return (
                            <button
                                key={r.value}
                                type="button"
                                onClick={() => {
                                    onRate(picking, r.value as FeedbackReason)
                                    setPicking(null)
                                }}
                                aria-pressed={active}
                                className={`rounded-full border px-2 py-0.5 text-caption transition-colors ${
                                    active ? activeTone : `border-line text-fg-muted ${tone}`
                                }`}
                            >
                                {r.label}
                            </button>
                        )
                    })}
                    {/* The thumb is already recorded, so this only closes the panel. */}
                    <button
                        type="button"
                        onClick={() => setPicking(null)}
                        className="px-1 text-caption text-fg-subtle underline transition-colors hover:text-fg-muted"
                    >
                        Skip
                    </button>
                </div>
            )}
        </div>
    )
}

/** The rail's side panes. See `railPane`. */
type RailPane = 'recents' | 'pins' | null

export function EngagementAiChat({
    projectId,
    data,
    engagementName,
    clientName,
    chrome = 'card',
    suggestionsOverride,
    suggestionActions,
    aboveThread,
    placeholder,
    capabilityNote,
    surface = 'overview',
    scopeSwitchable = false,
    threadRef,
    onBusyChange,
    onStartDrag,
    dragging = false,
    onCollapse,
    scopeLabel,
    onHistoryOpenChange,
    dockSide = 'right',
}: {
    projectId: string
    /** Insights payload the page already holds; drives data-aware suggestions. */
    data?: EngagementInsightsResponse | null
    /** Titles the exported transcript. Optional — it falls back to "this engagement". */
    engagementName?: string | null
    clientName?: string | null
    /**
     * 'card' (default) draws the panel's own border and shadow, for the in-column placement.
     * 'floating' drops both, because the surrounding overlay already supplies them — two nested
     * borders read as a box inside a box.
     */
    chrome?: 'card' | 'floating'
    /**
     * Starting prompts supplied by the host page, replacing the engagement-derived set.
     *
     * The Files page needs questions about files, and has no insights payload to derive the
     * engagement ones from anyway. Passed in rather than branched on inside, so this component
     * stays unaware of which page it is on.
     */
    suggestionsOverride?: string[]
    /**
     * Rendered as the last chip in the suggestion row.
     *
     * A caller-supplied ACTION, not a question — the Files page puts "Review folder organization"
     * here so it reads as one of the things you can ask for, in the place the eye already goes for
     * them, rather than as a banner above the conversation.
     */
    suggestionActions?: React.ReactNode
    /**
     * Agent output, rendered INSIDE the thread at the top.
     *
     * Not above the panel: a review rendered outside the conversation appeared before the "Ask
     * Brio" header that introduces it, so the panel read as output-then-title. Anything the
     * assistant produces belongs in the message area, below that header and scrolling with the
     * rest of the conversation.
     */
    aboveThread?: React.ReactNode
    /**
     * Overrides the composer's prompt text.
     *
     * The default names the engagement, which is right on Overview and wrong on Files — a panel
     * that answers questions about folders and due dates should say so, since the placeholder is
     * the one hint a user reads before typing anything.
     */
    placeholder?: string
    /**
     * One line in the header saying what this panel can do here.
     *
     * Page-specific, because the answer differs: on Overview Brio only answers questions, while on
     * Files it can also reorganize and scaffold. A single hardcoded line would be wrong on one of
     * them.
     */
    capabilityNote?: React.ReactNode
    /**
     * Which page this panel is on, for thread persistence.
     *
     * Overview and Files hold different conversations about the same engagement, so they keep
     * separate conversation lists — see `lib/ai/chat-conversations.ts`.
     */
    surface?: ChatScope
    /**
     * Whether the reader may change the scope from this page.
     *
     * On Files the panel is scoped to the file tree and stays there — the page IS the scope.
     * On Overview the reader may want the file detail without leaving, so the slider is offered.
     */
    scopeSwitchable?: boolean
    /**
     * Handed a way to post turns into this thread.
     *
     * An agent confirmation is a question the assistant asked and an answer the user gave, so it
     * belongs in the conversation like any other exchange — visible in the record, scrollable, and
     * persisted with everything else. Without this the answers lived as state inside the panel and
     * vanished on reload, leaving a thread that showed the review happening but not what was
     * decided.
     */
    threadRef?: React.MutableRefObject<ChatThreadApi | null>
    /**
     * Reports whether an answer is in flight.
     *
     * Lifted so the collapsed launcher can show that something is still running — the panel is
     * kept mounted but hidden while collapsed, so the work continues where the user cannot see it.
     */
    onBusyChange?: (busy: boolean) => void
    /**
     * Window controls, when this panel is floating.
     *
     * Rendered INSIDE the header rather than in a strip above it. Two bars stacked meant a full
     * row spent on a grip and a chevron, above a second row carrying the name — and the drag
     * target was only that strip, when the whole header reads as the thing you would grab.
     */
    onStartDrag?: (event: React.PointerEvent<HTMLElement>) => void
    dragging?: boolean
    onCollapse?: () => void
    /** What this panel is scoped to, matching the collapsed launcher's own label. */
    scopeLabel?: string
    /**
     * Reports whether the recent-questions pane is open.
     *
     * The floating panel widens to fit it rather than letting it cover the thread: at 23rem a
     * sheet over the conversation hides the answer you are deciding whether to re-ask.
     */
    onHistoryOpenChange?: (open: boolean) => void
    /**
     * Which edge the floating panel is docked against.
     *
     * The recents pane opens on the side the panel GROWS into, which is the docked edge: a
     * right-docked panel grows leftward, so the pane belongs on the left. Put it on the wrong
     * side and it is the conversation that slides out from under the reader while the pane sits
     * still — and, worse, the pane's opaque background paints over the resize grip, which lives
     * on the panel's inner (free) edge and is the only edge that can be dragged.
     */
    dockSide?: 'left' | 'right'
}) {
    /**
     * The LIVE scope: what Brio is answering about, which is not always the page you are on.
     *
     * Starts as the page's own surface and, where the page allows it, follows the slider. Every
     * piece of per-scope state keys off this rather than the `surface` prop — thread, history,
     * pins and the `scope` sent to the API — so switching swaps the whole conversation rather
     * than leaving a Files answer sitting in the Overview thread.
     *
     * Re-synced when the page changes beneath it, so navigating Overview → Files does not leave
     * the panel answering about the page you just left.
     */
    const [scope, setScope] = useState(surface)
    useEffect(() => { setScope(surface) }, [surface])

    /** Whether the scope slider is expanded. Collapsed it is just the current scope's name. */
    const [scopePickerOpen, setScopePickerOpen] = useState(false)
    // Dismissed by Escape or a click anywhere else, like any popover. Without this the only way
    // out is picking a scope, which makes opening it to look feel like a commitment.
    useEffect(() => {
        if (!scopePickerOpen) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setScopePickerOpen(false) }
        // `pointerdown` on the document, in the capture phase, so a click on the toggle itself
        // still reaches its own handler and toggles rather than being closed from under it.
        const onPointer = (e: PointerEvent) => {
            const el = e.target as HTMLElement | null
            if (!el?.closest('[data-scope-picker]')) setScopePickerOpen(false)
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointer)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('pointerdown', onPointer)
        }
    }, [scopePickerOpen])

    const [messages, setMessages] = useState<Message[]>([])

    /**
     * Restores the thread on mount, so it survives navigation and reload within the session.
     *
     * In an effect rather than the initializer: this component renders on the server, where
     * sessionStorage does not exist, and reading it during the first client render would mismatch
     * the server's markup.
     */
    useEffect(() => {
        const all = listConversations(projectId, scope)
        setConversations(all)
        // Resume the most recent conversation rather than opening a blank one: continuing where
        // you left off is the common case, and a new thread is one click away.
        const latest = all[0]
        setActiveId(latest?.id ?? null)
        setMessages(latest?.messages ?? [])
        // Everything restored was produced before this page load, so the divider sits above it.
        setRestoredCount(latest?.messages.length ?? 0)
    }, [projectId, scope])

    /** How many leading turns came from storage, so the divider knows where "now" begins. */
    const [restoredCount, setRestoredCount] = useState(0)

    // Published once, so a panel rendered in `aboveThread` can write into the conversation it sits
    // in. A ref rather than a callback prop because the consumer is a sibling, not a child.
    useEffect(() => {
        if (!threadRef) return
        threadRef.current = {
            append: (role, content) =>
                setMessages((prev) => [...prev, { role, content, at: Date.now() }]),
        }
        return () => { threadRef.current = null }
    }, [threadRef])

    const [input, setInput] = useState('')
    const [streaming, setStreaming] = useState(false)
    useEffect(() => { onBusyChange?.(streaming) }, [streaming, onBusyChange])


    // Persisted on every settled change. Not while streaming: a half-written answer would be
    // stored truncated and restored with no sign it was cut off.
    useEffect(() => {
        if (streaming) return
        // Skip the empty pass that a fresh mount or a "new chat" produces, so an untouched panel
        // does not delete the conversation it has not loaded yet.
        if (messages.length === 0) return
        const id = saveConversation(projectId, scope, activeId, messages)
        // A first write mints the id, so adopt it — otherwise the next turn would start a second
        // conversation instead of appending to this one.
        if (id && id !== activeId) setActiveId(id)
        setConversations(listConversations(projectId, scope))
        // `activeId` is deliberately out of the deps: it is SET by this effect, and including it
        // would run the whole save again on the render that adopts the new id.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, streaming, projectId, scope])
    const [error, setError] = useState<string | null>(null)
    // Set when the API reports AI is unavailable (no key) — hides the panel entirely.
    const [unavailable, setUnavailable] = useState(false)
    // Questions already put to the model this session, so a chip is not offered twice.
    const [asked, setAsked] = useState<Set<string>>(() => new Set())
    // Questions asked previously, surviving reload. Loaded in an effect rather than from a lazy
    // initialiser because localStorage is unavailable during server render.
    /**
     * Every saved conversation for this engagement and scope, newest first.
     *
     * Replaces the old pair of a bare question list and a separate pin list: an entry here IS a
     * conversation, so opening one restores what was actually said rather than re-asking the
     * question and spending a credit to reproduce an answer the user already read.
     */
    const [conversations, setConversations] = useState<Conversation[]>([])
    /** The conversation being added to, or `null` before the first turn of a new one. */
    const [activeId, setActiveId] = useState<string | null>(null)
    /**
     * Which side pane the rail has open, or `null` for the rail alone.
     *
     * A union of one, deliberately: the rail is built to take a second stop, and a boolean here
     * would have to be unpicked to add one. Widen the union, do not reintroduce a flag per pane.
     *
     * One slot, not a flag per pane: they occupy the same strip, so two booleans would admit a
     * state — both open — that cannot be drawn.
     */
    const [railPane, setRailPane] = useState<RailPane>(null)
    const historyOpen = railPane === 'recents'
    const pinsOpen = railPane === 'pins'
    /** Either pane being open widens the panel by the same amount. */
    const sidePaneOpen = railPane !== null
    /** Toggles a pane, closing it if it is already the open one. */
    const toggleRailPane = useCallback((pane: Exclude<RailPane, null>) => {
        setRailPane((p) => (p === pane ? null : pane))
    }, [])
    // The panel widens while a pane is open, so it costs the conversation nothing.
    useEffect(() => { onHistoryOpenChange?.(sidePaneOpen) }, [sidePaneOpen, onHistoryOpenChange])
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
    const [transcriptCopied, setTranscriptCopied] = useState(false)
    // Ratings by message index. Session-only: the thumbs are an affordance on an answer still on
    // screen, and the durable record lives server-side in platform_ai_feedback.
    const [ratings, setRatings] = useState<Record<number, { helpful: boolean; reason?: FeedbackReason }>>({})
    const { addToast } = useToast()

    /**
     * Identity of this conversation, for grouping its ratings together in the efficacy dashboard —
     * a run of good answers turning bad after a topic shift is a different signal from the same
     * number of unrelated complaints.
     *
     * Minted here rather than server-side because the chat endpoint is stateless: it receives the
     * whole message array each turn and holds no continuity, so a server-minted id would be fresh
     * on every request, which is the opposite of grouping. Keyed on `projectId` so switching
     * engagements starts a new thread rather than merging two conversations.
     */
    /**
     * Aborts the in-flight turn when the user presses Stop.
     *
     * Worth having because a Brio turn costs a credit from a capped allowance: a question the user
     * immediately realises was wrong should not have to run to completion. The server still meters
     * whatever tokens were generated, so stopping is honest rather than free.
     */
    const abortRef = useRef<AbortController | null>(null)

    const threadIdRef = useRef<{ key: string; id: string } | null>(null)
    if (threadIdRef.current?.key !== projectId) {
        threadIdRef.current = { key: projectId, id: crypto.randomUUID() }
    }

    useEffect(() => {
        setConversations(listConversations(projectId, scope))
    }, [projectId])

    /** Pinned conversations are listed on their own tab; recents shows the rest. */
    const pinnedConversations = useMemo(() => conversations.filter((c) => c.pinned), [conversations])
    /**
     * ALL conversations, pinned ones first — not the unpinned remainder.
     *
     * Pinning used to move a conversation out of this list, which made pinning your only
     * conversation empty the tab that lists conversations: it read as deletion. A pin is an
     * attribute of a conversation, not a different kind of thing, so it stays where it was and
     * the row's pin icon marks it. The pin tab is a filtered view for when there are many.
     */
    const allConversations = useMemo(
        () => [...conversations].sort((a, b) => {
            if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
            return b.updatedAt - a.updatedAt
        }),
        [conversations],
    )

    // Grow the composer with its content, up to three lines.
    //
    // Driven from `input` rather than from the keystroke, so it is also correct when the value
    // changes some other way — picking a suggestion, clearing after send. Height is reset to `auto`
    // first because scrollHeight never shrinks below the element's current height, so without the
    // reset the box would grow and never come back down.
    useEffect(() => {
        const el = inputRef.current
        if (!el) return
        el.style.height = 'auto'
        // Clamped at BOTH ends. `scrollHeight` is measured after the height is reset to `auto`,
        // and in a flex row that can come back as zero before layout settles — which set the
        // height to 0px and left a composer with no clickable area, no caret and no room to paint
        // its placeholder. It read as a disabled input with nothing disabling it.
        const next = Math.min(
            Math.max(el.scrollHeight, MIN_COMPOSER_HEIGHT_PX),
            MAX_COMPOSER_HEIGHT_PX,
        )
        el.style.height = `${next}px`
    }, [input])

    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)


    // Two sources, in priority order.
    //
    // Before the first answer there is no conversation to follow on from, so chips come from the
    // engagement's own data — a chip is only offered when it has an answer ("What's overdue?" on an
    // engagement with nothing overdue costs a credit to say "nothing").
    //
    // After an answer the model's own follow-ups win, because only it knows what it just said. They
    // arrive on a sentinel line in the same stream, so they cost no extra call. Falling back to the
    // data-driven list keeps the row populated if a reply omits the marker.
    //
    // `suggestionsOverride` is honoured even when EMPTY. A caller that supplies its own prompts
    // asynchronously (Files fetches them server-side) passes `[]` while they load, and showing the
    // engagement set in that gap made the chips visibly swap out from under the user. An absent
    // override — Overview, which has no prompts of its own — still gets the engagement chips.
    const dataSuggestions = useMemo(
        () => suggestionsOverride
            ? suggestionsOverride.filter((q) => !asked.has(q))
            : buildChatSuggestions(data, asked),
        [suggestionsOverride, data, asked],
    )

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const modelFollowUps = useMemo(() => {
        if (!lastAssistant?.content) return []
        return parseChatReply(lastAssistant.content).followUps.filter((q) => !asked.has(q))
    }, [lastAssistant?.content, asked])

    const suggestions = modelFollowUps.length > 0 ? modelFollowUps : dataSuggestions

    /**
     * The header's second line.
     *
     * Falls back to the standing promise rather than to nothing: a surface that says nothing
     * specific about what the assistant can do here should still say what it will not do. Overview
     * passes no `capabilityNote`, and before this it carried the line inside the thread, where it
     * disappeared the moment a question was asked.
     */
    const headerNote = capabilityNote ?? (
        <>
            <Brio /> answers from this engagement&apos;s data, and never changes anything without
            your consent.
        </>
    )

    /**
     * What the blank panel suggests doing, which depends on whether there is anything to ask about.
     *
     * A fresh engagement has no files, no deliverables and no dates, so "ask about deliverables"
     * is advice it cannot act on — the useful next step there is to put something in the
     * engagement, and saying so is more honest than offering prompts that would return nothing.
     */
    const emptyStateHint = suggestions.length > 0
        ? 'Pick one of the questions below, or type your own.'
        : suggestionActions
            // There are no QUESTIONS to offer, but there is an action — on Files with no files
            // that is "Set up folder organization", which is the actual next step. Pointing at
            // the composer instead would be advice the page cannot act on yet.
            ? 'Start with the action below, or type a question.'
            : 'Nothing has been added here yet. Once there are deliverables, dates or files, Brio can answer questions about them.'

    /**
     * Keeps the newest content in view as it arrives, and again once the turn settles.
     *
     * `streaming` is a dependency, not just `messages`: the action bar — copy, retry, the rating
     * thumbs — renders only after streaming stops, in a render that no message change triggers. So
     * scrolling on `messages` alone always landed a row short, leaving those controls just below
     * the fold.
     *
     * The settled scroll runs after paint rather than inside the effect body, because the action
     * bar has not been laid out yet at effect time and `scrollHeight` would still be the old value.
     *
     * `aboveThread` is a dependency too: an agent question renders there, not as a message, so a
     * new one arriving changed neither `messages` nor `streaming` and the view stayed where it was
     * — the question appeared below the fold and the user had to scroll to find what they were
     * being asked.
     */
    useEffect(() => {
        const el = scrollRef.current
        if (!el) return

        // Auto-follow only while the reader is already at the bottom. Yanking the view back while
        // someone is scrolled up re-reading an earlier answer is worse than not following at all.
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < AUTOSCROLL_SLACK_PX
        if (!nearBottom && streaming) return

        const toBottom = (behavior: ScrollBehavior) =>
            el.scrollTo({ top: el.scrollHeight, behavior })

        if (streaming) {
            // Instant while tokens arrive: a smooth scroll is still animating when the next chunk
            // lands, so each one restarts it and the view never catches up.
            toBottom('auto')
            return
        }

        const frame = requestAnimationFrame(() => toBottom('smooth'))
        return () => cancelAnimationFrame(frame)
    }, [messages, streaming, aboveThread])

    const ask = useCallback(async (question: string) => {
        const trimmed = question.trim()
        if (!trimmed || streaming) return

        setError(null)
        setInput('')
        setAsked((prev) => new Set(prev).add(trimmed))
        setRailPane(null)

        // Refuse the plainly off-topic without a round-trip: instant, and it costs no credit. This
        // is a convenience gate, not the boundary — the real one is the system prompt plus a
        // context that contains nothing but this engagement's own counts and statuses.
        if (isObviouslyOutOfScope(trimmed)) {
            setMessages((prev) => [
                ...prev,
                { role: 'user', content: trimmed, at: Date.now() },
                { role: 'assistant', content: OUT_OF_SCOPE_REPLY, at: Date.now(), answerId: crypto.randomUUID() },
            ])
            inputRef.current?.focus()
            return
        }

        // History excludes the message being sent; the route appends it as the final user turn.
        const history = messages.slice(-12)
        setMessages((prev) => [
            ...prev,
            { role: 'user', content: trimmed, at: Date.now() },
            { role: 'assistant', content: '', at: Date.now(), answerId: crypto.randomUUID() },
        ])
        setStreaming(true)

        const controller = new AbortController()
        abortRef.current = controller

        try {
            const res = await fetchWithTimeout(`/api/projects/${projectId}/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // The page the reader is on. Shapes the prompt and trims the file listing
                // server-side; the server narrows it, so an unknown value degrades to the
                // broader scope rather than failing.
                body: JSON.stringify({ question: trimmed, history, scope }),
            }, AI_TIMEOUT_MS.stream, controller.signal)

            if (!res.ok) {
                if (res.status === 503) setUnavailable(true)
                const detail = await res.json().catch(() => null)
                throw new Error(detail?.error ?? 'Could not get an answer')
            }
            if (!res.body) throw new Error('No response stream')

            const reader = res.body.getReader()
            const decoder = new TextDecoder()

            for (;;) {
                // The fetch signal aborts the request, but a reader already handed out keeps
                // resolving, so the stop is enforced here too: cancel the body and leave the loop.
                if (controller.signal.aborted) {
                    await reader.cancel().catch(() => {})
                    throw new AiAbortedError()
                }
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value, { stream: true })
                setMessages((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = {
                        ...next[next.length - 1],
                        content: next[next.length - 1].content + chunk,
                    }
                    return next
                })
            }
        } catch (e) {
            // A deliberate stop is not a failure, so it shows no error. Whatever had arrived is
            // kept and marked stopped; if nothing had, the empty bubble is dropped like any other
            // turn that produced no answer.
            if (e instanceof AiAbortedError) {
                setMessages((prev) => {
                    if (!prev.length) return prev
                    const last = prev[prev.length - 1]
                    if (last.role !== 'assistant') return prev
                    if (!last.content) return prev.slice(0, -1)
                    return [...prev.slice(0, -1), { ...last, stopped: true }]
                })
                return
            }
            // A timeout gets its own wording: "Could not get an answer" reads like a refusal,
            // when in fact nothing came back in time and retrying is worthwhile.
            setError(
                e instanceof AiTimeoutError
                    ? `${ASSISTANT.name} took too long to answer. Try asking again.`
                    : e instanceof Error ? e.message : 'Something went wrong',
            )
            // Drop the empty assistant placeholder so a failed turn leaves no blank bubble.
            setMessages((prev) => (prev[prev.length - 1]?.content === '' ? prev.slice(0, -1) : prev))
        } finally {
            abortRef.current = null
            setStreaming(false)
            inputRef.current?.focus()
            // Tells the top-bar balance to refresh. An event rather than a poll: credits only move
            // when someone spends one, and this is the moment that happened.
            window.dispatchEvent(new Event('firma-ai-credit-spent'))
        }
    }, [projectId, messages, streaming])

    /**
     * Stops the answer currently streaming.
     *
     * The server meters whatever was generated, so this saves the user the rest of the answer, not
     * the whole credit — the request had already reached the model.
     */
    const stop = useCallback(() => {
        abortRef.current?.abort()
    }, [])

    /**
     * Re-asks the question that produced a given answer.
     *
     * Drops the old question/answer pair before re-asking so the thread does not fill with
     * near-identical replies — a retry is a correction, not a new turn. Costs a credit like any
     * other question, which is why it is a deliberate click rather than automatic on a poor answer.
     */
    const retry = useCallback((assistantIndex: number) => {
        if (streaming) return
        const question = messages[assistantIndex - 1]
        if (question?.role !== 'user') return
        setMessages((prev) => prev.slice(0, assistantIndex - 1))
        // Ratings are keyed by position in the message array, and the retried pair is about to be
        // dropped — so every rating from here on would otherwise re-attach to whatever lands in its
        // slot, showing a thumbs-down on an answer the user never saw. The stored rows are
        // unaffected: they are keyed by answerId, not position.
        setRatings((prev) => {
            const next: typeof prev = {}
            for (const [k, v] of Object.entries(prev)) {
                if (Number(k) < assistantIndex - 1) next[Number(k)] = v
            }
            return next
        })
        void ask(question.content)
    }, [messages, streaming, ask])

    /**
     * Records or corrects a thumbs rating on an answer.
     *
     * Optimistic: the UI marks the rating immediately, because a thumb that waits on the network
     * before responding feels broken. The toast then confirms what actually reached the server.
     *
     * The rating is written on the thumb click and again when a chip is picked. Both carry the same
     * `answerId`, so the server upserts and the second write corrects the first rather than adding a
     * row — which is what makes the rating editable without inflating the efficacy counts.
     *
     * Neither the question nor the answer is sent. The rating and its chip are the whole payload:
     * "Got facts wrong" on the chat feature is a signal that can be counted without holding what
     * anyone typed, and the typed question never let a failure be reproduced anyway, since the
     * answer is not stored either.
     */
    const rate = useCallback(async (assistantIndex: number, helpful: boolean, reason?: FeedbackReason) => {
        const previous = ratings[assistantIndex]
        setRatings((prev) => ({ ...prev, [assistantIndex]: { helpful, reason } }))


        try {
            const res = await fetch(`/api/projects/${projectId}/ai-feedback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    helpful,
                    reason,
                    answerId: messages[assistantIndex]?.answerId,
                    threadId: threadIdRef.current?.id,
                }),
            })
            if (!res.ok) throw new Error(String(res.status))

            addToast({
                type: 'success',
                title: 'Thanks — feedback recorded',
                // Only say what we actually do with it. This does not retrain anything, and the
                // detail is what makes the rating usable rather than a bare tally.
                message: reason
                    ? 'It tells us which prompts to fix.'
                    : helpful
                        ? 'Tell us what was good about it to make it more useful.'
                        : 'Tell us what went wrong to make it more useful.',
            })
        } catch {
            // Roll back so the UI does not claim a rating the server never took — the user can
            // click again. Silent failure was acceptable when nothing confirmed success; now that
            // a toast does, a thumb left marked after a failed write would be a lie.
            setRatings((prev) => {
                const next = { ...prev }
                if (previous) next[assistantIndex] = previous
                else delete next[assistantIndex]
                return next
            })
            addToast({
                type: 'error',
                title: "Couldn't record that",
                message: 'Your rating was not saved. Please try again.',
            })
        }
    }, [projectId, messages, ratings, addToast])

    /**
     * Copies the whole conversation as Markdown.
     *
     * Copy rather than download: a Brio conversation almost always ends up pasted into an
     * engagement note, a client update, or a message to a colleague. A .md file in ~/Downloads is a
     * worse clipboard.
     */
    const copyTranscript = useCallback(async () => {
        const text = buildChatTranscript(messages, {
            engagementName: engagementName ?? undefined,
            clientName: clientName ?? undefined,
        })
        if (!text) return
        try {
            await navigator.clipboard.writeText(text)
            setTranscriptCopied(true)
            setTimeout(() => setTranscriptCopied(false), 1500)
        } catch {
            // Clipboard blocked (permissions, insecure context). Nothing useful to say.
        }
    }, [messages, engagementName, clientName])

    /** Copies the visible answer — parsed, so the follow-up sentinel never lands on the clipboard. */
    const copyAnswer = useCallback(async (index: number, content: string) => {
        try {
            await navigator.clipboard.writeText(parseChatReply(content).answer)
            setCopiedIndex(index)
            setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500)
        } catch {
            // Clipboard blocked (permissions, insecure context). Nothing useful to say.
        }
    }, [])

    // Deliberately not `return null`: the panel renders before we can know AI is unconfigured,
    // so unmounting here would make it vanish underneath the user right after they asked a
    // question. Show it inert with an explanation instead.
    if (unavailable) {
        return (
            <div className={`bg-surface p-4 ${
                chrome === 'floating' ? 'rounded-b-card' : 'border border-line rounded-card'
            }`}>
                <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-semibold text-fg">Ask</span>
                    <Brio className="text-sm text-fg-subtle" />
                </div>
                <p className="text-xs text-fg-muted">
                    {ASSISTANT.name} is not available right now. Everything else on this page works as usual.
                </p>
            </div>
        )
    }

    /** True once pinning another conversation would exceed the cap. */
    const pinsFull = pinnedConversations.length >= MAX_PINNED

    /** Opens a saved conversation, replacing what is on screen. */
    const openConversation = useCallback((c: Conversation) => {
        setActiveId(c.id)
        setMessages(c.messages)
        // All of it predates this moment, so the "earlier" divider sits above the whole thread.
        setRestoredCount(c.messages.length)
        setRailPane(null)
    }, [])

    /**
     * Starts a fresh conversation.
     *
     * The current one is already saved — every settled change writes — so this only needs to
     * clear the screen and drop the active id. The next question mints a new one.
     */
    const startNewConversation = useCallback(() => {
        setActiveId(null)
        setMessages([])
        setRestoredCount(0)
        setError(null)
        setRailPane(null)
    }, [])

    /**
     * One row of the conversations pane, shared by the pinned and recent sections.
     *
     * Shared rather than duplicated because the two differ only in their pin control, and two
     * near-copies of this markup would drift the moment either changed.
     */
    const renderConversationRow = (c: Conversation) => (
        <div key={c.id} className="group/item flex items-center gap-1">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => openConversation(c)}
                        disabled={streaming}
                        className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-3 text-left text-xs transition-colors disabled:opacity-50 ${
                            c.id === activeId
                                // The one you are reading, marked. Without it, opening a
                                // conversation and reopening the pane gives no clue which of ten
                                // rows is on screen behind it.
                                ? 'border-action/40 bg-action/5 text-action'
                                : 'border-line bg-surface-subtle text-fg-muted hover:border-action/30 hover:bg-action/5 hover:text-action'
                        }`}
                    >
                        {c.pinned
                            ? <Pin className="h-3 w-3 shrink-0 text-action/60" aria-hidden />
                            : <Clock className="h-3 w-3 shrink-0 text-fg-subtle" aria-hidden />}
                        <span className="shrink-0 text-caption tabular-nums text-fg-subtle">
                            {formatRelativeTime(new Date(c.updatedAt))}
                        </span>
                        <span className="truncate">{c.title}</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    {c.title}
                    <span className="mt-0.5 block text-caption opacity-70">
                        {c.messages.filter((m) => m.role === 'user').length} question
                        {c.messages.filter((m) => m.role === 'user').length === 1 ? '' : 's'}
                        {' · last active '}{formatDateTimeWithTZ(new Date(c.updatedAt))}
                    </span>
                    <span className="mt-0.5 block text-caption opacity-70">
                        Opens this conversation — answers are shown as they were, with their date.
                    </span>
                </TooltipContent>
            </Tooltip>

            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => setConversations(
                            setConversationPinned(projectId, scope, c.id, !c.pinned),
                        )}
                        // Disabled at the cap rather than evicting the oldest pin: silently
                        // dropping something deliberately kept is the failure pinning prevents.
                        disabled={streaming || (!c.pinned && pinsFull)}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle opacity-0 transition-all hover:bg-action/10 hover:text-action focus-visible:opacity-100 group-hover/item:opacity-100 disabled:pointer-events-none disabled:opacity-0"
                        aria-label={c.pinned ? `Unpin "${c.title}"` : `Pin "${c.title}"`}
                    >
                        {c.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                    {c.pinned
                        ? 'Unpin. It goes back to ageing out normally.'
                        : pinsFull
                            ? `All ${MAX_PINNED} pins are used. Unpin one to make room.`
                            : 'Pin. Kept when recents are cleared, and never ages out.'}
                </TooltipContent>
            </Tooltip>

            {!c.pinned && (
                <button
                    type="button"
                    onClick={() => {
                        setConversations(deleteConversation(projectId, scope, c.id))
                        // Deleting what is on screen leaves the panel showing a conversation that
                        // no longer exists, and the next turn would silently recreate it.
                        if (c.id === activeId) startNewConversation()
                    }}
                    disabled={streaming}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle opacity-0 transition-all hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 group-hover/item:opacity-100 disabled:opacity-0"
                    aria-label={`Delete "${c.title}"`}
                    title="Delete"
                >
                    <Trash2 className="h-3 w-3" />
                </button>
            )}
        </div>
    )

    /**
     * The recent-questions pane: an inner column that widens from zero, not an overlay.
     *
     * Two things it must not do, both learned the hard way:
     *
     * 1. **Cover the thread.** The floating panel grows by this pane's own width when it opens
     *    (see `onHistoryOpenChange`), so the conversation keeps its reading width and the answer
     *    that prompted the re-ask stays visible.
     * 2. **Cover the resize grip.** The grip lives on the panel's INNER edge — left when docked
     *    right — and an opaque pane rendered on that side paints over it, taking away the only
     *    edge the user can drag. So the pane sits on the DOCKED edge, which is the side the panel
     *    grows into, and the caller orders the row accordingly.
     *
     * Width animates rather than the pane mounting and unmounting, so it slides open in step with
     * the panel widening instead of appearing fully formed a frame early. The contents carry
     * their own fixed `w-[17rem]`, so they do not reflow while the container is mid-animation.
     */
    /**
     * The shell both side panes share: the animating container, the header and the footer note.
     *
     * Shared rather than written twice because the two differ only in their title, their header
     * action and their list — and two copies of the width animation, the border-side logic and
     * the collapse button would drift the moment either changed.
     */
    const renderSidePane = ({ open, title, action, children, footer }: {
        open: boolean
        title: string
        action?: React.ReactNode
        children: React.ReactNode
        footer: string
    }) => (
        <div
            aria-hidden={!open}
            className={`flex shrink-0 flex-col overflow-hidden bg-surface pt-2 transition-[width] duration-200 ease-out ${
                open ? 'w-[17rem]' : 'w-0'
            } ${
                /* Lighter than the rail's border although both are 1px. The rail sits on a
                   tinted background, so its edge is already softened by the fill beside it;
                   this one divides two whites, where the same gray reads as a heavier rule. */
                dockSide === 'right' ? 'border-r border-line' : 'border-l border-line'
            }`}
        >
            <div className="mb-1.5 flex w-[17rem] shrink-0 items-center gap-2 px-3">
                <span className="flex-1 text-caption font-medium text-fg-muted">
                    {title}
                </span>
                {action}
                {/* A PANEL-COLLAPSE icon, not an X. The pane does not go away when dismissed, it
                    folds back into the edge it slid out of, and an X beside a bin read as
                    "discard these" rather than "put this away".

                    The plain panel glyph, not the chevron variant: it is symmetrical, so it does
                    not have to flip with the dock, and at 14px the chevron was a smudge beside
                    the bar it pointed at. */}
                <button
                    type="button"
                    onClick={() => setRailPane(null)}
                    className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                    aria-label={`Collapse ${title.toLowerCase()}`}
                    title="Collapse"
                >
                    <PanelLeft className="h-3.5 w-3.5" />
                </button>
            </div>
            <TooltipProvider delayDuration={150}>
                <div className="hover-scrollbar flex w-[17rem] min-h-0 flex-1 flex-col gap-1 overflow-y-auto pl-3 pr-3.5">
                    {children}
                </div>
            </TooltipProvider>
            <p className="mt-1.5 w-[17rem] shrink-0 px-3 pb-2 text-caption text-fg-subtle">
                {footer}
            </p>
        </div>
    )

    const historyPane = renderSidePane({
        open: historyOpen,
        title: 'Conversations',
        action: (
            /* "Clear recents", NOT "clear all": this spares pins, and a destructive control that
               overstates its scope is exactly the kind of thing that erodes trust in a panel
               which also moves files. */
            <button
                type="button"
                onClick={() => {
                    setConversations(clearConversations(projectId, scope))
                    startNewConversation()
                }}
                // Clearing only removes the unpinned ones, so there is nothing to do when
                // every conversation is pinned.
                disabled={conversations.every((c) => c.pinned)}
                className="flex h-5 w-5 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                aria-label="Clear recent conversations. Pinned conversations are kept."
                title="Clear recents (pins are kept)"
            >
                <Trash2 className="h-3.5 w-3.5" />
            </button>
        ),
        // Says "unpinned" because pinned rows are in this list too and are exempt from the
        // age-out — a flat "kept for 30 days" would be wrong about half of what is shown.
        footer: `Unpinned conversations are kept on this browser for ${MAX_AGE_DAYS} days.`,
        children: allConversations.length === 0 ? (
            <p className="text-caption leading-snug text-fg-subtle">
                Conversations you have here will show up in this list.
            </p>
        ) : (
            <>{allConversations.map(renderConversationRow)}</>
        ),
    })

    const pinsPane = renderSidePane({
        open: pinsOpen,
        title: 'Pinned conversations',
        footer: `${pinnedConversations.length} of ${MAX_PINNED} pinned. Never cleared with recents, and never aged out.`,
        children: pinnedConversations.length === 0 ? (
            /* Says where pinning happens. Pins are made on a recents row, so an empty pin tab
               with no pointer back is a dead end. */
            <p className="text-caption leading-snug text-fg-subtle">
                No pinned conversations yet. Hover one on the conversations tab and press the pin
                to keep it here.
            </p>
        ) : (
            <>{pinnedConversations.map(renderConversationRow)}</>
        ),
    })

    /**
     * The icon rail: always present, never collapsed away.
     *
     * The panes it opens used to be reachable only from a count button inside the suggestion chip
     * row — which is hidden while an answer streams, so mid-answer there was no way to reach
     * history at all. A fixed rail gives them a home that does not move or disappear.
     *
     * Its width is added to the panel rather than taken out of the conversation (see
     * `RAIL_WIDTH_REM`), so the thread keeps the measure it was tuned for.
     */
    const rail = (
        <TooltipProvider delayDuration={150}>
            <div
                className={`flex w-10 shrink-0 flex-col items-center gap-1 bg-gray-50/70 pt-2 ${
                    dockSide === 'right'
                        ? 'border-r border-line rounded-bl-lg'
                        : 'border-l border-line rounded-br-lg'
                }`}
            >
                {/* NEW CHAT, above the stops and separated from them.
                    It is an action, not a place, and it is what makes the conversation list a
                    list — without it every question would land in one endless thread. Disabled
                    on an already-empty new conversation, so it cannot look like it did nothing. */}
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={startNewConversation}
                            disabled={streaming || (activeId === null && messages.length === 0)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-gray-200/60 hover:text-fg-muted disabled:pointer-events-none disabled:opacity-30"
                            aria-label="Start a new conversation"
                        >
                            <SquarePen className="h-4 w-4" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side={dockSide === 'right' ? 'right' : 'left'}>
                        New conversation
                    </TooltipContent>
                </Tooltip>
                <span aria-hidden className="my-1 h-px w-5 bg-surface-selected" />

                {/* Two stops. Suggested prompts are deliberately NOT one: they belong above the
                    composer, where the eye already is when deciding what to ask, and a copy in
                    here was simply the same four chips shown twice. */}
                {([
                    { id: 'recents', label: 'Conversations', icon: History, count: allConversations.length },
                    { id: 'pins', label: 'Pinned conversations', icon: Pin, count: pinnedConversations.length },
                ] as const).map(({ id, label, icon: Icon, count }) => (
                    <Tooltip key={id}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => toggleRailPane(id)}
                                aria-expanded={railPane === id}
                                aria-label={railPane === id ? `Collapse ${label.toLowerCase()}` : label}
                                className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                    railPane === id
                                        ? 'bg-action/15 text-action'
                                        : 'text-fg-subtle hover:bg-gray-200/60 hover:text-fg-muted'
                                }`}
                            >
                                <Icon className="h-4 w-4" />
                                {/* The count as a corner dot, not a number beside the icon: at
                                    rail width a digit and a glyph do not both fit legibly, and
                                    whether there is anything in there is the part that decides
                                    whether to open it. */}
                                {count > 0 && railPane !== id && (
                                    <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-action/60" aria-hidden />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side={dockSide === 'right' ? 'right' : 'left'}>
                            {label}
                            {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
                        </TooltipContent>
                    </Tooltip>
                ))}
            </div>
        </TooltipProvider>
    )

    /**
     * Rail and whichever pane is open, as one unit.
     *
     * The rail is always on the OUTSIDE, against the docked edge, with the pane sliding out
     * between it and the conversation — so the rail never moves when a pane opens, which is what
     * makes it read as fixed furniture rather than part of the drawer.
     */
    const railGroup = dockSide === 'right' ? (
        <>
            {rail}
            {historyPane}
            {pinsPane}
        </>
    ) : (
        /* Mirrored. The whole group sits AFTER the conversation when docked left, so to keep the
           rail against the panel's outer edge it has to come last within the group too — rail
           first here would put the pane outermost and shunt the rail inward every time one
           opened. */
        <>
            {pinsPane}
            {historyPane}
            {rail}
        </>
    )

    // New UI: a plain surface with a hairline header — the Brio mark carries the identity. (The
    // accent tint it used to wear came from the old card-grid layout.)
    //
    // `relative` on the card anchors the history overlay; `overflow-hidden` then keeps that overlay
    // inside the card, which is what we want — it should never spill over the Action Center below.
    return (
        <div className={`relative bg-surface flex flex-col overflow-hidden ${
            chrome === 'floating' ? 'min-h-0 flex-1 rounded-b-card' : 'border border-line rounded-card'
        }`}>
            <div
                // The WHOLE header is the drag target, not a strip above it. A grip icon says
                // where to grab; a header that moves when dragged says it better, and buys back
                // the row the old strip spent on an icon and a chevron.
                //
                // `onPointerDown` on the container rather than a handle: the buttons inside stop
                // propagation themselves, so a click on collapse never starts a drag.
                onPointerDown={onStartDrag}
                className={`border-b border-line px-4 py-3 transition-colors ${
                    onStartDrag ? 'cursor-grab active:cursor-grabbing' : ''
                } ${dragging ? 'bg-surface-hover' : 'bg-surface'}`}
            >
            <div className="flex items-start gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {onStartDrag && (
                        <GripVertical className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden />
                    )}
                    {/* No separate sparkle: the Brio mark already carries one, and two side by
                        side read as two different things rather than one brand. */}
                    <span className="text-sm font-semibold text-fg">Ask</span>
                    <Brio className="text-sm text-action" />
                </div>
                {/* The same words the collapsed pill uses. It said "Files" collapsed and "This
                    engagement" open, which read as two different scopes for one panel.

                    Follows the LIVE scope once the slider has moved it, not the page: the
                    caller's label describes where you are, and after a switch that is no longer
                    what Brio is answering about. This label is the only thing on screen that
                    says which, so it has to be the thing that changed. */}
                <span className="shrink-0 pt-0.5 text-caption text-fg-subtle">
                    {scope === surface ? (scopeLabel ?? 'This engagement') : (scope === 'files' ? 'Files' : 'This engagement')}
                </span>
                {/* Only once there is a conversation to export, and only on this panel — which
                    internal roles alone can see, so a transcript cannot reach an external
                    collaborator who never had access to Brio in the first place. */}
                {messages.some((m) => m.content.trim()) && (
                    <TooltipProvider delayDuration={150}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => void copyTranscript()}
                                    aria-label="Copy conversation"
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-caption text-action/70 transition-colors hover:bg-action/10"
                                >
                                    {transcriptCopied
                                        ? <Check className="h-3 w-3" />
                                        : <ClipboardList className="h-3 w-3" />}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-xs">
                                {transcriptCopied
                                    ? 'Conversation copied'
                                    : 'Copy this conversation as Markdown, ready to paste into a note or update'}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                )}

                {/* Collapse, not close: the conversation is kept and the panel returns to its
                    launcher. An X claims the thread is being discarded, which would make people
                    hesitate to put it away.

                    `stopPropagation` because the header is now the drag surface — without it a
                    click here would also begin a drag. */}
                {onCollapse && (
                    <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={onCollapse}
                        className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-fg-subtle transition-colors hover:bg-surface hover:text-fg-muted"
                        aria-label="Collapse the assistant"
                        title="Collapse"
                    >
                        <ChevronDown className="h-4 w-4" />
                    </button>
                )}
            </div>

            {/* A SECOND ROW spanning the full header width, not a subtitle tucked under the name.
                Beside the title it was squeezed into whatever space the scope label and history
                button left over, wrapping a one-line sentence across three. Across the full width
                it reads as one line, and the row sets expectations before the first question
                rather than from inside the thread, where it was the first thing pushed out of
                view. */}
            {/* A FIXED two-line box, not one that grows with its text.

                The header is above the row that the recents pane widens, so anything that changes
                its height when the pane opens shifts the whole conversation down — reflowing the
                answer the reader is in the middle of. `line-clamp-2` on a reserved two lines keeps
                the box the same height whichever note is showing and whatever the panel's width,
                so opening recents moves nothing above the thread. */}
            <p className="mt-1.5 line-clamp-2 h-[2.1rem] text-caption leading-snug text-fg-muted">
                {headerNote}
            </p>
            </div>

            {/* Below the header, the panel is a ROW: the recents pane, then the conversation.
                In flow rather than overlaid, because the panel widens by exactly this pane's width
                when it opens — so the thread keeps its reading width instead of being covered by
                a sheet. */}
            <div className="flex min-h-0 flex-1">
            {dockSide === 'right' && railGroup}

            {/* The conversation: thread, suggestions, composer. `min-w-0` so a long unbroken
                answer cannot push the row wider than the panel. */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
                ref={scrollRef}
                /* Floating gets the taller window and no minimum: the overlay should hug an empty
                   thread rather than reserve a blank 180px above the composer. In-column keeps the
                   minimum, where a collapsing card would make the rail jump. */
                /* `overflow-x-hidden` and `break-words` below are a pair. Answers are full of
                   long unbreakable tokens — `01_ICP_Firmographics_&_Persona_Data.xlsx` is one
                   word to the line breaker — and a column narrow enough to not fit one would
                   otherwise scroll sideways, clipping the text and putting a scrollbar under the
                   thread. Wrapping mid-token is the lesser evil: a wrapped filename is readable,
                   a clipped one is not. */
                /* RECESSED, so the header, rail and composer read as the frame around it and
                   the conversation as the surface inside.

                   A tint as well as the shadow, not shadow alone: a white recess on white has
                   nothing to shade against and stays flat however the shadow is tuned. The
                   inset is strongest at the top, where a well would catch the least light, and
                   fades at the sides — an even inset ring looks like a border, not depth.

                   Written as an arbitrary value because Tailwind's `shadow-inner` is a single
                   faint token that disappears entirely against this background. */
                className={`hover-scrollbar bg-surface px-4 py-4 space-y-3 overflow-y-auto overflow-x-hidden ${
                    chrome === 'floating'
                        // Fills the frame's fixed height and scrolls inside it, rather than
                        // setting the panel's height by growing.
                        ? 'min-h-0 flex-1'
                        : 'max-h-[480px] min-h-[180px]'
                }`}
            >
                {/* EMPTY STATE. Rendered only for a conversation with nothing in it — not while
                    one is streaming its first answer, which would flash this between the question
                    and the reply.

                    Says what to DO, not what Brio is: the header's second line already carries
                    the capability and the promise, and repeating it here would spend the one
                    moment of attention a blank panel gets on something already on screen.

                    `aboveThread` suppresses it too — an agent question is content, so a panel
                    showing one is not empty. */}
                {messages.length === 0 && !streaming && !aboveThread && (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                        <Sparkles className="h-5 w-5 text-action/30" aria-hidden />
                        <p className="mt-2 text-xs font-medium text-fg-muted">
                            Ask <Brio noIcon /> about this engagement
                        </p>
                        <p className="mt-1 max-w-[16rem] text-caption leading-relaxed text-fg-subtle">
                            {emptyStateHint}
                        </p>
                    </div>
                )}

                {messages.map((m, i) => (
                    <React.Fragment key={i}>
                    {/* Marks where the restored thread ends and this visit begins.
                        Restored answers were true when produced and may not be now — "3
                        deliverables are overdue" was right an hour ago. Dropping them on reload
                        loses the conversation; restoring them silently presents a stale figure as
                        current. The time each turn was produced is shown, so the reader can judge
                        rather than be told. */}
                    {restoredCount > 0 && i === restoredCount && (
                        // A wave rather than a straight rule — see `.fm-wave-rule` in
                        // globals.css for why, and why it is CSS rather than an inline SVG.
                        <div className="flex items-center gap-2 py-1 text-fg-subtle">
                            <div className="fm-wave-rule flex-1" aria-hidden />
                            <span className="shrink-0 text-caption text-fg-subtle">
                                Earlier · figures were current when asked
                            </span>
                            <div className="fm-wave-rule flex-1" aria-hidden />
                        </div>
                    )}
                    <div className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                        <div
                            className={
                                m.role === 'user'
                                    // Grey bubble with black text rather than the former near-black
                                    // on white: the solid dark block pulled the eye to the question
                                    // instead of the answer. Kept light enough that black text
                                    // clears the 4.5:1 contrast minimum — a genuinely dark grey
                                    // would sit near 1.6:1 and be unreadable.
                                    // An absolute ceiling as well as the percentage: 85% of a
                                    // resized panel is still 85%, so without it a widened panel
                                    // produces bubbles of 150-character lines. The percentage keeps
                                    // bubbles off the opposite edge at narrow widths; the rem value
                                    // keeps the line readable at wide ones.
                                    ? 'bg-surface-muted text-fg text-ui rounded-card px-3 py-2 max-w-[85%] sm:max-w-[38rem]'
                                    // The ASSISTANT bubble takes the full width, and the cap moves
                                    // inside it (see ChatMarkdown): its prose is capped at the same
                                    // measure, but a table must be free to use the width the user
                                    // widened the panel for. Capping the bubble would make the
                                    // table scroll inside a 38rem box in a 56rem panel.
                                    // New UI: no bubble at all — the answer reads as text on the
                                    // page, as in Notion AI; only the question sits in a tint.
                                    : 'text-fg text-ui px-0.5 py-1 w-full whitespace-pre-line break-words leading-relaxed'
                            }
                        >
                            {m.content ? (
                                // Only the final assistant bubble is still arriving; earlier turns
                                // render plain so they don't re-animate on every new token.
                                //
                                // Assistant text is parsed rather than shown raw: the reply carries
                                // its follow-up questions after a sentinel, and parseChatReply also
                                // hides a half-streamed marker so "<<FOLL" never flashes mid-answer.
                                m.role === 'assistant' && !(streaming && i === messages.length - 1) ? (
                                    // Settled assistant turns render as Markdown, so an answer can
                                    // carry a table or a list instead of needing a purpose-built
                                    // card per kind of structured output.
                                    <ChatMarkdown content={parseChatReply(m.content).answer} />
                                ) : (
                                    // Still streaming, or a user turn. Markdown is not rendered
                                    // mid-stream: a half-written table is a wall of pipes, and the
                                    // word animation needs plain text to tokenise.
                                    <StreamingText
                                        text={m.role === 'assistant' ? parseChatReply(m.content).answer : m.content}
                                        animate={m.role === 'assistant' && streaming && i === messages.length - 1}
                                    />
                                )
                            ) : (
                                // Elapsed time but no commentary: an answer is one model call, so
                                // there are no steps to narrate — listing them would be inventing
                                // detail. The timer still earns its place, since it is what tells a
                                // waiting user whether a slow answer is slow or stuck.
                                <span className="inline-flex items-center gap-1.5 text-fg-subtle">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <Brio /> is thinking
                                    <ElapsedTime className="text-caption text-fg-subtle" />
                                </span>
                            )}
                            {/* Says plainly that the answer is incomplete. Without this a stopped
                                turn is indistinguishable from a finished one, and a half-answer
                                about an engagement would read as the whole picture. */}
                            {m.stopped && (
                                <p className="mt-1 text-caption italic text-fg-subtle">
                                    Stopped — this answer is incomplete.
                                </p>
                            )}
                            {/* Actions on a settled answer only. While streaming the text is still
                                arriving, so copying it would capture a fragment and retrying would
                                race the in-flight request.

                                A stopped turn can be copied and re-asked but NOT rated: a thumbs
                                down on an answer the user cut short measures their impatience, not
                                the model, and would quietly corrupt the efficacy report. */}
                            {m.role === 'assistant' && m.content && !(streaming && i === messages.length - 1) && (
                                <AnswerActions
                                    at={m.at}
                                    copied={copiedIndex === i}
                                    rating={ratings[i]}
                                    disabled={streaming}
                                    rateable={!m.stopped}
                                    onCopy={() => void copyAnswer(i, m.content)}
                                    onRetry={() => retry(i)}
                                    onRate={(helpful, reason) => void rate(i, helpful, reason)}
                                />
                            )}
                        </div>
                    </div>
                    </React.Fragment>
                ))}

                {/* Agent questions render LAST, after the messages.
                    A conversation runs top to bottom with the newest turn at the bottom, and an
                    open question is the newest thing in it — the agent has just asked and is
                    waiting. Rendered first, the question sat above the report that prompted it,
                    so the exchange read backwards. */}
                {aboveThread}

                {error && <p className="text-xs text-red-600">{error}</p>}
            </div>

            {/* Suggestions live ABOVE the input and outside the scroll area, so they survive the
                first question. Previously they rendered only while the thread was empty, which
                meant clicking one destroyed the other three with no way back short of a reload —
                turning a discovery aid into a single use. Each chip disappears once asked, so the
                row stays useful rather than repeating what is already answered above. */}
            {(suggestions.length > 0 || suggestionActions) && !streaming && (
                // Wraps rather than scrolling horizontally. A scroll row clipped the second chip
                // mid-word with no scrollbar and no affordance, so the options simply looked
                // broken; at this column width two per line is the honest layout.
                <TooltipProvider delayDuration={150}>
                    {/* A rule above the chips, marking where the conversation ends and the
                        controls begin. Without it the row sat flush against the scrolling thread
                        and read as the tail of the last answer rather than a set of actions.
                        Hairline, not a heavy divider: it separates two things that belong to the
                        same panel. */}
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-line bg-surface px-4 pb-2.5 pt-2.5">
                        {/* The recents control used to live here, as a count beside the chips.
                            It now lives on the rail: this row is hidden while an answer streams,
                            which left no way to reach history mid-answer, and two buttons for one
                            pane made the rail look like it did something else. */}
                        {suggestions.map((s) => (
                            // The shared Radix tooltip, not `title=`: the native one is slow to
                            // appear, unstyled, and sits outside the product's visual language.
                            <Tooltip key={s}>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => ask(s)}
                                        /* `inline-flex` with the label in its own span, so
                                           `truncate` shortens the TEXT and leaves the icon alone.
                                           On the button it would have truncated the whole row,
                                           clipping the icon off the end of a long chip. */
                                        className="group/chip inline-flex max-w-full items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1 text-left text-small text-fg-muted transition-colors hover:border-line-strong hover:bg-surface-hover hover:text-fg"
                                    >
                                        <span className="truncate">{s}</span>
                                        {/* Says the chip SENDS rather than filling the composer —
                                            a pill otherwise reads as a filter or a tag, and this
                                            one spends a credit. The composer's own send arrow,
                                            not a return key: these are clicked, not reached by
                                            Enter, so a ↵ would promise a keystroke that does not
                                            apply here.

                                            Hidden until hover or focus: four arrows at rest turn
                                            a row of questions into a row of buttons, and the
                                            signal is only needed at the moment of deciding to
                                            click. `shrink-0` so it survives a truncated label. */}
                                        <Send
                                            className="h-3 w-3 shrink-0 text-action/70 opacity-0 transition-opacity group-hover/chip:opacity-100 group-focus-visible/chip:opacity-100"
                                            aria-hidden
                                        />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                    {s}
                                </TooltipContent>
                            </Tooltip>
                        ))}
                        {suggestionActions}
                    </div>
                </TooltipProvider>
            )}

            <form
                onSubmit={(e) => { e.preventDefault(); ask(input) }}
                // New UI: thread and composer share one plain surface; the hairline above and the
                // bordered input box below are enough to say where to type.
                className="border-t border-line bg-surface px-3 pb-3 pt-2.5"
            >
                {/* The composer is its own surface — a bordered, rounded box inset from the card —
                    rather than a hairline rule with text beneath it. At the bottom of a long thread
                    a divider alone did not read as somewhere to type. `focus-within` moves the ring
                    to this wrapper so the whole box lights up, not just the textarea inside it. */}
                <div className="flex items-end gap-2 rounded-card border border-line-strong bg-surface px-3 py-2 transition-colors focus-within:border-action/60 focus-within:ring-2 focus-within:ring-action/20">
                {/* A textarea, not an input: a long question scrolled sideways in a single line, so
                    the user could not read back what they had typed. It grows to three rows and
                    scrolls beyond that, which keeps the panel from pushing the Action Center down
                    the page. Enter still sends; Shift+Enter starts a new line. */}
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            void ask(input)
                        }
                    }}
                    placeholder={placeholder ?? `Ask ${ASSISTANT.name} about this engagement…`}
                    disabled={streaming}
                    maxLength={1000}
                    rows={1}
                    // maxHeight comes from the same constant the grow effect clamps to; as a
                    // Tailwind class it would be a second number to keep in step.
                    style={{ maxHeight: MAX_COMPOSER_HEIGHT_PX }}
                    className="hover-scrollbar flex-1 resize-none overflow-y-auto bg-transparent text-ui leading-6 outline-none placeholder:text-fg-subtle disabled:opacity-50"
                />
                    {/* While streaming, the spinner itself is the stop control: the ring carries the
                        "working" signal and the small square inside it says it can be interrupted.
                        A solid dark button read as a heavier commitment than stopping deserves, and
                        competed with the answer arriving beside it.

                        type="button" so it never submits the form. */}
                    {streaming ? (
                        <button
                            type="button"
                            onClick={stop}
                            className="group mb-0.5 relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:text-fg-muted"
                            aria-label="Stop generating"
                            title="Stop generating"
                        >
                            {/* Ring drawn as a bordered circle with one darker edge, so it reads as
                                a spinner without a second icon stacked over the square. */}
                            <span
                                aria-hidden
                                className="absolute inset-0 animate-spin rounded-full border-2 border-line border-t-action"
                            />
                            <Square className="h-2.5 w-2.5 fill-current" />
                        </button>
                    ) : (
                        /* Filled once there is something to send, so the affordance is obvious
                           rather than a grey glyph that looks permanently disabled. */
                        <button
                            type="submit"
                            disabled={!input.trim()}
                            className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-action text-action-fg hover:bg-action-hover transition-colors hover:brightness-105 disabled:bg-surface-muted disabled:text-fg-subtle"
                            aria-label="Send question"
                        >
                            <Send className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>

                {/* SCOPE CONTROL, below the composer: collapsed to the current scope's name,
                    expanding to the slider on click.

                    Most people never change scope, so the resting state is a single quiet word
                    — the control is there to be FOUND, not to occupy the panel. Expanded it is
                    a track with a tick per stop and a knob that travels, which has a position
                    legible at a glance and still reads as one control when Board and Members are
                    added; a segmented pill would become four cramped text boxes. */}
                {scopeSwitchable && (
                    <div data-scope-picker className="relative mt-2 flex justify-center">
                        <button
                            type="button"
                            onClick={() => setScopePickerOpen((o) => !o)}
                            disabled={streaming}
                            aria-expanded={scopePickerOpen}
                            aria-label={`Brio is answering about ${scope}. Change scope.`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption transition-colors disabled:opacity-50 ${
                                scopePickerOpen
                                    ? 'bg-surface-muted text-fg-muted'
                                    : 'text-fg-subtle hover:bg-surface-hover hover:text-fg-muted'
                            }`}
                        >
                            <span>Answering about</span>
                            <span className="font-medium capitalize text-fg-muted">{scope}</span>
                            <ChevronDown
                                className={`h-3 w-3 transition-transform ${scopePickerOpen ? 'rotate-180' : ''}`}
                                aria-hidden
                            />
                        </button>

                        {scopePickerOpen && (
                            /* Opens UPWARD: the control sits at the bottom of the panel, so a
                               downward popover would fall outside it. */
                            <div
                                role="radiogroup"
                                aria-label="What Brio answers about"
                                className="absolute bottom-full z-20 mb-1.5 flex items-center gap-2 rounded-card border border-line bg-surface px-3 py-2 shadow-popover"
                            >
                                <span
                                    className={`text-caption capitalize transition-colors ${
                                        scope === CHAT_SCOPES[0] ? 'text-fg-muted' : 'text-fg-subtle'
                                    }`}
                                >
                                    {CHAT_SCOPES[0]}
                                </span>

                                <div className="relative h-3.5 w-20 shrink-0 select-none">
                                    <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-surface-muted" />

                                    {/* Ticks say the control is discrete — a bare track reads as
                                        continuous, and a scope is not. */}
                                    {CHAT_SCOPES.map((s, i) => (
                                        <span
                                            key={`tick-${s}`}
                                            aria-hidden
                                            className="absolute top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-300"
                                            style={{ left: `${((i + 0.5) / CHAT_SCOPES.length) * 100}%` }}
                                        />
                                    ))}

                                    {/* Positioned by percentage, so adding a stop needs no
                                        arithmetic here. */}
                                    <span
                                        aria-hidden
                                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-line-strong bg-surface shadow-sm transition-[left] duration-200 ease-out"
                                        style={{
                                            left: `${((CHAT_SCOPES.indexOf(scope) + 0.5) / CHAT_SCOPES.length) * 100}%`,
                                        }}
                                    />

                                    {/* Invisible hit areas, each a full stop wide: the knob is
                                        12px, too small to ask anyone to hit. */}
                                    {CHAT_SCOPES.map((s, i) => (
                                        <button
                                            key={s}
                                            type="button"
                                            role="radio"
                                            aria-checked={scope === s}
                                            aria-label={`Answer about ${s}`}
                                            onClick={() => { setScope(s); setScopePickerOpen(false) }}
                                            className="absolute -inset-y-1.5 rounded-full focus-visible:outline focus-visible:outline-1 focus-visible:outline-action/40"
                                            style={{
                                                left: `${(i / CHAT_SCOPES.length) * 100}%`,
                                                width: `${100 / CHAT_SCOPES.length}%`,
                                            }}
                                        />
                                    ))}
                                </div>

                                <span
                                    className={`text-caption capitalize transition-colors ${
                                        scope === CHAT_SCOPES[CHAT_SCOPES.length - 1] ? 'text-fg-muted' : 'text-fg-subtle'
                                    }`}
                                >
                                    {CHAT_SCOPES[CHAT_SCOPES.length - 1]}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </form>
            </div>
            {dockSide === 'left' && railGroup}
            </div>
        </div>
    )
}
