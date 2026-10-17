'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarDays, CheckCircle, Eye, ListTodo, PackageCheck, PackagePlus, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoDeliverable, DeliverableStatus, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { DemoDeliverablePane } from '@/components/demo/demo-deliverable-pane'
import { prettyName } from '@/lib/demo/demo-summary'
import { useRightPane } from '@/lib/right-pane-context'

type BoardStatus = DeliverableStatus

/** The real board's lane palette (engagement-shares-tab.tsx): a tag-colored chip on a plain header. */
const LANE_THEME: Record<BoardStatus, { chipBg: string; chipFg: string; progress: string }> = {
    to_do: { chipBg: 'bg-tag-gray-bg', chipFg: 'text-tag-gray-fg', progress: 'var(--ui-tag-gray-fg)' },
    in_progress: { chipBg: 'bg-tag-blue-bg', chipFg: 'text-tag-blue-fg', progress: 'var(--ui-tag-blue-fg)' },
    in_review: { chipBg: 'bg-tag-yellow-bg', chipFg: 'text-tag-yellow-fg', progress: 'var(--ui-tag-yellow-fg)' },
    approved: { chipBg: 'bg-tag-green-bg', chipFg: 'text-tag-green-fg', progress: 'var(--ui-tag-green-fg)' },
}

const LANES: { status: BoardStatus; label: string; icon: typeof ListTodo }[] = [
    { status: 'to_do', label: 'To Do', icon: ListTodo },
    { status: 'in_progress', label: 'In Progress', icon: PenLine },
    { status: 'in_review', label: 'In Review', icon: Eye },
    { status: 'approved', label: 'Approved', icon: CheckCircle },
]

const formatDue = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function BoardCard({ card, open, onToggle }: { card: DemoDeliverable; open: boolean; onToggle: () => void }) {
    const theme = LANE_THEME[card.status]
    const approved = card.status === 'approved'
    const initials = card.actor.split(' ').map((p) => p[0]).join('')
    const done = approved ? card.fileCount : Math.max(1, Math.floor(card.fileCount * 0.5))
    const Icon = approved ? PackageCheck : PackagePlus

    return (
        <button
            type="button"
            onClick={onToggle}
            className={cn(
                'relative w-full overflow-hidden rounded-card border bg-surface text-left transition-colors hover:border-line-strong',
                open ? 'border-fg-subtle' : 'border-line',
            )}
        >
            <div className={cn('flex items-center gap-2.5 border-b px-3 pb-2 pt-2.5', approved ? 'border-action/10 bg-action/5' : 'border-line bg-surface-subtle')}>
                <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded', theme.chipBg)}>
                    <Icon className={cn('h-4 w-4', theme.chipFg)} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="mb-0.5 font-mono text-[11px] font-bold tracking-wide text-fg-subtle">{card.folder.docId}</div>
                    <div className="truncate text-small font-medium text-fg-muted">{card.folder.name.replace(/_+/g, ' ').trim()}</div>
                </div>
            </div>
            <div className="space-y-1.5 px-3 pb-3 pt-2">
                <div className="flex items-center justify-between gap-2">
                    <span className={cn('inline-flex items-center gap-1 text-caption', card.dueDate ? 'text-fg-muted' : 'italic text-fg-subtle')}>
                        <CalendarDays className="h-3.5 w-3.5 text-fg-subtle" />
                        {card.dueDate ? formatDue(card.dueDate) : 'Not set'}
                    </span>
                    <span className="flex min-w-0 items-center gap-1">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[8px] font-semibold text-fg-muted">{initials}</span>
                        <span className="truncate text-caption text-fg-muted">{card.actor}</span>
                    </span>
                </div>
                {card.fileCount > 0 && (
                    <div className="flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
                            <div className="h-full rounded-full" style={{ width: `${Math.round((done / card.fileCount) * 100)}%`, backgroundColor: theme.progress }} />
                        </div>
                        <span className="shrink-0 text-caption tabular-nums text-fg-subtle">{done}/{card.fileCount}</span>
                    </div>
                )}
            </div>
        </button>
    )
}

/**
 * Static counterpart to the real Board tab (EngagementSharesTab in board view): the same plain lane
 * headers, gray lane bodies and hairline cards. Deliverables are the engagement's actual folders,
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
        rightPane.setHeaderIcon(card.status === 'approved' ? <PackageCheck className="h-4 w-4" /> : <PackagePlus className="h-4 w-4" />)
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
            <div className="grid min-h-[360px] items-start gap-4" style={{ gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))' }}>
                {LANES.map((lane) => {
                    const theme = LANE_THEME[lane.status]
                    const laneCards = byLane[lane.status]
                    const lanePct = total > 0 ? (laneCards.length / total) * 100 : 0
                    const LaneIcon = lane.icon
                    return (
                        <div key={lane.status} className="flex flex-col">
                            <div className="flex shrink-0 flex-col overflow-hidden">
                                <div className="flex items-center gap-2 px-1 py-2">
                                    <div className={cn('rounded p-1', theme.chipBg)}>
                                        <LaneIcon className={cn('h-3.5 w-3.5', theme.chipFg)} />
                                    </div>
                                    <span className="text-ui font-medium text-fg">{lane.label}</span>
                                    <span className="ml-0.5 text-small tabular-nums text-fg-subtle">
                                        {total > 0 ? `${laneCards.length}/${total}` : laneCards.length}
                                    </span>
                                </div>
                                <div className="h-0.5 shrink-0 rounded-full bg-surface-muted">
                                    <div className="h-full transition-all duration-300" style={{ width: `${lanePct}%`, backgroundColor: theme.progress }} />
                                </div>
                            </div>
                            <div className="mt-1 flex flex-col gap-1.5 rounded-card bg-surface-subtle p-1.5">
                                {laneCards.map((c) => (
                                    <BoardCard
                                        key={c.folder.id}
                                        card={c}
                                        open={selected === c.folder.id}
                                        onToggle={() => (selected === c.folder.id ? closeCard() : openCard(c))}
                                    />
                                ))}
                                {laneCards.length === 0 && (
                                    <div className="flex h-[120px] items-center justify-center rounded-card border border-dashed border-line text-caption text-fg-subtle">
                                        Nothing here yet
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

        </div>
    )
}
