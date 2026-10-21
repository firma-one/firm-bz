'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { cn } from '@/lib/utils'
import { StatusIcon } from '@/components/ui/status-icon'
import { StatusPill } from '@/components/ui/status-pill'
import { interactiveCardClass } from '@/components/ui/interactive-card'
import { STAGE_BAR_CLASSES, STAGE_LANE_CLASSES, STATUS, type LaneStage } from '@/lib/ui/status'
import { DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoDeliverable, DeliverableStatus, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { DemoDeliverablePane } from '@/components/demo/demo-deliverable-pane'
import { prettyName } from '@/lib/demo/demo-summary'
import { useRightPane } from '@/lib/right-pane-context'

type BoardStatus = DeliverableStatus

/** The real Board's lanes (engagement-shares-tab.tsx): stage-tinted, with a StatusPill header. */
const LANES: { status: BoardStatus; stage: LaneStage }[] = (['to_do', 'in_progress', 'in_review', 'approved'] as const)
    .map((status) => ({ status, stage: STATUS.deliverable[status].stage as LaneStage }))

const formatDue = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function BoardCard({ card, stage, open, onToggle }: { card: DemoDeliverable; stage: LaneStage; open: boolean; onToggle: () => void }) {
    const initials = card.actor.split(' ').map((p) => p[0]).join('')
    const approved = card.status === 'approved'
    const done = approved ? card.fileCount : Math.max(1, Math.floor(card.fileCount * 0.5))
    // As on the app's card: overdue is a red date, not a status.
    const overdue = !!card.dueDate && !approved && new Date(`${card.dueDate}T23:59:59`).getTime() < Date.now()

    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(interactiveCardClass(), 'relative w-full overflow-hidden', open && 'ring-1 ring-fg-subtle')}
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
                {card.fileCount > 0 && (
                    <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                            <div className={cn('h-full rounded-full', STAGE_BAR_CLASSES[stage])} style={{ width: `${Math.round((done / card.fileCount) * 100)}%` }} />
                        </div>
                        <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{done}/{card.fileCount}</span>
                    </div>
                )}
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

    const cards = getDemoDeliverables(engagement)
    const total = cards.length
    const byLane: Record<BoardStatus, DemoDeliverable[]> = { to_do: [], in_progress: [], in_review: [], approved: [] }
    cards.forEach((c) => byLane[c.status].push(c))

    return (
        <div className="subtle-scrollbar overflow-x-auto pb-1">
            <div className="grid min-h-[360px] items-start gap-3" style={{ gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))' }}>
                {LANES.map((lane) => {
                    const laneCards = byLane[lane.status]
                    return (
                        <div key={lane.status} className={cn('flex flex-col gap-2 rounded-lg p-2', STAGE_LANE_CLASSES[lane.stage].rest)}>
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
                            {laneCards.length === 0 && <p className="px-1 pb-1 text-small text-fg-subtle">No deliverables</p>}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
