'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Eye, ListTodo, PackageCheck, PackagePlus, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DemoEngagement } from '@/lib/demo/static-demo-data'
import { DemoDeliverable, DeliverableStatus, getDemoDeliverables } from '@/lib/demo/demo-deliverables'
import { DemoDeliverablePane } from '@/components/demo/demo-deliverable-pane'

type BoardStatus = DeliverableStatus

const LANE_THEME: Record<BoardStatus, {
    headerBg: string; headerBorder: string
    iconBg: string; iconColor: string
    labelColor: string; countBg: string; countColor: string
    progressColor: string; cardIconBg: string; cardIconColor: string
}> = {
    to_do: {
        headerBg: 'bg-[#fdf3e0]', headerBorder: 'border-[#f5e2b8]',
        iconBg: 'bg-[#f3b52f]', iconColor: 'text-white',
        labelColor: 'text-[#9a6b12]', countBg: 'bg-[#f9e6bd]', countColor: 'text-[#9a6b12]',
        progressColor: '#f3b52f', cardIconBg: 'bg-[#fdf3e0]', cardIconColor: 'text-[#c8891a]',
    },
    in_progress: {
        headerBg: 'bg-[#e7edff]', headerBorder: 'border-[#c9d7ff]',
        iconBg: 'bg-[#3b5bfd]', iconColor: 'text-white',
        labelColor: 'text-[#2a3fb0]', countBg: 'bg-[#d3ddff]', countColor: 'text-[#2a3fb0]',
        progressColor: '#3b5bfd', cardIconBg: 'bg-[#e7edff]', cardIconColor: 'text-[#3b5bfd]',
    },
    in_review: {
        headerBg: 'bg-[#f1eaff]', headerBorder: 'border-[#ddd0ff]',
        iconBg: 'bg-[#7c3aed]', iconColor: 'text-white',
        labelColor: 'text-[#5b21b6]', countBg: 'bg-[#e2d4ff]', countColor: 'text-[#5b21b6]',
        progressColor: '#7c3aed', cardIconBg: 'bg-[#f1eaff]', cardIconColor: 'text-[#7c3aed]',
    },
    approved: {
        headerBg: 'bg-[#e2f6ea]', headerBorder: 'border-[#bfe9d1]',
        iconBg: 'bg-[#0d9f5f]', iconColor: 'text-white',
        labelColor: 'text-[#0d6b41]', countBg: 'bg-[#c7ecd8]', countColor: 'text-[#0d6b41]',
        progressColor: '#0d9f5f', cardIconBg: 'bg-[#e2f6ea]', cardIconColor: 'text-[#0d9f5f]',
    },
}

const LANES: { status: BoardStatus; label: string; icon: React.ReactNode }[] = [
    { status: 'to_do', label: 'To Do', icon: <ListTodo className="h-3.5 w-3.5 text-white" /> },
    { status: 'in_progress', label: 'In Progress', icon: <PenLine className="h-3.5 w-3.5 text-white" /> },
    { status: 'in_review', label: 'In Review', icon: <Eye className="h-3.5 w-3.5 text-white" /> },
    { status: 'approved', label: 'Approved', icon: <CheckCircle className="h-3.5 w-3.5 text-white" /> },
]

type BoardCard = DemoDeliverable

