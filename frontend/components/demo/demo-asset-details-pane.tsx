'use client'

import { useEffect, useRef, useState } from 'react'
import {
    Activity as ActivityIcon, Ban, CalendarClock, Check, CheckCircle2, CircleDot, Clock, FilePen, FilePlus2, FileType, History, Info, MessagesSquare, UserRound,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PropertyList, PropertyRow } from '@/components/ui/property-list'
import { PersonAvatar } from '@/components/ui/property-cells'
import { StatusPill } from '@/components/ui/status-pill'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/ui/tag'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { BlockedTag } from '@/components/files/blocked-tag'
import { MissingDueWarning } from '@/components/files/missing-due-warning'
import { ApprovalList } from '@/components/files/asset-details-pane'
import { DemoDeliverableComments, type DemoTaggableDocument } from '@/components/demo/demo-deliverable-comments'
import { BLOCKED_NOTE_MAX, BLOCKED_REASONS, BLOCKED_REASON_LABEL, type BlockedFlag } from '@/lib/files/blocked'
import { versionName, type ApprovalRecord } from '@/lib/files/approvals'
import { needsDueDate } from '@/lib/ui/due-date'
import { statusOf } from '@/lib/ui/status'
import type { ActivityStatus } from '@/lib/sharing-settings'
import type { DemoFile } from '@/lib/demo/static-demo-data'
import { cn, formatFileSize, formatFullDate } from '@/lib/utils'

/*
 * Static counterpart to the app's Details pane (components/files/asset-details-pane.tsx): the shared
 * fields first, then the Details, Versions, Activity and Discussions tabs. The Blocked flag and the
 * description change on screen only; versions are named as Google Drive names them, by when each was
 * saved. Discussions is the deliverable's thread, with this file's comments first.
 */

const TYPE_LABEL: Record<string, string> = {
    pdf: 'PDF', doc: 'Document', docx: 'Document', md: 'Markdown', sheet: 'Spreadsheet', xlsx: 'Spreadsheet',
    slide: 'Presentation', pptx: 'Presentation', png: 'Image', jpg: 'Image', jpeg: 'Image', zip: 'Archive',
}

const DAY = 86_400_000
const ME = { userId: 'demo', name: 'Demo User', email: null, avatarUrl: null, role: 'eng_admin' }

export interface DemoAssetDetails {
    file: DemoFile
    creator: string
    assignee: string | null
    stage: ActivityStatus | null
    dueDate: string | null
    blocked: BlockedFlag | null
    /** A document in a deliverable: the firm may mark it blocked. */
    canBlock: boolean
    /** The deliverable it's in, for Discussions; null outside one. */
    deliverable: { docId: string; name: string; documents: DemoTaggableDocument[] } | null
    /** When it was approved on the tour, if it was. */
    approvedAt: string | null
    onSetBlocked: (next: BlockedFlag | null) => void
}

