'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Ban, CalendarDays, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { cn } from '@/lib/utils'
import { StatusIcon } from '@/components/ui/status-icon'
import { StatusPill } from '@/components/ui/status-pill'
import { interactiveCardClass } from '@/components/ui/interactive-card'
import { STAGE_BAR_CLASSES, STAGE_LANE_CLASSES, STATUS, type LaneStage } from '@/lib/ui/status'
import { DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoDeliverable, DeliverableStatus, demoDocumentStages, demoFilesIn, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { BlockedCountChip } from '@/components/files/blocked-tag'
import { DemoDeliverablePane } from '@/components/demo/demo-deliverable-pane'
import { prettyName } from '@/lib/demo/demo-summary'
import { useRightPane } from '@/lib/right-pane-context'

type BoardStatus = DeliverableStatus

/** The real Board's lanes (engagement-shares-tab.tsx): stage-tinted, with a StatusPill header. */
const LANES: { status: BoardStatus; stage: LaneStage }[] = (['to_do', 'in_progress', 'in_review', 'approved'] as const)
    .map((status) => ({ status, stage: STATUS.deliverable[status].stage as LaneStage }))

const formatDue = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Its documents the firm marked blocked, as the app's shares route sends them to firm roles. */
const blockedDocumentsOf = (card: DemoDeliverable) => {
    const files = demoFilesIn(card.folder)
    const stages = demoDocumentStages(card.status, files)
    return files.flatMap((f) => {
        const flag = stages[f.id]?.blocked
        return flag ? [{ documentId: f.id, docId: f.docId, fileName: f.name, reason: flag.reason }] : []
    })
}

/** As on the app's card: overdue is a red date, not a status, and approved work is never overdue. */
const isOverdue = (card: DemoDeliverable) =>
    !!card.dueDate && card.status !== 'approved' && new Date(`${card.dueDate}T23:59:59`).getTime() < Date.now()

/** The app's Board toolbar toggle (engagement-shares-tab.tsx): outlined, red while on, with its count. */
function FilterToggle({ icon, label, count, on, onClick }: { icon: React.ReactNode; label: string; count: number; on: boolean; onClick: () => void }) {
    return (
        <Button
            variant="outline"
            size="sm"
            onClick={onClick}
            aria-pressed={on}
            className={cn('h-8 gap-1.5 rounded border-line text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg [&_svg]:h-3 [&_svg]:w-3 [&_svg]:opacity-60', on ? 'border-red-300 bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-50 hover:text-red-700' : 'bg-white')}
        >
            {icon}
            {label}
            {count > 0 && (
                <span className={cn('ml-0.5 rounded-sm px-1 py-px text-[10px] font-semibold tabular-nums', on ? 'bg-red-200/70 text-red-900' : 'bg-surface-muted text-fg-muted')}>
                    {count}
                </span>
            )}
        </Button>
    )
}

function BoardCard({ card, stage, open, onToggle }: { card: DemoDeliverable; stage: LaneStage; open: boolean; onToggle: () => void }) {
    const initials = card.actor.split(' ').map((p) => p[0]).join('')
    // As on the app's card: progress over the documents on the Board, and the blocked ones named.
    const files = demoFilesIn(card.folder)
    const stages = demoDocumentStages(card.status, files)
    const onBoard = files.filter((f) => stages[f.id]?.stage !== 'not_started')
    const done = onBoard.filter((f) => stages[f.id]?.stage === 'approved').length
    const blocked = blockedDocumentsOf(card)
    const overdue = isOverdue(card)

    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(interactiveCardClass(), 'relative w-full overflow-hidden', open && 'ring-1 ring-fg-subtle')}
            // The guided tour's card: one in progress, with documents at different stages.
            data-demo-tour={card.status === 'in_progress' ? 'board-card' : undefined}
        >
            <div className="border-b border-line px-3 pb-2 pt-2.5">
                <div className="mb-0.5 flex items-center gap-1.5">
                    <StatusIcon stage={stage} size={13} label={STATUS.deliverable[card.status].label} />
                    <span className="font-mono text-[11px] text-fg-subtle">{card.folder.docId}</span>
                </div>
                <div className="truncate text-ui font-medium text-fg">{card.folder.name.replace(/_+/g, ' ').trim()}</div>
            </div>
            <div className="space-y-1.5 px-3 pb-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={cn('inline-flex items-center gap-1 text-small', overdue ? 'text-danger' : card.dueDate ? 'text-fg-muted' : 'text-fg-subtle')}>
                        <CalendarDays className={cn('h-3.5 w-3.5', overdue ? 'text-danger' : 'text-fg-subtle')} />
                        {card.dueDate ? formatDue(card.dueDate) : 'No due date'}
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[8px] font-semibold text-fg-muted">{initials}</span>
                        <span className="truncate text-caption text-fg-muted">{card.actor}</span>
                    </span>
                </div>
                {/* As on the app's card: always there, so the cards in a lane are one height */}
                <div className="flex h-5 items-center gap-2">
                    <BlockedCountChip documents={blocked} />
                    {onBoard.length > 0 ? (
                        <>
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                                <div className={cn('h-full rounded-full', STAGE_BAR_CLASSES[stage])} style={{ width: `${Math.round((done / onBoard.length) * 100)}%` }} />
                            </div>
                            <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{done}/{onBoard.length}</span>
                        </>
                    ) : (
                        <span className="text-caption text-fg-subtle">No documents on the Board yet</span>
                    )}
                </div>
            </div>
        </button>
    )
}

