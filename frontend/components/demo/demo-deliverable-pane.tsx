'use client'

import { useState } from 'react'
import { CalendarClock, ChevronDown, Info, MessagesSquare, Settings as SettingsIcon, XSquare } from 'lucide-react'
import { DeliverableIcon } from '@/components/ui/deliverable-icon'
import { DocumentIcon } from '@/components/ui/document-icon'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { StatusPill } from '@/components/ui/status-pill'
import { STAGE_BAR_CLASSES, STATUS, type LaneStage } from '@/lib/ui/status'
import { DemoFolder } from '@/lib/demo/static-demo-data'
import { DemoDeliverable, demoDocumentStages, demoFilesIn, type DemoDocumentStage } from '@/lib/demo/demo-deliverables'
import { BlockedTag } from '@/components/files/blocked-tag'
import { Hint } from '@/components/ui/tooltip'
import { DemoDeliverableComments } from './demo-deliverable-comments'

const MIME_BY_TYPE: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    md: 'text/markdown',
    sheet: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    slide: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

type Tab = 'details' | 'comments' | 'delivery'
const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'details', label: 'Details', icon: Info },
    { id: 'comments', label: 'Comments', icon: MessagesSquare },
    { id: 'delivery', label: 'Settings', icon: SettingsIcon },
]

function collectSubtasks(folder: DemoFolder): { id: string; docId: string; name: string; type: string }[] {
    return demoFilesIn(folder).map((f) => ({ id: f.id, docId: f.docId, name: f.name, type: f.type }))
}

/** One of the deliverable's documents: its ID, name, stage and (the firm's own) Blocked tag. */
function SubtaskLine({ subtask, stage }: { subtask: { id: string; docId: string; name: string; type: string }; stage?: DemoDocumentStage }) {
    return (
        <div className="group py-2 px-4 hover:bg-[#f9f9fb] transition-colors">
            <div className="flex items-center gap-2.5">
                <DocumentIcon mimeType={MIME_BY_TYPE[subtask.type] ?? 'application/octet-stream'} className="h-3.5 w-3.5 shrink-0" size={14} />
                <span className="font-mono text-xs font-bold text-[#45474c] shrink-0">{subtask.docId}</span>
                <span className="flex-1 min-w-0 truncate text-xs text-[#1b1b1d]">{subtask.name}</span>
                {stage?.blocked && <BlockedTag blocked={stage.blocked} />}
                {stage && <StatusPill kind="deliverable" status={stage.stage} className="shrink-0" />}
            </div>
        </div>
    )
}