export function DemoAssetDetailsPane({ file, creator, assignee, stage, dueDate, blocked: initialBlocked, canBlock, deliverable, approvedAt, onSetBlocked }: DemoAssetDetails) {
    const [blocked, setBlocked] = useState<BlockedFlag | null>(initialBlocked)
    const [note, setNote] = useState(initialBlocked?.note ?? '')
    const [description, setDescription] = useState(file.description ?? '')
    const [saved, setSaved] = useState(false)
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current) }, [])

    const modified = new Date(file.modifiedTime)
    const created = new Date(modified.getTime() - 9 * DAY)
    // Three saves, newest first: the current one, and two before it, as Drive lists them.
    const versions = [
        { id: 'v3', at: modified.toISOString(), who: creator, size: file.size, current: true },
        { id: 'v2', at: new Date(modified.getTime() - 3 * DAY).toISOString(), who: creator, size: Math.round(file.size * 0.96), current: false },
        { id: 'v1', at: created.toISOString(), who: creator, size: Math.round(file.size * 0.9), current: false },
    ]
    const approvals: ApprovalRecord[] = approvedAt
        ? [{ id: 'tour', version: { id: 'v3', savedAt: modified.toISOString() }, archived: { fileId: '', name: '' }, approvedAt, approvedBy: ME.userId }]
        : []

    const setFlag = (next: BlockedFlag | null) => {
        setBlocked(next)
        setNote(next?.note ?? '')
        onSetBlocked(next)
    }

    const activity = [
        ...(approvedAt ? [{ icon: CheckCircle2, who: 'You', what: 'approved this file', detail: versionName({ at: modified.toISOString() }), at: approvedAt }] : []),
        ...(blocked ? [{ icon: Ban, who: 'You', what: 'marked this file blocked', detail: BLOCKED_REASON_LABEL[blocked.reason] + (blocked.note ? ` · ${blocked.note}` : ''), at: new Date(modified.getTime() + 3_600_000).toISOString() }] : []),
        ...(stage && stage !== 'not_started' ? [{ icon: CircleDot, who: creator, what: 'changed the stage', detail: `Not started → ${statusOf('deliverable', stage).label}`, at: modified.toISOString() }] : []),
        { icon: FilePen, who: creator, what: 'updated this file', detail: undefined, at: new Date(modified.getTime() - 3 * DAY).toISOString() },
        { icon: FilePlus2, who: creator, what: 'added this file', detail: undefined, at: created.toISOString() },
    ]

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="shrink-0 px-4 py-2">
                <PropertyList>
                    <PropertyRow label="Status" icon={<CircleDot />}>
                        <span className="inline-flex h-7 items-center px-1.5">
                            {stage ? <StatusPill kind="deliverable" status={stage} /> : <span className="text-fg-subtle">—</span>}
                        </span>
                    </PropertyRow>
                    {canBlock && (
                        <PropertyRow label="Blocked" icon={<Ban />} data-demo-tour="details-blocked">
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button type="button" aria-label="Blocked" className="inline-flex h-7 items-center gap-1.5 rounded-control px-1.5 text-small text-fg-muted transition-colors hover:bg-surface-hover data-[state=open]:bg-surface-hover">
                                            {blocked ? <><BlockedTag blocked={blocked} /><span className="text-fg">{BLOCKED_REASON_LABEL[blocked.reason]}</span></> : <span className="text-fg-subtle">Not blocked</span>}
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-52">
                                        {BLOCKED_REASONS.map((reason) => (
                                            <DropdownMenuItem key={reason} onClick={() => { if (blocked?.reason !== reason) setFlag({ reason, ...(note.trim() ? { note: note.trim() } : {}), at: new Date().toISOString(), by: ME.userId }) }} className="flex cursor-pointer items-center gap-2">
                                                <Ban className="h-3.5 w-3.5 text-tag-red-fg" />
                                                {BLOCKED_REASON_LABEL[reason]}
                                                {blocked?.reason === reason && <Check className="ml-auto h-3.5 w-3.5 text-fg-muted" />}
                                            </DropdownMenuItem>
                                        ))}
                                        {blocked && (
                                            <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => setFlag(null)} className="cursor-pointer">Not blocked</DropdownMenuItem>
                                            </>
                                        )}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                                {blocked && (
                                    <Input
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        onBlur={() => { if (note.trim() !== (blocked.note ?? '')) setFlag({ ...blocked, note: note.trim() || undefined }) }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                        maxLength={BLOCKED_NOTE_MAX}
                                        placeholder="Add a note: what it waits on"
                                        aria-label="Blocked note"
                                        className="h-7 border-transparent bg-transparent px-1.5 text-small shadow-none hover:bg-surface-hover focus-visible:bg-surface"
                                    />
                                )}
                            </div>
                        </PropertyRow>
                    )}
                    <PropertyRow label="Assignee" icon={<UserRound />}>
                        {assignee
                            ? <span className="inline-flex h-7 items-center gap-1.5 px-1.5"><PersonAvatar person={{ name: assignee, avatarUrl: null }} size={18} /><span className="text-fg">{assignee}</span></span>
                            : <span className="inline-flex h-7 items-center px-1.5 text-fg-subtle">No assignee</span>}
                    </PropertyRow>
                    <PropertyRow label="Due" icon={<CalendarClock />}>
                        <span className={cn('inline-flex h-7 items-center px-1.5', !dueDate && 'text-fg-subtle')}>{dueDate ? formatFullDate(dueDate) : 'Not set'}</span>
                        {stage && needsDueDate(stage, dueDate) && <MissingDueWarning stage={stage} className="ml-1" />}
                    </PropertyRow>
                    <PropertyRow label="Created" icon={<FilePlus2 />}>
                        <span className="inline-flex h-7 items-center gap-1.5 px-1.5"><PersonAvatar person={{ name: creator, avatarUrl: null }} size={18} /><span className="text-fg">{creator}</span><span className="text-fg-subtle">· {formatFullDate(created.toISOString())}</span></span>
                    </PropertyRow>
                    <PropertyRow label="Modified" icon={<FilePen />}>
                        <span className="inline-flex h-7 items-center gap-1.5 px-1.5"><PersonAvatar person={{ name: creator, avatarUrl: null }} size={18} /><span className="text-fg">{creator}</span><span className="text-fg-subtle">· {formatFullDate(file.modifiedTime)}</span></span>
                    </PropertyRow>
                    <PropertyRow label="Type" icon={<FileType />}>
                        <span className="inline-flex h-7 items-center gap-1.5 px-1.5">{TYPE_LABEL[file.type] ?? 'File'}<span className="text-fg-subtle">·</span><span className="text-fg-muted">{formatFileSize(file.size)}</span></span>
                    </PropertyRow>
                </PropertyList>
            </div>

            <Tabs defaultValue="details" className="flex min-h-0 flex-1 flex-col">
                <TabsList className="flex w-full shrink-0 gap-4 px-4" data-demo-tour="details-tabs">
                    {([['details', 'Details', Info], ['versions', 'Versions', History], ['activity', 'Activity', ActivityIcon], ['discussions', 'Discussions', MessagesSquare]] as const).map(([value, label, Icon]) => (
                        <TabsTrigger key={value} value={value} className="gap-1.5">
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="details" className="mt-0 min-h-0 flex-1 overflow-y-auto">
                    <div className="px-4 py-4">
                        <div className="mb-1.5 flex items-center gap-1.5 text-small font-medium text-fg-muted">
                            Description
                            {saved && <span className="inline-flex items-center gap-1 text-caption font-normal text-fg-subtle"><Check className="h-3 w-3 text-action" />Saved</span>}
                        </div>
                        <Textarea
                            value={description}
                            onChange={(e) => {
                                setDescription(e.target.value)
                                setSaved(false)
                                if (savedTimer.current) clearTimeout(savedTimer.current)
                                savedTimer.current = setTimeout(() => setSaved(true), 800)
                            }}
                            placeholder="What is this file for?"
                            className="-mx-2 min-h-[72px] w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 py-1.5 text-ui shadow-none hover:bg-surface-hover focus-visible:bg-surface"
                        />
                    </div>
                    {approvals.length > 0 && (
                        <div className="px-4 py-4">
                            <div className="mb-1.5 text-small font-medium text-fg-muted">Approvals</div>
                            <ApprovalList approvals={approvals} members={[ME]} />
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="versions" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                    <ol className="ml-1.5 border-l border-line">
                        {versions.map((v) => (
                            <li key={v.id} className="relative pb-4 pl-5 last:pb-0">
                                <span aria-hidden className={cn('absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border', v.current ? 'border-action bg-action' : 'border-line bg-surface')} />
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium tabular-nums text-fg">{versionName({ at: v.at })}</span>
                                    {v.current && <Tag color="green">Current</Tag>}
                                    {v.current && approvedAt && <Tag color="green">Approved</Tag>}
                                </div>
                                <p className="mt-0.5 truncate text-caption text-fg-muted">{v.who} · {formatFileSize(v.size)}</p>
                            </li>
                        ))}
                    </ol>
                </TabsContent>

                <TabsContent value="activity" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4">
                    <ol className="space-y-3">
                        {activity.map((a, i) => (
                            <li key={i} className="flex items-start gap-2.5">
                                <a.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden />
                                <div className="min-w-0">
                                    <p className="text-small text-fg"><span className="font-medium">{a.who}</span> {a.what}</p>
                                    {a.detail && <p className="text-caption text-fg-muted">{a.detail}</p>}
                                </div>
                                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-caption text-fg-subtle"><Clock className="h-3 w-3" />{formatFullDate(a.at)}</span>
                            </li>
                        ))}
                    </ol>
                </TabsContent>

                <TabsContent value="discussions" className="mt-0 flex min-h-0 flex-1 flex-col">
                    {deliverable ? (
                        <>
                            <p className="shrink-0 px-4 pt-3 text-caption text-fg-subtle">Discussed in its deliverable: {deliverable.docId} · {deliverable.name}</p>
                            <DemoDeliverableComments documents={deliverable.documents} focusDocId={file.docId} initialDraft={`#${file.docId} `} />
                        </>
                    ) : (
                        <p className="p-4 text-small text-fg-muted">
                            This file isn&apos;t in a deliverable. Discuss it in one by tagging it there: <span className="font-mono text-fg">#{file.docId}</span>
                        </p>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}