/**
 * Static counterpart to the real Board tab (EngagementSharesTab in board view): the same
 * stage-tinted lanes sized to their cards, StatusPill headers and shadowed cards. Deliverables are the engagement's actual folders,
 * status cycled deterministically, file counts are real. Clicking a card opens the deliverable
 * detail pane, matching the real right-pane pattern.
 */
export function DemoEngagementBoard({ engagement }: { engagement: DemoEngagement }) {
    const [selected, setSelected] = useState<string | null>(null)

    // A deliverable opens in the docked right pane, as on the app's Board (engagement-shares-tab):
    // its ID as the title, its name below, half the width.
    const rightPane = useRightPane()
    const openIdRef = useRef<string | null>(null)
    const clearPaneRef = useRef(rightPane.clearPane)
    useEffect(() => { clearPaneRef.current = rightPane.clearPane }, [rightPane.clearPane])
    const openCard = (card: DemoDeliverable) => {
        setSelected(card.folder.id)
        openIdRef.current = card.folder.id
        rightPane.setTitle(card.folder.docId)
        rightPane.setHeaderSubtitle(prettyName(card.folder.name))
        rightPane.setHeaderIcon(<DeliverableIcon />)
        rightPane.setIconTooltip('Deliverable')
        rightPane.setHeaderActions(null)
        rightPane.setPaneSize('medium')
        rightPane.setContent(<DemoDeliverablePane deliverable={card} embedded />)
    }
    const closeCard = () => {
        setSelected(null)
        openIdRef.current = null
        rightPane.clearPane()
    }
    // Closed from the pane's own ×: drop the card's highlight.
    useEffect(() => {
        if (!rightPane.content) {
            setSelected(null)
            openIdRef.current = null
        }
    }, [rightPane.content])
    // Leaving the Board takes its pane with it.
    useEffect(() => () => {
        if (openIdRef.current) clearPaneRef.current()
    }, [])

    // The guided tour opens a card by URL (?deliverable=, .claude/plans/tour-chapters.md); when the
    // parameter goes away (the tour steps back), the card it opened closes.
    const deliverableParam = useSearchParams().get('deliverable')
    const openedFromUrl = useRef(false)
    useEffect(() => {
        const card = deliverableParam ? getDemoDeliverables(engagement).find((c) => c.folder.id === deliverableParam) : undefined
        if (card) {
            openedFromUrl.current = true
            openCard(card)
        } else if (openedFromUrl.current) {
            openedFromUrl.current = false
            closeCard()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deliverableParam])

    // As on the app's Board: Overdue, and Blocked (deliverables with a document the firm marked blocked;
    // shown while there are some, or while it's on, so it can be turned off).
    const [filterOverdue, setFilterOverdue] = useState(false)
    const [filterBlocked, setFilterBlocked] = useState(false)
    const allCards = getDemoDeliverables(engagement)
    const overdueCount = allCards.filter(isOverdue).length
    const blockedCount = allCards.filter((c) => blockedDocumentsOf(c).length > 0).length
    const cards = allCards.filter((c) => (!filterOverdue || isOverdue(c)) && (!filterBlocked || blockedDocumentsOf(c).length > 0))
    const byLane: Record<BoardStatus, DemoDeliverable[]> = { to_do: [], in_progress: [], in_review: [], approved: [] }
    cards.forEach((c) => byLane[c.status].push(c))

    return (
        <div className="flex flex-col">
            <div className="flex shrink-0 items-center gap-2 pb-2.5 pt-1" data-demo-tour="board-filters">
                <FilterToggle icon={<Clock />} label="Overdue" count={overdueCount} on={filterOverdue} onClick={() => setFilterOverdue((v) => !v)} />
                {(blockedCount > 0 || filterBlocked) && (
                    <FilterToggle icon={<Ban />} label="Blocked" count={blockedCount} on={filterBlocked} onClick={() => setFilterBlocked((v) => !v)} />
                )}
            </div>
            <div className="subtle-scrollbar overflow-x-auto pb-1">
                <div className="grid min-h-[360px] items-start gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))' }}>
                    {LANES.map((lane) => {
                        const laneCards = byLane[lane.status]
                        return (
                            <div
                                key={lane.status}
                                className={cn('flex flex-col gap-2 rounded-lg p-2', STAGE_LANE_CLASSES[lane.stage].rest)}
                                data-demo-tour={lane.status === 'approved' ? 'board-lane-approved' : undefined}
                            >
                                <div className="flex h-7 items-center gap-2 px-1">
                                    <StatusPill kind="deliverable" status={lane.status} />
                                    <span className="text-small tabular-nums text-fg-subtle">{laneCards.length}</span>
                                </div>
                                {laneCards.map((c) => (
                                    <BoardCard
                                        key={c.folder.id}
                                        card={c}
                                        stage={lane.stage}
                                        open={selected === c.folder.id}
                                        onToggle={() => (selected === c.folder.id ? closeCard() : openCard(c))}
                                    />
                                ))}
                                {laneCards.length === 0 && <p className="px-1 pb-1 text-small text-fg-subtle">{filterOverdue || filterBlocked ? 'No matches' : 'No deliverables'}</p>}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