/** Static counterpart to deliverable-detail-panel.tsx, docked the same way layout-right-panel.tsx renders its 'small'/'medium' pane. Details is real (the folder's files as subtasks); Comments works on screen, with @ and # (demo-deliverable-comments.tsx); Settings is inert. */
export function DemoDeliverablePane({ deliverable, onClose, embedded = false }: {
    deliverable: DemoDeliverable
    onClose?: () => void
    /** Inside the docked right pane (the tour Board): its header (ID, name, close) is the pane's own. */
    embedded?: boolean
}) {
    const [activeTab, setActiveTab] = useState<Tab>('details')
    const [showNotStarted, setShowNotStarted] = useState(false)
    const subtasks = collectSubtasks(deliverable.folder)
    // As in the app's pane: the documents on the Board are the work, Not started ones wait under their own line.
    const stages = demoDocumentStages(deliverable.status, demoFilesIn(deliverable.folder))
    const onBoard = subtasks.filter((s) => stages[s.id]?.stage !== 'not_started')
    const notStarted = subtasks.filter((s) => stages[s.id]?.stage === 'not_started')
    const approvedCount = onBoard.filter((s) => stages[s.id]?.stage === 'approved').length
    const pct = onBoard.length > 0 ? Math.round((approvedCount / onBoard.length) * 100) : 0

    const dueLabel = (() => {
        if (!deliverable.dueDate) return null
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const due = new Date(deliverable.dueDate); due.setHours(0, 0, 0, 0)
        const days = Math.round((due.getTime() - today.getTime()) / 86400000)
        const formatted = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        if (deliverable.status === 'approved') return { text: formatted, color: 'text-[#45474c]' }
        if (days < 0) return { text: `${formatted} · ${Math.abs(days)}d overdue`, color: 'text-red-600' }
        if (days <= 3) return { text: `${formatted} · Due in ${days}d`, color: 'text-amber-600' }
        return { text: `${formatted} · Due in ${days}d`, color: 'text-[#45474c]' }
    })()

    return (
        <div className={cn('flex flex-col overflow-hidden bg-white', embedded ? 'min-h-0 flex-1' : 'h-full')}>
            {/* Header — matches layout-right-panel.tsx docked pane header; the docked pane has its own */}
            {!embedded && (<header className="flex items-center justify-between gap-2 px-4 h-[52px] border-b border-[#e5e7eb] bg-white shrink-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-sm bg-primary/10 flex items-center justify-center text-primary shrink-0">
                        <DeliverableIcon />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="font-headline text-sm font-bold text-[#1b1b1d] truncate">{deliverable.folder.docId}</h2>
                        <p className="text-[10px] text-[#45474c] truncate min-w-0">{deliverable.folder.name.replace(/_+/g, ' ').trim()}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="h-8 w-8 rounded-sm text-[#45474c] hover:text-[#1b1b1d] bg-[#f4f4f5] hover:bg-[#e9e9eb] inline-flex items-center justify-center shrink-0"
                >
                    <XSquare className="h-4 w-4" />
                </button>
            </header>)}

            {/* Stage badge row */}
            <div className="px-4 py-2.5 border-b border-[#e5e7eb] flex items-center justify-between gap-2">
                {/* The stage in the status language, the same pill as on the Board; it follows the documents */}
                <Hint label="Follows its documents">
                    <span className="inline-flex"><StatusPill kind="deliverable" status={deliverable.status} /></span>
                </Hint>
                {dueLabel && (
                    <span className={cn('inline-flex items-center gap-1.5 h-9 px-2.5 rounded border border-[#e5e7eb] bg-white text-xs font-medium', dueLabel.color)}>
                        <CalendarClock className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {dueLabel.text}
                    </span>
                )}
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-[#e5e7eb] shrink-0">
                {TABS.map((tab) => (
                    <Tooltip key={tab.id}>
                        <TooltipTrigger asChild>
                            <button
                                type="button"
                                onClick={() => tab.id !== 'delivery' && setActiveTab(tab.id)}
                                disabled={tab.id === 'delivery'}
                                className={cn(
                                    'inline-flex items-center px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-all',
                                    activeTab === tab.id
                                        ? 'border-primary text-[#1b1b1d] font-bold opacity-100'
                                        : tab.id === 'delivery'
                                            ? 'border-transparent text-[#c0c1c6] cursor-not-allowed opacity-50'
                                            : 'border-transparent text-[#45474c] opacity-60 hover:text-[#1b1b1d] hover:opacity-100'
                                )}
                            >
                                <tab.icon className="w-3.5 h-3.5 mr-1.5" />
                                {tab.label}
                            </button>
                        </TooltipTrigger>
                        {tab.id === 'delivery' && (
                            <TooltipContent side="bottom" className="text-xs">Not available in this demo</TooltipContent>
                        )}
                    </Tooltip>
                ))}
            </div>

            {/* Comments: the app's composer over sample comments, @ to mention and # to tag a document */}
            {activeTab === 'comments' && (
                <DemoDeliverableComments
                    documents={subtasks.map((s) => ({ id: s.id, docId: s.docId, name: s.name, mimeType: MIME_BY_TYPE[s.type] ?? 'application/octet-stream' }))}
                />
            )}

            {/* Details */}
            {activeTab === 'details' && <div className="flex-1 min-h-0 overflow-y-auto">
                <div className="divide-y divide-[#e5e7eb]">
                    <div className="px-4 py-4">
                        <div className="flex items-center gap-3 mb-3">
                            <label className="font-mono text-[9px] font-bold uppercase tracking-widest text-[#45474c] shrink-0">
                                Documents{onBoard.length > 0 ? ` · ${onBoard.length}` : ''}
                            </label>
                            {onBoard.length > 0 && (
                                <>
                                    <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                                        <div className={cn('h-full rounded-full transition-all duration-300', STAGE_BAR_CLASSES[STATUS.deliverable[deliverable.status].stage as LaneStage])} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-[10px] font-semibold text-[#9a9ba0] shrink-0 tabular-nums">
                                        {approvedCount}/{onBoard.length}
                                    </span>
                                </>
                            )}
                        </div>
                        {subtasks.length === 0 ? (
                            <p className="text-xs text-[#9a9ba0] py-1">No files in this deliverable yet</p>
                        ) : (
                            <>
                                <div className="divide-y divide-[#e5e7eb] -mx-4 border-t border-b border-[#e5e7eb] mt-2">
                                    {onBoard.map((s) => <SubtaskLine key={s.id} subtask={s} stage={stages[s.id]} />)}
                                </div>
                                {notStarted.length > 0 && (
                                    <div className="mt-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowNotStarted((v) => !v)}
                                            aria-expanded={showNotStarted}
                                            className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 -mx-1.5 text-small text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg-muted"
                                        >
                                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', !showNotStarted && '-rotate-90')} />
                                            {notStarted.length} not on the Board
                                        </button>
                                        {showNotStarted && (
                                            <div className="divide-y divide-[#e5e7eb] -mx-4 mt-1 border-t border-b border-[#e5e7eb]">
                                                {notStarted.map((s) => <SubtaskLine key={s.id} subtask={s} stage={stages[s.id]} />)}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>}
        </div>
    )
}
