'use client'

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'next/navigation'
import { AccessLock } from '@/components/ui/access-lock'
import { cn } from '@/lib/utils'

/*
 * Discussions › Threads | Memos (.claude/plans/brio-features-round-2.md, §8 and §9). RAID was a third
 * sub-tab until it got a tab of its own (2026-11-14); the switch still takes it when it's passed.
 *
 * Leads and Full Access contributors get a switch at the top of Discussions: Threads (the page as it
 * was), Memos (call and meeting notes kept as files) and RAID (risks, assumptions, issues, decisions).
 * Memos and RAID are internal. Reviewers and Limited Access contributors get no switch at all: their
 * Discussions page is Threads alone, as before, and nothing of the other two is rendered for them.
 *
 * The sub-tab is kept in the URL (`?view=memos`, `?view=raid`; Threads leaves it out), and so is the
 * memo open in Memos (`&memo=<id>`), so a reload keeps the place and a link can open either one
 * (discussionsHref). Shared by the app (engagement-comments-tab.tsx) and /tour (demo-engagement-comments.tsx).
 */

export type DiscussionsSubTab = 'threads' | 'memos' | 'raid'

/** The query parameter that keeps the sub-tab. */
export const DISCUSSIONS_VIEW_PARAM = 'view'
/** The query parameter that keeps the memo open in Memos: its EngagementDocument id. */
export const DISCUSSIONS_MEMO_PARAM = 'memo'

/** Who sees a sub-tab marked with the lock, as the engagement's internal tabs say it. */
export const INTERNAL_ONLY_LABEL = 'Internal only · Hidden from Limited Access contributors and Reviewers'

/**
 * Whether this viewer gets the switch, and Memos and RAID with it: a Lead or a Contributor · Full
 * Access, who may edit and may see what's internal (as the memos route asks), and isn't viewing the
 * page as a Reviewer or Limited Access contributor.
 */
export function hasInternalDiscussions({ canEdit, canViewInternal, viewingAsRestrictedRole = false }: {
    canEdit: boolean
    canViewInternal: boolean
    viewingAsRestrictedRole?: boolean
}): boolean {
    return canEdit && canViewInternal && !viewingAsRestrictedRole
}

/** The sub-tab a `view` value names. Anything else, and RAID while there's no RAID log, is Threads. */
export function parseDiscussionsSubTab(value: string | null | undefined, hasRaid: boolean): DiscussionsSubTab {
    if (value === 'memos') return 'memos'
    if (value === 'raid' && hasRaid) return 'raid'
    return 'threads'
}

/** A link to one sub-tab of an engagement's Discussions, e.g. "Open RAID log": `${engagementBase}/comments?view=raid`. */
export function discussionsHref(engagementBase: string, subTab: DiscussionsSubTab, memoId?: string | null): string {
    const params = new URLSearchParams()
    if (subTab !== 'threads') params.set(DISCUSSIONS_VIEW_PARAM, subTab)
    if (subTab === 'memos' && memoId) params.set(DISCUSSIONS_MEMO_PARAM, memoId)
    const qs = params.toString()
    return `${engagementBase}/comments${qs ? `?${qs}` : ''}`
}

/** The page's own URL with the sub-tab and memo written in, everything else kept. */
function writeUrl(subTab: DiscussionsSubTab, memoId: string | null) {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (subTab === 'threads') params.delete(DISCUSSIONS_VIEW_PARAM)
    else params.set(DISCUSSIONS_VIEW_PARAM, subTab)
    if (subTab === 'memos' && memoId) params.set(DISCUSSIONS_MEMO_PARAM, memoId)
    else params.delete(DISCUSSIONS_MEMO_PARAM)
    const qs = params.toString()
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
    // Replaced, not pushed: switching sub-tabs isn't a page to go Back to. Next.js keeps
    // useSearchParams in step with it, without asking the server for the page again.
    window.history.replaceState(null, '', next)
}

/**
 * The sub-tab and the open memo, read from the URL and written back to it. Follows the URL when it
 * changes from outside (Back, a link to another sub-tab). The memo is remembered while another sub-tab
 * is shown, so going back to Memos reopens it.
 */
export function useDiscussionsUrlState(hasRaid: boolean) {
    const searchParams = useSearchParams()
    const urlSubTab = parseDiscussionsSubTab(searchParams?.get(DISCUSSIONS_VIEW_PARAM), hasRaid)
    const urlMemo = searchParams?.get(DISCUSSIONS_MEMO_PARAM) || null
    const [subTab, setSubTabState] = useState<DiscussionsSubTab>(urlSubTab)
    const [memoId, setMemoIdState] = useState<string | null>(urlMemo)

    useEffect(() => { setSubTabState(urlSubTab) }, [urlSubTab])
    useEffect(() => { if (urlMemo) setMemoIdState(urlMemo) }, [urlMemo])

    // State and URL change together, so the latest of each is what's written.
    const memoRef = useRef(memoId)
    memoRef.current = memoId
    const subTabRef = useRef(subTab)
    subTabRef.current = subTab

    const setSubTab = useCallback((next: DiscussionsSubTab) => {
        setSubTabState(next)
        writeUrl(next, memoRef.current)
    }, [])
    const setMemoId = useCallback((next: string | null) => {
        setMemoIdState(next)
        writeUrl(subTabRef.current, next)
    }, [])

    return { subTab, setSubTab, memoId, setMemoId }
}

// ── The bar ───────────────────────────────────────────────────────────────────────────────────

interface PanelContextValue {
    /** This panel's sub-tab is the one shown. */
    active: boolean
    /** The bar's slot, beside the switch. */
    slot: HTMLElement | null
}