/** Static counterpart to the real Board tab (EngagementSharesTab in board view) — deliverables are the engagement's actual folders, status cycled deterministically, file counts are real. Clicking a card opens the deliverable detail pane, matching the real right-pane pattern. */
export function DemoEngagementBoard({ engagement }: { engagement: DemoEngagement }) {
    const [selected, setSelected] = useState<string | null>(null)

    const cards: BoardCard[] = getDemoDeliverables(engagement)

    const total = cards.length
    const byLane: Record<BoardStatus, BoardCard[]> = { to_do: [], in_progress: [], in_review: [], approved: [] }
    cards.forEach((c) => byLane[c.status].push(c))

    const selectedCard = cards.find((c) => c.folder.id === selected) ?? null

    return (
        <div className="flex h-full bg-white border border-[#e5e7eb] rounded overflow-hidden">
            <div className="flex-1 min-w-0 p-4 overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-4 gap-4">
                    {LANES.map((lane) => {
                        const theme = LANE_THEME[lane.status]
                        const laneCards = byLane[lane.status]
                        const lanePct = total > 0 ? (laneCards.length / total) * 100 : 0
                        return (
                            <div key={lane.status} className="flex flex-col gap-2">
                                <div className={cn('flex flex-col rounded border overflow-hidden shrink-0', theme.headerBg, theme.headerBorder)}>
                                    <div className="flex items-center gap-2 px-3 py-2.5">
                                        <div className={cn('rounded p-1', theme.iconBg)}>{lane.icon}</div>
                                        <span className={cn('text-xs font-semibold', theme.labelColor)}>{lane.label}</span>
                                        <span className={cn('text-[11px] ml-0.5 tabular-nums px-1.5 py-0.5 rounded font-medium', theme.countBg, theme.countColor)}>
                                            {laneCards.length}/{total}
                                        </span>
                                    </div>
                                    <div className="h-1 bg-black/5 shrink-0">
                                        <div className="h-full transition-all" style={{ width: `${lanePct}%`, backgroundColor: theme.progressColor }} />
                                    </div>
                                </div>
                                <div className="flex flex-col rounded bg-[#f9f9fb] p-3 gap-2.5 min-h-[120px]">
                                    {laneCards.map((c) => {
                                        const theme2 = LANE_THEME[c.status]
                                        const initials = c.actor.split(' ').map((p) => p[0]).join('')
                                        const done = c.status === 'approved' ? c.fileCount : Math.max(1, Math.floor(c.fileCount * 0.5))
                                        return (
                                            <div
                                                key={c.folder.id}
                                                onClick={() => setSelected(selected === c.folder.id ? null : c.folder.id)}
                                                className={cn('cursor-pointer rounded ring-2 transition-all', selected === c.folder.id ? 'ring-primary' : 'ring-transparent hover:ring-gray-200')}
                                            >
                                                <div className={cn('rounded border overflow-hidden', c.status === 'approved' ? 'bg-[#0d9f5f]/[0.04] border-[#0d9f5f]/20' : 'bg-white border-[#e5e7eb]')}>
                                                    <div className={cn('border-b', c.status === 'approved' ? 'border-[#0d9f5f]/10 bg-[#0d9f5f]/[0.06]' : 'border-[#f1f1f3] bg-[#fdfdfe]')}>
                                                        <div className="flex items-center gap-2.5 px-3 pt-2.5 pb-2">
                                                            <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded', theme2.cardIconBg)}>
                                                                {c.status === 'approved'
                                                                    ? <PackageCheck className={cn('h-4 w-4', theme2.cardIconColor)} />
                                                                    : <PackagePlus className={cn('h-4 w-4', theme2.cardIconColor)} />
                                                                }
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <span className="truncate text-[11px] font-medium text-[#5b5d64] block">
                                                                    {c.folder.name.replace(/_+/g, ' ').trim()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="px-3 pb-2.5 pt-2 flex flex-col gap-1.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[10px] font-medium text-[#6b6d75] w-14 shrink-0">Updated by</span>
                                                            <div className="flex items-center gap-1">
                                                                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                                                    <span className="text-[8px] font-bold text-primary">{initials}</span>
                                                                </div>
                                                                <span className="text-[11px] text-[#45474c] truncate">{c.actor}</span>
                                                            </div>
                                                        </div>
                                                        {c.fileCount > 0 && (
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 h-1 rounded-full bg-[#e5e7eb] overflow-hidden">
                                                                    <div className="h-full rounded-full" style={{ width: `${Math.round((done / c.fileCount) * 100)}%`, backgroundColor: theme2.progressColor }} />
                                                                </div>
                                                                <span className="text-[9px] font-semibold text-[#6b6d75] tabular-nums shrink-0">{done}/{c.fileCount}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {selectedCard && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-y-0 right-0 z-[100] p-4">
                    <div className="h-full w-[400px] flex flex-col bg-white rounded-sm border border-[#e5e7eb] shadow-xl overflow-hidden">
                        <DemoDeliverablePane deliverable={selectedCard} onClose={() => setSelected(null)} />
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