const PanelContext = createContext<PanelContextValue>({ active: false, slot: null })

/**
 * Puts its children in the Discussions bar, on the switch's row, while its sub-tab is the one shown:
 * a sub-tab's own controls (Memos: "Internal only", search, "Add internal memo"). Renders nothing
 * outside a sub-tab panel. RAID's body can use it the same way.
 */
export function DiscussionsBarPortal({ children }: { children: ReactNode }) {
    const { active, slot } = useContext(PanelContext)
    return active && slot ? createPortal(children, slot) : null
}

export interface DiscussionsSwitchOption {
    id: DiscussionsSubTab
    label: string
    /** Shown beside the label when known and above zero. */
    count?: number | null
    /** Internal only: the lock, as the engagement's Audit and Settings tabs carry it. */
    internal?: boolean
}

/** The segmented switch: Threads {n} | Memos {n} 🔒 | RAID {n} 🔒. Arrow keys move between its tabs. */
export function DiscussionsSwitch({
    value,
    onChange,
    options,
    idFor,
    panelIdFor,
}: {
    value: DiscussionsSubTab
    onChange: (next: DiscussionsSubTab) => void
    options: DiscussionsSwitchOption[]
    idFor: (id: DiscussionsSubTab) => string
    /** The panel a tab controls, when it's in the page. */
    panelIdFor: (id: DiscussionsSubTab) => string | undefined
}) {
    const refs = useRef<Partial<Record<DiscussionsSubTab, HTMLButtonElement | null>>>({})
    const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
        const n = options.length
        const to = e.key === 'ArrowRight' ? (index + 1) % n
            : e.key === 'ArrowLeft' ? (index - 1 + n) % n
            : e.key === 'Home' ? 0
            : e.key === 'End' ? n - 1
            : null
        if (to === null) return
        e.preventDefault()
        onChange(options[to].id)
        refs.current[options[to].id]?.focus()
    }
    return (
        <div role="tablist" aria-label="Discussions" className="inline-flex shrink-0 overflow-hidden rounded-control border border-line-strong">
            {options.map((o, i) => {
                const selected = value === o.id
                return (
                    <button
                        key={o.id}
                        ref={(el) => { refs.current[o.id] = el }}
                        type="button"
                        role="tab"
                        id={idFor(o.id)}
                        aria-selected={selected}
                        aria-controls={panelIdFor(o.id)}
                        tabIndex={selected ? 0 : -1}
                        onClick={() => onChange(o.id)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={cn(
                            'inline-flex h-7 items-center gap-1.5 px-3 text-small font-medium transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action/30',
                            i > 0 && 'border-l border-line-strong',
                            selected ? 'bg-surface-selected text-fg' : 'bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg',
                        )}
                    >
                        {o.label}
                        {o.count != null && o.count > 0 ? <span className="tabular-nums text-fg-subtle">{o.count}</span> : null}
                        {o.internal && <AccessLock label={INTERNAL_ONLY_LABEL} />}
                    </button>
                )
            })}
        </div>
    )
}

/**
 * Discussions with the switch: the bar (switch, then the shown sub-tab's own controls) over the
 * sub-tab's panel. Threads is always in the page; Memos and RAID are added the first time they're
 * shown and kept after, hidden, so going back finds them as they were. No RAID option while `raid`
 * is absent.
 */
export function DiscussionsSubTabs({
    value,
    onChange,
    counts,
    threads,
    memos,
    raid,
}: {
    value: DiscussionsSubTab
    onChange: (next: DiscussionsSubTab) => void
    counts: { threads?: number | null; memos?: number | null; raid?: number | null }
    threads: ReactNode
    memos: ReactNode
    /** RAID's body, rendered once RAID is first shown. */
    raid?: (() => ReactNode) | null
}) {
    const baseId = useId()
    const [slot, setSlot] = useState<HTMLElement | null>(null)
    const [visited, setVisited] = useState<Set<DiscussionsSubTab>>(() => new Set<DiscussionsSubTab>(['threads', value]))
    useEffect(() => {
        setVisited((prev) => (prev.has(value) ? prev : new Set(prev).add(value)))
    }, [value])
    const mounted = (id: DiscussionsSubTab) => id === value || visited.has(id)

    const options: DiscussionsSwitchOption[] = [
        { id: 'threads', label: 'Threads', count: counts.threads },
        { id: 'memos', label: 'Memos', count: counts.memos, internal: true },
        ...(raid ? [{ id: 'raid' as const, label: 'RAID', count: counts.raid, internal: true }] : []),
    ]
    const tabId = (id: DiscussionsSubTab) => `${baseId}-tab-${id}`
    const panelId = (id: DiscussionsSubTab) => `${baseId}-panel-${id}`

    const panel = (id: DiscussionsSubTab, body: ReactNode) => mounted(id) && (
        <div key={id} role="tabpanel" id={panelId(id)} aria-labelledby={tabId(id)} hidden={value !== id}>
            <PanelContext.Provider value={{ active: value === id, slot }}>{body}</PanelContext.Provider>
        </div>
    )

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <DiscussionsSwitch
                    value={value}
                    onChange={onChange}
                    options={options}
                    idFor={tabId}
                    panelIdFor={(id) => (mounted(id) ? panelId(id) : undefined)}
                />
                {/* The shown sub-tab's own controls land here (DiscussionsBarPortal), on the same row. */}
                <div ref={setSlot} className="contents" />
            </div>
            {panel('threads', threads)}
            {panel('memos', memos)}
            {raid && mounted('raid') && panel('raid', raid())}
        </div>
    )
}
